-- 2026-10-19 데이터 정리: 부부·라운드·답변·판정을 전부 지우고 데모 부부(남편 · 아내)만 시드 상태로 다시 만든다.
-- 설계사(planners) 행은 그대로 둔다. 스키마·RLS·함수는 건드리지 않는다.
-- Supabase → SQL Editor 에 붙여 넣고 Run. 한 트랜잭션이라 중간에 실패하면 아무것도 안 바뀐다.
--
-- answers·card_versions 는 DB 트리거가 삭제를 막는다(이력 보존). 이 스크립트 안에서만 잠깐 끄고 다시 켠다.
-- 이미 입장해 있던 폰은 다음에 열면 입장 화면으로 돌아간다 — 코드를 다시 넣으면 된다.

begin;

alter table answers disable trigger answers_immutable;
alter table card_versions disable trigger card_versions_no_delete;

delete from disputes;
delete from notifications;
delete from judgments;
delete from answers;
delete from rounds;
delete from card_versions;
delete from cards;
delete from plan_documents;
delete from members;
delete from couples;

alter table answers enable trigger answers_immutable;
alter table card_versions enable trigger card_versions_no_delete;

-- ── 데모 부부 다시 만들기 (supabase/seed.sql 에서 planners 줄만 뺀 것) ──
-- 데모용 시드. 데모 부부(남편 · 아내) + 카드 10장 v1. src/data/seed-cards.json 과 동일 내용.
-- schema.sql → rls.sql 다음에 실행. (service_role 또는 SQL Editor 에서)
--
-- activated_at 을 now() 로 박는 것은 **데모 단축**이다. 실제 흐름에서 v1 은
-- 0회차 라운드를 부부가 끝내야 활성화된다 (docs/03 §갱신 흐름).
insert into couples (id, planner_id, invite_code, label) values ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', '482913', '남편 · 아내');
insert into members (couple_id, role, display_name) values
  ('00000000-0000-0000-0000-000000000010', 'husband', '남편'),
  ('00000000-0000-0000-0000-000000000010', 'wife', '아내');

with c as (
  insert into cards (couple_id, key, type, category, unit) values
    ('00000000-0000-0000-0000-000000000010','home_when',  'date',   'housing',  null),
    ('00000000-0000-0000-0000-000000000010','home_price', 'number', 'housing',  'krw'),
    ('00000000-0000-0000-0000-000000000010','child_when', 'date',   'children', null),
    ('00000000-0000-0000-0000-000000000010','income',     'number', 'income',   'krw'),
    ('00000000-0000-0000-0000-000000000010','raise_plan', 'text',   'income',   null),
    ('00000000-0000-0000-0000-000000000010','family_help','text',   'family',   null),
    ('00000000-0000-0000-0000-000000000010','leave_who',  'choice', 'children', null),
    ('00000000-0000-0000-0000-000000000010','saving',     'number', 'saving',   'krw'),
    ('00000000-0000-0000-0000-000000000010','risk',       'text',   'saving',   null),
    ('00000000-0000-0000-0000-000000000010','retire_age', 'number', 'retire',   'age')
  returning id, key
)
insert into card_versions (card_id, version, label, question, planned_value, tolerance, options, allow_condition, stake, reason, created_by, activated_at)
select c.id, 1, v.label, v.question, v.planned_value, v.tolerance, v.options, v.allow_condition, v.stake, '최초 설정', '00000000-0000-0000-0000-000000000001', now()
from c join (values
  -- null 은 타입을 명시해야 한다. 안 하면 Postgres 가 unknown→text 로 추론해 text[] 대입에서 깨진다.
  ('home_when',  '주택 취득 시점', '언제쯤 집을 사실 계획인가요?', '2029-06', 6::numeric, null::text[], true,
   '전세 만기(2027.10) 대응과 신생아 특례 접수 기한'),
  ('home_price', '목표 주택가격', '얼마짜리 집을 보고 계세요?', '600000000', 0.05, null, false,
   '신혼부부 구입자금 상한 6억 — 1원만 넘어도 자격 상실'),
  ('child_when', '첫 출산 시점', '아이는 언제쯤 계획하고 계세요?', '2027-09', 6, null, true,
   '신생아 특례 접수 기한(출산일+2년)과 매수 시점의 정합성'),
  ('income',     '부부 합산 소득', '두 분 합쳐서 세전 연소득이 얼마쯤 되세요?', '76000000', 0.05, null, false,
   '소득 상한 8,500만원까지 여유 900만원 — 합산 +900만을 넘기면 신혼부부 구입자금 자격 상실'),
  ('raise_plan', '승진·이직 계획', '2년 안에 승진이나 이직 계획이 있으세요?', '없음. 현 직장 유지, 연봉 상승은 물가 수준', null, null, false,
   '합산 소득이 +900만을 넘으면 신혼부부 구입자금 자격 상실 (현재 여유 900만원). 한도 3.2억으로는 이미 4,248만원이 부족하다'),
  ('family_help','양가 지원', '집 살 때 부모님 도움은 어느 정도 기대하세요?', '전세 때 8,000만원 받았고, 매수 시 1.5억 추가 지원 예정', null, null, false,
   '혼인 증여재산공제 창구(2027.10)와 차용 설계 — 증여인지 차용인지에 따라 세금 설계가 바뀐다'),
  ('leave_who',  '육아휴직 주체', '육아휴직은 누가 쓰실 생각이세요?', '아내', null, array['남편','아내','둘 다','미정'], false,
   '외벌이 전환 기간의 현금흐름과 보장 공백'),
  ('saving',     '월 저축액', '지금 한 달에 얼마나 저축하고 계세요?', '1320000', 0.15, null, false,
   '2029년 자기자금 2.5억 달성 여부'),
  ('risk',       '투자 성향', '모아둔 돈, 어떻게 굴리고 싶으세요?', '남편은 적극 투자 선호, 아내는 원금 보전 선호. 주택자금은 안전자산으로 합의', null, null, false,
   '단기(주택) 자금의 자산배분 합의'),
  ('retire_age', '은퇴 목표 연령', '몇 살쯤 은퇴하고 싶으세요?', '60', 0.05, null, false,
   '연금계좌 납입을 주택 취득 전까지 유보할지 판단')
) as v(key, label, question, planned_value, tolerance, options, allow_condition, stake) on v.key = c.key;

-- 0회차 라운드 (home_when · raise_plan · family_help 3장, 이 순서로 묻는다)
insert into rounds (couple_id, kind, card_version_ids)
select '00000000-0000-0000-0000-000000000010', 'baseline',
       array_agg(cv.id order by array_position(array['home_when','raise_plan','family_help'], c.key))
from card_versions cv join cards c on c.id = cv.card_id
where c.couple_id = '00000000-0000-0000-0000-000000000010'
  and c.key in ('home_when','raise_plan','family_help');

commit;

-- 확인: 부부 1쌍(남편 · 아내), 카드 10장, 열린 0회차 1개
select (select count(*) from couples) as couples,
       (select count(*) from cards) as cards,
       (select count(*) from rounds where status = 'open') as open_rounds,
       (select label from couples limit 1) as label;
