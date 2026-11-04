-- 폰 알림 (11.04). SQL Editor 에서 한 번 실행한다. 다시 실행해도 괜찮다.
-- 어느 기기에 알림을 보낼지(브라우저가 준 주소와 열쇠)를 저장한다.
--   부부: member_id — 그 사람 폰에만 보낸다 (배우자 폰에는 가지 않는다)
--   설계사: for_planner — 설계사 코드로 들어와 "알림 받기"를 누른 기기
-- 브라우저에서 직접 읽고 쓰지 않는다. 서버(api/push.ts, service_role)만 쓴다 → 정책 없이 RLS 만 켠다.

create table if not exists push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  member_id   uuid references members(id) on delete cascade,
  for_planner boolean not null default false,
  created_at  timestamptz not null default now(),
  check (member_id is not null or for_planner)
);
create index if not exists push_subscriptions_member on push_subscriptions(member_id);

alter table push_subscriptions enable row level security;
-- 정책 없음 = anon · authenticated 는 아무것도 못 한다. service_role 만.
