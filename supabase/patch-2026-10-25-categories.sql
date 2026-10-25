-- 2026-10-25: 질문 카드 틀 확정(docs/09, 주제 10개) — 새 주제 "결혼"(wedding), "부채·소비"(debt)
-- Supabase → SQL Editor 에 붙여 넣고 Run. 데이터는 건드리지 않는다. 두 번 실행해도 된다.
alter type card_category add value if not exists 'wedding';
alter type card_category add value if not exists 'debt';
