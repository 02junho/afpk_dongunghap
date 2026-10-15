-- 뷰가 RLS 를 우회하지 않게 한다. schema.sql 에도 반영돼 있지만, 이미 적용된 DB 에는 이 파일만 돌린다.
-- 왜: Postgres 뷰는 기본적으로 만든 사람(postgres) 권한으로 실행된다 → publishable 키만 있으면
--     planner_queue 로 판정·답변 스냅샷을 전부 읽을 수 있다. security_invoker 를 켜면 호출자의 RLS 가 적용된다.
alter view active_cards set (security_invoker = true);
alter view latest_cards set (security_invoker = true);
alter view card_verdict_history set (security_invoker = true);
alter view planner_queue set (security_invoker = true);
