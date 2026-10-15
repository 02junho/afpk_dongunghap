-- 돈궁합 RLS. schema.sql 적용 후 실행한다.
--
-- 전제 (docs/00 §다음 할 일):
--   · 부부는 Supabase **익명 로그인**(anonymous sign-in)으로 들어온다. /c/join 에서 입장 코드를
--     검증한 뒤 그 익명 uid 를 members.auth_user_id 에 연결한다. 코드만으로는 auth.uid() 가 없어
--     RLS를 걸 수 없다. 사용자 체감은 '코드 6자리 입력' 그대로다.
--   · 설계사는 이메일 로그인. planners.auth_user_id 로 연결한다.
--   · 판정은 **서버에서만** 한다 (service_role). 부부는 answers 도 judgments 도 읽지 않는다 —
--     10.14 팀 결정("앱은 듣고, 설계사가 말한다")이 그대로 정책이 된다. 블라인드가 클라이언트 선의가
--     아니라 DB로 보장된다.
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
-- 내 planner 행 (설계사용)
create or replace function my_planner_id() returns uuid language sql stable security definer as $$
  select id from planners where auth_user_id = auth.uid() limit 1
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
  using (is_my_client(id)) with check (planner_id = my_planner_id());
create policy couples_member_read on couples for select using (id = my_couple_id());

create policy members_planner_all on members for all
  using (is_my_client(couple_id)) with check (is_my_client(couple_id));
-- 부부는 같은 커플의 member 행을 읽을 수 있다 (상대 이름·진행 상태가 필요하다). 답변은 여기 없다.
create policy members_read on members for select using (couple_id = my_couple_id());
-- 부부가 members 를 직접 update 하는 경로는 없다 (정책 없음). 연결은 아래 join_couple RPC 로만.

-- 입장 코드로 커플을 찾는 것은 RPC 로만 허용한다 (테이블 전체 스캔을 열지 않는다).
-- /c/join 은 이 함수만 호출한다: 코드 + 역할 → 내 익명 uid 연결.
-- 기기를 바꾸거나 같은 기기에서 역할을 바꿔도 다시 연결된다. 익명 uid 는 앱을 지우면 바뀌므로
-- "이미 연결됨"으로 막으면 부부가 다시 못 들어온다. 데모 범위: 입장 코드를 아는 사람 = 그 사람.
create or replace function join_couple(code text, want_role member_role)
returns uuid language plpgsql security definer as $$
declare cid uuid; mid uuid;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다'; end if;
  select id into cid from couples where invite_code = code;
  if cid is null then raise exception '코드를 찾을 수 없습니다'; end if;
  select id into mid from members where couple_id = cid and role = want_role;
  if mid is null then raise exception '역할이 없습니다'; end if;
  update members set auth_user_id = null where auth_user_id = auth.uid() and id <> mid; -- 이전 역할 해제
  update members set auth_user_id = auth.uid() where id = mid;
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
-- 부부는 **활성 버전과, 지금 묻고 있는 버전**만 본다 (설계사의 미공개 초안은 안 보인다).
-- [내 설계] 탭 = 활성 버전. factcheck 라운드 = 지금 묻고 있는 버전.
create policy cv_member_read on card_versions for select using (
  (select couple_id from cards where id = card_id) = my_couple_id()
  and (activated_at is not null
       or exists (select 1 from rounds r where r.couple_id = my_couple_id() and card_versions.id = any (r.card_version_ids)))
);

create policy docs_planner_all on plan_documents for all
  using (is_my_client(couple_id)) with check (is_my_client(couple_id));

-- ── 라운드 ───────────────────────────────────────────────────────────────
create policy rounds_planner_all on rounds for all
  using (is_my_client(couple_id)) with check (is_my_client(couple_id));
create policy rounds_member_read on rounds for select using (couple_id = my_couple_id());

-- ── 답변: 핵심. 자기 것만 넣고, 자기 것만 본다. 끝까지 상대 답변을 못 읽는다. ──
-- 대기 화면의 "지우님 1문항 남음"은 answers 의 **개수**만 필요하다 → count 전용 RPC 로 준다.
create policy answers_insert_own on answers for insert
  with check (member_id = my_member_id());
create policy answers_select_own on answers for select
  using (member_id = my_member_id());
-- 설계사도 원문은 judgments 의 스냅샷(a_text/b_text)으로 본다. answers 를 직접 열지 않는다.

create or replace function round_progress(rid uuid)
returns table (role member_role, answered int) language sql stable security definer as $$
  select m.role, count(a.id)::int
  from members m
  left join answers a on a.member_id = m.id and a.round_id = rid
  where m.couple_id = my_couple_id()
    and exists (select 1 from rounds r where r.id = rid and r.couple_id = my_couple_id())
  group by m.role
$$;
grant execute on function round_progress(uuid) to authenticated, anon;

-- ── 판정: 부부는 읽지 않는다 (정책 없음). 설계사만. 쓰기는 service_role 전용. ──
create policy judgments_planner_read on judgments for select
  using (is_my_client((select couple_id from rounds where id = round_id)));
create policy judgments_planner_resolve on judgments for update
  using (is_my_client((select couple_id from rounds where id = round_id)))
  with check (is_my_client((select couple_id from rounds where id = round_id)));

-- ── "이건 같은 뜻이에요": 설계사가 누른다 ─────────────────────────────────
create policy disputes_planner_insert on disputes for insert
  with check (planner_id = my_planner_id()
    and is_my_client((select r.couple_id from judgments j join rounds r on r.id = j.round_id where j.id = judgment_id)));
create policy disputes_planner_read on disputes for select
  using (is_my_client((select r.couple_id from judgments j join rounds r on r.id = j.round_id where j.id = judgment_id)));

-- ── 알림 ─────────────────────────────────────────────────────────────────
create policy notif_own on notifications for select using (member_id = my_member_id());
create policy notif_push_update on notifications for update
  using (member_id = my_member_id()) with check (member_id = my_member_id());

-- 확인용:
--   set role authenticated; select set_config('request.jwt.claims', '{"sub":"<익명uid>"}', true);
--   select count(*) from answers;     -- 자기 답변 수만
--   select count(*) from judgments;   -- 0 이어야 한다 (부부는 판정을 못 본다)
