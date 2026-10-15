-- join_couple: 기기를 바꾸거나 같은 기기에서 역할을 바꿔도 다시 연결되게 한다.
-- 왜: 익명 로그인은 탭/앱을 지우면 uid 가 바뀐다. "이미 다른 기기가 연결되어 있습니다"로 막으면
--     부부가 앱을 지웠다 깔기만 해도 다시 못 들어온다. 데모 범위에서는 "입장 코드를 아는 사람 = 그 사람"으로 둔다.
--     같은 기기(uid)가 다른 역할로 들어오면 이전 역할의 연결은 푼다 (unique 제약).
-- rls.sql 에도 반영돼 있다. 이미 적용된 DB 에는 이 파일만 돌린다.
create or replace function join_couple(code text, want_role member_role)
returns uuid language plpgsql security definer as $$
declare cid uuid; mid uuid;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다'; end if;
  select id into cid from couples where invite_code = code;
  if cid is null then raise exception '코드를 찾을 수 없습니다'; end if;
  select id into mid from members where couple_id = cid and role = want_role;
  if mid is null then raise exception '역할이 없습니다'; end if;
  -- 이 기기가 다른 역할에 묶여 있었다면 푼다
  update members set auth_user_id = null where auth_user_id = auth.uid() and id <> mid;
  update members set auth_user_id = auth.uid() where id = mid;
  return cid;
end $$;
