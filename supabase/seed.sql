-- 데모용 시드. 김현우·박지우 + 카드 10장 v1. src/data/seed-cards.json 과 동일 내용.
insert into planners (id, name) values ('00000000-0000-0000-0000-000000000001', '데모 설계사');
insert into couples (id, planner_id, invite_code, label) values ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', '482913', '김현우·박지우');
insert into members (couple_id, role, display_name) values
  ('00000000-0000-0000-0000-000000000010', 'husband', '현우'),
  ('00000000-0000-0000-0000-000000000010', 'wife', '지우');

with c as (
  insert into cards (couple_id, key, type) values
    ('00000000-0000-0000-0000-000000000010','home_when','date'),
    ('00000000-0000-0000-0000-000000000010','home_price','number'),
    ('00000000-0000-0000-0000-000000000010','child_when','date'),
    ('00000000-0000-0000-0000-000000000010','income','number'),
    ('00000000-0000-0000-0000-000000000010','raise_plan','text'),
    ('00000000-0000-0000-0000-000000000010','family_help','text'),
    ('00000000-0000-0000-0000-000000000010','leave_who','choice'),
    ('00000000-0000-0000-0000-000000000010','saving','number'),
    ('00000000-0000-0000-0000-000000000010','risk','text'),
    ('00000000-0000-0000-0000-000000000010','retire_age','number')
  returning id, key
)
insert into card_versions (card_id, version, label, question, planned_value, tolerance, options, stake, reason, created_by, activated_at)
select c.id, 1, v.label, v.question, v.planned_value, v.tolerance, v.options, v.stake, '최초 설정', '00000000-0000-0000-0000-000000000001', now()
from c join (values
  ('home_when',  '주택 취득 시점', '언제쯤 집을 사실 계획인가요?', '2029-06', 6, null, '전세 만기(2027.10) 대응과 신생아 특례 접수 기한'),
  ('home_price', '목표 주택가격', '얼마짜리 집을 보고 계세요?', '600000000', 0.05, null, '신혼부부 구입자금 상한 6억 — 1원만 넘어도 자격 상실'),
  ('child_when', '첫 출산 시점', '아이는 언제쯤 계획하고 계세요?', '2027-09', 6, null, '신생아 특례 접수 기한(출산일+2년)과 매수 시점의 정합성'),
  ('income',     '부부 합산 소득', '두 분 합쳐서 세전 연소득이 얼마쯤 되세요?', '76000000', 0.05, null, '소득 상한 8,500만원까지 여유 900만원'),
  ('raise_plan', '승진·이직 계획', '2년 안에 승진이나 이직 계획이 있으세요?', '없음. 현 직장 유지, 연봉 상승은 물가 수준', null, null, '한 명이 연봉 +500만원이면 신혼부부 구입자금 자격 상실'),
  ('family_help','양가 지원', '집 살 때 부모님 도움은 어느 정도 기대하세요?', '전세 때 8,000만원 받았고, 매수 시 1.5억 추가 지원 예정', null, null, '혼인 증여재산공제 창구(2027.10)와 차용 설계'),
  ('leave_who',  '육아휴직 주체', '육아휴직은 누가 쓰실 생각이세요?', '아내', null, array['남편','아내','둘 다','미정'], '외벌이 전환 기간의 현금흐름과 보장 공백'),
  ('saving',     '월 저축액', '지금 한 달에 얼마나 저축하고 계세요?', '1320000', 0.15, null, '2029년 자기자금 2.5억 달성 여부'),
  ('risk',       '투자 성향', '모아둔 돈, 어떻게 굴리고 싶으세요?', '남편은 적극 투자 선호, 아내는 원금 보전 선호. 주택자금은 안전자산으로 합의', null, null, '단기(주택) 자금의 자산배분 합의'),
  ('retire_age', '은퇴 목표 연령', '몇 살쯤 은퇴하고 싶으세요?', '60', 0.05, null, '연금계좌 납입을 주택 취득 전까지 유보할지 판단')
) as v(key, label, question, planned_value, tolerance, options, stake) on v.key = c.key;
