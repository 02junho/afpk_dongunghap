-- 돈궁합 RLS. schema.sql 적용 후 실행한다.
--
-- 전제 (docs/00 §다음 할 일 3번):
--   · 부부는 Supabase **익명 로그인**(anonymous sign-in)으로 들어온다. /c/join 에서 커플 코드를
--     검증한 뒤 그 익명 uid 를 members.auth_user_id 에 연결한다. 코드만으로는 auth.uid() 가 없어
--     RLS를 걸 수 없다. 사용자 체감은 '코드 6자리 입력' 그대로다.
--   · 설계사는 이메일 로그인. planners.auth_user_id 로 연결한다.
--   · 판정은 **서버에서만** 한다 (service_role). 그래서 부부에게 answers select 를 열지 않아도 된다.
--     부부는 judgments 만 읽는다. 이것이 '블라인드'를 클라이언트 선의가 아니라 DB로 보장하는 방법이다.
--
-- 주의: service_role 키로 하는 접근은 RLS를 우회한다. 서버(api/judge)에서만 쓴다.

alter table planners      enable row level security;
alter table couples       enable row level security;
alter table members       enable row level security;
alter table cards         enable row level security;
alter table card_versions enable row level security;
alter table plan_documents enable row level security;
alter table rounds        enable row level security;
alter table answers       enable row level security;
alter table judgments     enable row level security;
alter table disputes      enable row level security;
alter table notifications enable row level security;

-- 내가 속한 커플 (부부용)
create or replace function my_couple_id() returns uuid language sql stable security definer as $$
  select couple_id from members where auth_user_id = auth.uid() limit 1
$$;
-- 내 member 행 (부부용)
create or replace function my_member_id() returns uuid language sql stable security definer as $$
  select id from members where auth_user_id = auth.uid() limit 1
$$;
-- 내가 담당하는 커플인가 (설계사용)
create or replace function is_my_client(c uuid) returns boolean language sql stable security definer as $$
  select exists (
    select 1 from couples co join planners p on p.id = co.planner_id
    where co.id = c and p.auth_user_id = auth.uid()
  )
$$;

-- ── 설계사 ───────────────────────────────────────────────────────────────
create policy planner_self on planners for select using (auth_user_id = auth.uid());

create policy couples_planner_all on couples for all
  using (is_my_client(id)) with check (planner_id in (select id from planners where auth_user_id = auth.uid()));
create policy couples_member_read on couples for select using (id = my_couple_id());

create policy members_planner_all on members for all
  using (is_my_client(couple_id)) with check (is_my_client(couple_id));
-- 부부는 같은 커플의 member 행을 읽을 수 있다 (상대 표시 이름이 필요하다). 답변은 여기 없다.
create policy members_read on members for select using (couple_id = my_couple_id());
-- 부부가 members 를 직접 update 하는 경로는 없다 (정책 없음). 연결은 아래 join_couple RPC 로만.

-- 커플 코드로 커플을 찾는 것은 RPC 로만 허용한다 (테이블 전체 스캔을 열지 않는다).
-- /c/join 은 이 함수만 호출한다: 코드 + 역할 → 내 익명 uid 연결.
create or replace function join_couple(code text, want_role member_role)
returns uuid language plpgsql security definer as $$
declare cid uuid; mid uuid;
begin
  select id into cid from couples where invite_code = code;
  if cid is null then raise exception '코드를 찾을 수 없습니다'; end if;
  select id into mid from members where couple_id = cid and role = want_role;
  if mid is null then raise exception '역할이 없습니다'; end if;
  update members set auth_user_id = auth.uid()
    where id = mid and (auth_user_id is null or auth_user_id = auth.uid());
  if not found then raise exception '이미 다른 기기가 연결되어 있습니다'; end if;
  return cid;
end $$;
revoke all on function join_couple(text, member_role) from public;
grant execute on function join_couple(text, member_role) to authenticated, anon;

-- ── 카드 ─────────────────────────────────────────────────────────────────
create policy cards_planner_all on cards for all
  using (is_my_client(couple_id)) with check (is_my_client(couple_id));
create policy cards_member_read on cards for select using (couple_id = my_couple_id());

create policy cv_planner_all on card_versions for all
  using (is_my_client((select couple_id from cards where id = card_id)))
  with check (is_my_client((select couple_id from cards where id = card_id)));
-- 부부는 **활성 버전과, 지금 묻고 있는 버전**만 본다 (설계사의 미공개 초안은 안 보인다)
create policy cv_member_read on card_versions for select using (
  (select couple_id from cards where id = card_id) = my_couple_id()
  and (activated_at is not null
       or exists (select 1 from rounds r where r.couple_id = my_couple_id() and card_version_id = any (r.card_version_ids)))
);

create policy docs_planner_all on plan_documents for all
  using (is_my_client(couple_id)) with check (is_my_client(couple_id));

-- ── 라운드 ───────────────────────────────────────────────────────────────
create policy rounds_planner_all on rounds for all
  using (is_my_client(couple_id)) with check (is_my_client(couple_id));
create policy rounds_member_read on rounds for select using (couple_id = my_couple_id());

-- ── 답변: 핵심. 자기 것만 넣고, 자기 것만 본다. 끝까지 상대 답변을 못 읽는다. ──
-- 상대 답변은 결과 화면에서 judgments 에 담겨 내려온다 (서버가 판정 후 함께 기록).
create policy answers_insert_own on answers for insert
  with check (member_id = my_member_id());
create policy answers_select_own on answers for select
  using (member_id = my_member_id());
-- 설계사도 원문은 큐에서만 필요하다. 서버가 judgments 에 스냅샷을 남기므로 select 를 열지 않는다.
-- (원문 열람이 필요하다고 판단되면 아래 한 줄을 켠다. 켜는 순간 '설계사는 답변을 못 고친다'만 남는다)
-- create policy answers_planner_read on answers for select
--   using (is_my_client((select couple_id from rounds where id = round_id)));

-- ── 판정 ─────────────────────────────────────────────────────────────────
-- 쓰기는 service_role 전용 (정책 없음 = 아무도 못 씀). 서버만 기록한다.
create policy judgments_member_read on judgments for select
  using ((select couple_id from rounds where id = round_id) = my_couple_id());
create policy judgments_planner_read on judgments for select
  using (is_my_client((select couple_id from rounds where id = round_id)));
create policy judgments_planner_resolve on judgments for update
  using (is_my_client((select couple_id from rounds where id = round_id)))
  with check (is_my_client((select couple_id from rounds where id = round_id)));

-- ── 이의 제기 ────────────────────────────────────────────────────────────
create policy disputes_insert_own on disputes for insert with check (member_id = my_member_id());
create policy disputes_read_own on disputes for select using (member_id = my_member_id());
create policy disputes_planner_read on disputes for select using (
  is_my_client((select r.couple_id from judgments j join rounds r on r.id = j.round_id where j.id = judgment_id))
);

-- ── 알림 ─────────────────────────────────────────────────────────────────
create policy notif_own on notifications for select using (member_id = my_member_id());
create policy notif_push_update on notifications for update
  using (member_id = my_member_id()) with check (member_id = my_member_id());

-- 확인용:
--   set role authenticated; select set_config('request.jwt.claims', '{"sub":"<익명uid>"}', true);
--   select count(*) from answers;  -- 자기 답변 수만 나와야 한다
