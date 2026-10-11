-- 돈궁합 스키마. docs/03_설계사_갱신흐름.md 와 같이 읽을 것.
-- 원칙: 카드는 정체성, 값은 버전. 삭제 없음. 부부 답변은 설계사가 수정 불가.

create extension if not exists "pgcrypto";

create type card_type as enum ('number','date','choice','text');
create type verdict as enum ('green','yellow','red');
create type red_kind as enum ('couple_conflict','plan_stale');
create type round_status as enum ('open','judged','closed');
create type round_kind as enum ('baseline','regular','event','reconfirm');
create type member_role as enum ('husband','wife');

create table planners (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,          -- supabase auth
  name text not null,
  created_at timestamptz default now()
);

create table couples (
  id uuid primary key default gen_random_uuid(),
  planner_id uuid references planners(id),
  invite_code char(6) unique not null,
  label text,                        -- '김현우·박지우'
  created_at timestamptz default now()
);

create table members (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid references couples(id) not null,
  auth_user_id uuid unique,
  role member_role not null,
  display_name text,
  push_subscription jsonb,           -- Web Push
  unique (couple_id, role)
);

-- 정체성. 값은 card_versions.
create table cards (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid references couples(id) not null,
  key text not null,                 -- 'home_when'
  type card_type not null,
  archived_at timestamptz,
  created_at timestamptz default now(),
  unique (couple_id, key)
);

create table card_versions (
  id uuid primary key default gen_random_uuid(),
  card_id uuid references cards(id) not null,
  version int not null,
  label text not null,
  question text not null,
  planned_value text not null,       -- number는 원 단위 문자열, date는 'YYYY-MM'
  tolerance numeric,
  options text[],
  stake text not null,
  reason text not null,              -- 왜 바꿨는가. v1은 '최초 설정'
  created_by uuid references planners(id),
  created_at timestamptz default now(),
  -- 부부 재합의로 active 된 시각. null이면 아직 재합의 전.
  activated_at timestamptz,
  unique (card_id, version)
);

-- 참고 문서. 앱은 읽지 않는다.
create table plan_documents (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid references couples(id) not null,
  version int not null,
  storage_path text not null,
  uploaded_by uuid references planners(id),
  created_at timestamptz default now()
);

create table rounds (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid references couples(id) not null,
  kind round_kind not null,
  status round_status not null default 'open',
  card_version_ids uuid[] not null,  -- 이 라운드가 묻는 카드 버전들
  opened_at timestamptz default now(),
  judged_at timestamptz
);

create table answers (
  id uuid primary key default gen_random_uuid(),
  round_id uuid references rounds(id) not null,
  card_version_id uuid references card_versions(id) not null,
  member_id uuid references members(id) not null,
  text text not null,
  submitted_at timestamptz default now(),
  unique (round_id, card_version_id, member_id)
);

create table judgments (
  id uuid primary key default gen_random_uuid(),
  round_id uuid references rounds(id) not null,
  card_version_id uuid references card_versions(id) not null,
  verdict verdict not null,
  red_kind red_kind,
  a_vs_plan text not null,
  b_vs_plan text not null,
  ab_agree boolean not null,
  reason text,
  method text not null,              -- 'deterministic' | 'llm'
  prompt_version text,               -- llm일 때. 부록 3번 추적용
  model text,
  planner_summary text,              -- 🔴일 때 AI 3줄 요약
  resolved_at timestamptz,           -- 설계사가 처리한 시각
  created_at timestamptz default now(),
  unique (round_id, card_version_id)
);

-- "이건 같은 뜻이에요"
create table disputes (
  id uuid primary key default gen_random_uuid(),
  judgment_id uuid references judgments(id) not null,
  member_id uuid references members(id) not null,
  note text,
  created_at timestamptz default now()
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references members(id) not null,
  kind text not null,                -- 'round_open' | 'card_changed' | 'result'
  payload jsonb,
  sent_at timestamptz,
  created_at timestamptz default now()
);

-- 현재 활성 버전 뷰
create view active_cards as
select c.id as card_id, c.couple_id, c.key, c.type, cv.*
from cards c
join lateral (
  select * from card_versions v where v.card_id = c.id and v.activated_at is not null
  order by v.version desc limit 1
) cv on true
where c.archived_at is null;

-- RLS는 2주차에. 지금은 메모만:
--   members: 본인 couple_id 행만. answers: 본인 member_id만 insert, 같은 round의 상대 답변은 round.status='judged' 이후에만 select.
--   planners: 자기 couples 하위 전부 select/insert. answers는 select만.
