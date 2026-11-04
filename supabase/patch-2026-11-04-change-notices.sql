-- 2026-11-04: 부부가 먼저 알리는 변화 ("바뀐 게 있어요"). Supabase SQL Editor 에서 한 번 실행한다. 다시 실행해도 된다.
--
-- 팀장님 질문(docs/16): 고객이 엑셀을 직접 고치게 하자 → 하지 않는다. 계획(전제)은 설계사만 바꾼다.
-- 대신 부부 한 사람이 [내 설계]에서 "바뀐 게 있어요"로 알리면 설계사 처리 대기에 올라간다.
--   · 자기 것만 넣고, 자기 것만 본다. 배우자는 못 본다 (answers 와 같은 원칙, 10.14 팀 결정)
--   · 판정하지 않는다 — 한 사람만 말한 것이라 셋을 비교할 수 없다. AI 도 쓰지 않는다
--   · 고치거나 지울 수 없다. 설계사가 처리한 표시(resolved_*)만 서버가 붙인다

create table if not exists change_notices (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid references couples(id) not null,
  member_id uuid references members(id) not null,
  card_version_id uuid references card_versions(id) not null,   -- 알릴 때 보고 있던 계획(활성 버전)
  text text not null check (length(text) between 1 and 500),
  is_condition boolean not null default false,                 -- 시점을 날짜 대신 조건으로 적었나
  created_at timestamptz default now(),
  resolved_at timestamptz,
  resolution resolution,                                       -- factcheck = 두 분께 같이 묻기로 함
  resolution_note text,
  constraint notice_resolution_needs_time check ((resolved_at is null) = (resolution is null))
);

alter table change_notices enable row level security;

drop policy if exists notices_insert_own on change_notices;
create policy notices_insert_own on change_notices for insert
  with check (
    member_id = my_member_id() and couple_id = my_couple_id()
    and (select c.couple_id from card_versions v join cards c on c.id = v.card_id where v.id = card_version_id) = my_couple_id()
  );
drop policy if exists notices_select_own on change_notices;
create policy notices_select_own on change_notices for select using (member_id = my_member_id());
-- update · delete 정책 없음: 부부는 고치지 못한다. 설계사 처리는 서버(service_role)로만.

-- 내용은 고치지 못하고 지우지도 못한다 (RLS 설정 실수로도 뚫리지 않게)
create or replace function change_notices_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'change_notices 는 지울 수 없습니다 (이력 보존)'; end if;
  if (new.couple_id, new.member_id, new.card_version_id, new.text, new.is_condition, new.created_at)
     is distinct from (old.couple_id, old.member_id, old.card_version_id, old.text, old.is_condition, old.created_at) then
    raise exception '부부가 알린 내용은 고칠 수 없습니다';
  end if;
  return new;
end $$;
drop trigger if exists change_notices_append_only on change_notices;
create trigger change_notices_append_only before update or delete on change_notices
  for each row execute function change_notices_guard();

-- 확인: select count(*) from change_notices;  -- 0 이 나오면 끝
