-- 2026-10-27: 부부 지우기(보관). 기록은 지우지 않는다 — archived_at 이 찍힌 부부는 설계사 목록과 입장에서 빠진다.
-- Supabase → SQL Editor 에 붙여 넣고 Run. 기존 데이터는 바뀌지 않는다. 두 번 실행해도 된다.
alter table couples add column if not exists archived_at timestamptz;

-- 지운 부부의 코드로는 입장할 수 없다
create or replace function join_couple(code text, want_role member_role)
returns uuid language plpgsql security definer as $$
declare cid uuid; mid uuid;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다'; end if;
  select id into cid from couples where invite_code = code and archived_at is null;
  if cid is null then raise exception '코드를 찾을 수 없습니다'; end if;
  select id into mid from members where couple_id = cid and role = want_role;
  if mid is null then raise exception '역할이 없습니다'; end if;
  update members set auth_user_id = null where auth_user_id = auth.uid() and id <> mid; -- 이전 역할 해제
  update members set auth_user_id = auth.uid() where id = mid;
  return cid;
end $$;
revoke all on function join_couple(text, member_role) from public;
grant execute on function join_couple(text, member_role) to authenticated, anon;
