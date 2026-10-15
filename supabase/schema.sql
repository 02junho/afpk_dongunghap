-- 돈궁합 스키마. docs/03_설계사_갱신흐름.md 와 같이 읽을 것.
-- 원칙: 카드는 정체성, 값은 버전. 삭제 없음. 부부 답변은 누구도 수정 불가.
--       부부는 판정·상대 답을 보지 않는다 (10.14 팀 결정) — 결과는 설계사만 읽는다.
-- RLS는 supabase/rls.sql. 적용 순서: schema.sql → rls.sql → seed.sql

create extension if not exists "pgcrypto";

create type card_type as enum ('number','date','choice','text');
create type card_category as enum ('housing','income','children','family','saving','insurance','retire','tax');
create type number_unit as enum ('krw','age','count','percent');
create type verdict as enum ('green','yellow','red');
-- repeated_yellow = 같은 카드가 2회 연속 🟡 → 승격 (docs/03 §갱신 없이 끝나는 경우)
create type red_kind as enum ('couple_conflict','plan_stale','repeated_yellow');
create type round_status as enum ('open','judged','closed');
-- factcheck = 설계사가 🔴 카드 하나를 두 분께 다시 묻는 라운드. 재합의와 같은 장치 (10.14).
create type round_kind as enum ('baseline','regular','event','factcheck');
create type member_role as enum ('husband','wife');
-- 설계사가 큐에서 건을 닫은 이유. 버튼 그대로다:
--   factcheck      [두 분께 먼저 묻기]  → factcheck 라운드 생성
--   consult        [상담 때 다루기]     → 앱 밖 안건
--   false_positive [이건 같은 뜻이에요] → AI 오판. golden set 최고 품질 소스 (전문가 라벨)
create type resolution as enum ('factcheck','consult','false_positive');

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
  -- 익명 로그인(supabase anonymous sign-in)으로 받은 uid. /c/join 에서 코드 검증 후 연결한다.
  -- RLS가 auth.uid() 로 동작하려면 이 값이 반드시 채워져야 한다. docs/00 §다음 할 일.
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
  category card_category not null,   -- 큰 묶음 8개. 팀이 정한다 (docs/01)
  unit number_unit,                  -- type='number' 일 때만. 없으면 'krw'
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
  tolerance numeric,                 -- number: 비율(0.05) / date: 개월(6)
  options text[],
  stake text not null,
  -- date 카드에서 "정확한 시점 대신 조건으로" 답하는 것을 허용할지
  allow_condition boolean not null default false,
  reason text not null,              -- 왜 바꿨는가. v1은 '최초 설정'
  created_by uuid references planners(id),
  created_at timestamptz default now(),
  -- 부부가 이 버전에 동의(0회차 또는 factcheck 라운드 완료)한 시각.
  -- null = 아직 전제가 아니다. 설계사가 저장만 한 상태.
  activated_at timestamptz,
  unique (card_id, version)
);

-- 참고 문서. 앱은 읽지 않는다. (docs/03 의 "설계안 버전" = 이 테이블의 version)
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
  -- date 카드에 '조건으로' 답했는가 (예: "애 낳고 나서"). 판정에서 unparsed → 🟡 + needs_review
  is_condition boolean not null default false,
  submitted_at timestamptz default now(),
  unique (round_id, card_version_id, member_id)
);

create table judgments (
  id uuid primary key default gen_random_uuid(),
  round_id uuid references rounds(id) not null,
  card_version_id uuid references card_versions(id) not null,
  verdict verdict not null,
  red_kind red_kind,
  -- 'match' | 'minor' | 'major' | 'unparsed'. unparsed 를 minor 로 위조하지 않는다.
  a_vs_plan text not null check (a_vs_plan in ('match','minor','major','unparsed')),
  b_vs_plan text not null check (b_vs_plan in ('match','minor','major','unparsed')),
  ab_agree boolean not null,
  -- 판정 시점의 답변 스냅샷. 설계사 큐는 이걸 읽는다. answers 원본은 아무도 직접 읽지 않는다 (rls.sql).
  a_text text,
  b_text text,
  reason text,
  method text not null check (method in ('deterministic','llm')),
  prompt_version text,               -- llm일 때. 부록 3번 추적용
  model text,
  -- 🟡이지만 사람이 봐야 하는 건 (파싱 실패·조건부 답변) → 설계사 큐에 함께 올린다
  needs_review boolean not null default false,
  planner_summary text,              -- 🔴일 때 AI 3줄 요약 (AI 활용 2번)
  summary_prompt_version text,
  resolved_at timestamptz,           -- 설계사가 처리한 시각
  resolution resolution,             -- 어느 버튼으로 닫았나
  resolution_note text,
  created_at timestamptz default now(),
  unique (round_id, card_version_id),
  constraint resolution_needs_time check ((resolved_at is null) = (resolution is null))
);

