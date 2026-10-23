-- 2026-10-23: 처리 대기의 "재설계 필요" 버튼 (팀 결정 Q2 — 앱 안에서 전제를 바꾸지 않고, 어긋나면 다시 설계)
-- Supabase → SQL Editor 에 붙여 넣고 Run. 데이터는 건드리지 않는다. 두 번 실행해도 된다.
alter type resolution add value if not exists 'replan';
