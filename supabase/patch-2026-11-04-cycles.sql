-- 6주 사이클 (11.04 새 방향, docs/21). SQL Editor 에서 한 번 실행한다. 다시 실행해도 괜찮다.
-- 지우는 명령은 없다. 표 하나와 칸 몇 개를 더할 뿐이다.
--
-- cycles: 부부마다 "사이클 시작한 날"을 둔다. n주차 = 시작한 날 + 7일 × (n-1) 에 그 주 테마 5문항이 열린다.
-- rounds 에 cycle_id · week · reminded_at 을 더한다 — 어느 사이클 몇 주차 질문인지, 독촉 알림을 보냈는지.

create table if not exists cycles (
  id                    uuid primary key default gen_random_uuid(),
  couple_id             uuid not null references couples(id) on delete cascade,
  started_at            timestamptz not null default now(),
  period_months         int not null default 3 check (period_months in (3, 6)),  -- 다음 사이클까지 (분기 / 반기)
  consult_requested_at  timestamptz,                                              -- 설계사가 "상담 요청"을 보낸 때
  closed_at             timestamptz,
  created_at            timestamptz not null default now()
);
create index if not exists cycles_couple on cycles(couple_id, started_at desc);

-- 부부 폰은 몇 주차인지 rounds.week 로 안다. cycles 는 서버(service_role)만 읽고 쓴다 → 정책 없이 RLS 만 켠다
alter table cycles enable row level security;

alter table rounds add column if not exists cycle_id    uuid references cycles(id);
alter table rounds add column if not exists week        int check (week between 1 and 6);
alter table rounds add column if not exists reminded_at timestamptz;
create unique index if not exists rounds_cycle_week on rounds(cycle_id, week) where cycle_id is not null;

-- 새 주제 6개는 기존 enum 값을 쓴다 (housing · children · retire · insurance · debt · saving). enum 은 바꾸지 않는다.
