-- 우리가 만든 객체를 전부 지운다 (역순). 새 프로젝트에서는 아무것도 안 지우므로 항상 앞에 붙여도 안전하다.
-- ⚠ 데이터가 있는 프로젝트에서 돌리면 전부 사라진다. 데모 DB 전용.
drop view if exists planner_queue;
drop view if exists card_verdict_history;
drop view if exists latest_cards;
drop view if exists active_cards;

drop function if exists round_progress(uuid);
drop function if exists join_couple(text, member_role);
drop function if exists is_my_client(uuid);
drop function if exists my_planner_id();
drop function if exists my_member_id();
drop function if exists my_couple_id();

drop table if exists notifications cascade;
drop table if exists disputes cascade;
drop table if exists judgments cascade;
drop table if exists answers cascade;
drop table if exists rounds cascade;
drop table if exists plan_documents cascade;
drop table if exists card_versions cascade;
drop table if exists cards cascade;
drop table if exists members cascade;
drop table if exists couples cascade;
drop table if exists planners cascade;

drop function if exists card_versions_guard();
drop function if exists block_write();

drop type if exists resolution;
drop type if exists member_role;
drop type if exists round_kind;
drop type if exists round_status;
drop type if exists red_kind;
drop type if exists verdict;
drop type if exists number_unit;
drop type if exists card_category;
drop type if exists card_type;