-- "이건 같은 뜻이에요" — 부부는 판정을 보지 않으므로 **설계사**가 누른다 (전문가 라벨).
-- resolution='false_positive' 와 같은 사건이지만, 메모와 시각을 따로 남겨 eval 러너가 읽는다.
create table disputes (
  id uuid primary key default gen_random_uuid(),
  judgment_id uuid references judgments(id) not null,
  planner_id uuid references planners(id) not null,
  note text,
  -- 판정 당시의 method/verdict 스냅샷. 결정적 오탐은 파서 테스트 케이스가, llm 오탐은 golden 행이 된다.
  judgment_method text,
  judgment_verdict verdict,
  created_at timestamptz default now()
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references members(id) not null,
  kind text not null,                -- 'round_open' | 'card_changed' | 'factcheck'
  payload jsonb,
  sent_at timestamptz,
  created_at timestamptz default now()
);

-- 삭제 없음 / 답변 수정 없음을 DB에서 막는다. RLS 설정 실수로도 뚫리지 않게.
create or replace function block_write() returns trigger language plpgsql as $$
begin
  raise exception '% 는 수정·삭제할 수 없습니다 (이력 보존)', tg_table_name;
end $$;

create trigger answers_immutable before update or delete on answers
  for each row execute function block_write();
create trigger card_versions_no_delete before delete on card_versions
  for each row execute function block_write();

-- card_versions 는 활성화(activated_at)와 사유 외에는 고치지 못한다
create or replace function card_versions_guard() returns trigger language plpgsql as $$
begin
  if (new.card_id, new.version, new.planned_value, new.tolerance, new.stake)
     is distinct from (old.card_id, old.version, old.planned_value, old.tolerance, old.stake) then
    raise exception '카드 값은 덮어쓰지 않습니다. 새 버전을 추가하세요';
  end if;
  return new;
end $$;
create trigger card_versions_append_only before update on card_versions
  for each row execute function card_versions_guard();

-- 현재 활성 버전 (부부에게 묻는 전제. [내 설계] 탭도 이걸 읽는다)
-- cv.* 에 card_id 가 이미 있으므로 c.id 를 따로 뽑지 않는다 (중복 컬럼 오류)
create view active_cards as
select c.couple_id, c.key, c.type, c.category, c.unit, cv.*
from cards c
join lateral (
  select * from card_versions v where v.card_id = c.id and v.activated_at is not null
  order by v.version desc limit 1
) cv on true
where c.archived_at is null;

-- 최신 버전 (활성 여부 무관). 설계사 콘솔은 '저장했지만 아직 동의 전'인 버전도 봐야 한다.
create view latest_cards as
select c.couple_id, c.key, c.type, c.category, c.unit,
       cv.*, (cv.activated_at is null) as pending
from cards c
join lateral (
  select * from card_versions v where v.card_id = c.id
  order by v.version desc limit 1
) cv on true
where c.archived_at is null;

-- 카드별 판정 이력 (2연속 🟡 승격 판단용). card_version 이 아니라 card 기준으로 본다.
create view card_verdict_history as
select cv.card_id, c.couple_id, c.key, c.category, r.kind as round_kind, r.opened_at, j.*
from judgments j
join rounds r on r.id = j.round_id
join card_versions cv on cv.id = j.card_version_id
join cards c on c.id = cv.card_id;

-- 설계사 큐: 🔴 전부 + 사람이 봐야 하는 🟡. 처리된 건은 빠진다.
create view planner_queue as
select * from card_verdict_history
where resolved_at is null and (verdict = 'red' or needs_review);
