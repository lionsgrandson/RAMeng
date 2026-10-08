-- Runs against an isolated PostgreSQL database with db-bootstrap.sql + setup.sql
-- + the Udi V3 migration. Never run test fixtures against a production database.
begin;
create function pg_temp.assert_true(value boolean, message text) returns void language plpgsql as $$begin if value is distinct from true then raise exception 'Assertion failed: %',message; end if; end$$;
create function pg_temp.expect_denied(statement text) returns void language plpgsql as $$begin begin execute statement; exception when insufficient_privilege or raise_exception then return; end; raise exception 'Expected denial: %',statement; end$$;
grant select on public.memberships, public.workspace_state, storage.objects to authenticated;
insert into auth.users(id,email) values
 ('10000000-0000-0000-0000-000000000001','admin@example.test'),
 ('10000000-0000-0000-0000-000000000002','external@example.test'),
 ('10000000-0000-0000-0000-000000000003','other@example.test'),
 ('10000000-0000-0000-0000-000000000004','viewer@example.test');
insert into public.organizations(id) values ('20000000-0000-0000-0000-000000000001'),('20000000-0000-0000-0000-000000000002');
insert into public.memberships(org_id,user_id,role,permissions) values
 ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','admin',null),
 ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','external','{"tasks":{"edit":true},"files":{"view":true}}'),
 ('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000003','admin',null),
 ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000004','viewer',null);
insert into public.workspace_state(org_id,data) values ('20000000-0000-0000-0000-000000000001', '{
 "projects":[{"id":"p1","name":"פרויקט ראשון","address":"בדיקה 1","clientIds":["contact"],"contactIds":["contact"],"categoryIds":["architecture"],"budget":100000},{"id":"p2","name":"פרויקט חסוי","clientIds":[],"categoryIds":["electricity"]}],
 "contacts":[{"id":"contact","name":"אדריכל"}],
 "categories":[{"id":"architecture","name":"אדריכלות"},{"id":"electricity","name":"חשמל"}],
 "tasks":[{"id":"assigned","projectId":"p1","title":"אישור תכנית","status":"טרם התחיל","categoryIds":["architecture"],"custom":{},"emailTo":"private@example.test"},{"id":"unassigned","projectId":"p1","title":"פנימי","status":"טרם התחיל"},{"id":"hidden","projectId":"p2","title":"חסוי","status":"טרם התחיל"}],
 "taskColumns":[{"id":"title","key":"title"},{"id":"email","key":"emailTo"}],"taskStatuses":["טרם התחיל","בטיפול","בוצע"],
 "meetingSummaries":[],"settings":{"organizationName":"RAM","organizationShortName":"RAM","email":"private@example.test"},"files":[{"id":"file","projectId":"p2","url":"secret"}],"quotes":[{"id":"quote","amount":1000}]
 }'), ('20000000-0000-0000-0000-000000000002','{}');
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select pg_temp.expect_denied($q$select public.save_workspace_state('20000000-0000-0000-0000-000000000001',jsonb_set((select data from public.get_workspace_state('20000000-0000-0000-0000-000000000001')),'{tasks,0,assigneeId}','"10000000-0000-0000-0000-000000000002"'),0)$q$);
select public.set_project_collaborator('20000000-0000-0000-0000-000000000001','p1','10000000-0000-0000-0000-000000000002',true);
-- Grant versioning is checked independently; keep the original workflow's version sequence.
reset role;
select pg_temp.assert_true((select version=1 from public.workspace_state where org_id='20000000-0000-0000-0000-000000000001'),'grant changes advance workspace version');
update public.workspace_state set version=0 where org_id='20000000-0000-0000-0000-000000000001';
set local role authenticated;
select public.save_workspace_state('20000000-0000-0000-0000-000000000001',jsonb_set((select data from public.get_workspace_state('20000000-0000-0000-0000-000000000001')),'{tasks,0,assigneeId}','"10000000-0000-0000-0000-000000000002"'),0);
select pg_temp.assert_true((select count(*)=1 from public.task_notifications),'assignment creates one notification');
select pg_temp.assert_true((select bool_and(background_ready) from public.task_notifications),'new assignments opt into background outbox delivery');
select public.save_workspace_state('20000000-0000-0000-0000-000000000001',jsonb_set((select data from public.get_workspace_state('20000000-0000-0000-0000-000000000001')),'{meetingSummaries}','[{"id":"meeting","projectId":"p1","taskIds":["assigned"],"notes":"הערה ידנית"}]'),1);
select pg_temp.assert_true((select count(*)=1 from public.task_notifications),'unrelated save does not duplicate notification');
savepoint container_deletion;
-- Removing a project while leaving an external assignment is invalid; the UI
-- must unassign that preserved task before it becomes a standalone task.
select pg_temp.expect_denied($q$select public.save_workspace_state('20000000-0000-0000-0000-000000000001',jsonb_set(jsonb_set(jsonb_set((select data from public.get_workspace_state('20000000-0000-0000-0000-000000000001')),'{projects}','[{"id":"p2","name":"פרויקט חסוי","clientIds":[],"categoryIds":["electricity"]}]'),'{tasks,0,projectId}','null'),'{meetingSummaries,0,projectId}','""'),2)$q$);
select public.save_workspace_state('20000000-0000-0000-0000-000000000001',jsonb_set(jsonb_set(jsonb_set(jsonb_set((select data from public.get_workspace_state('20000000-0000-0000-0000-000000000001')),'{projects}','[{"id":"p2","name":"פרויקט חסוי","clientIds":[],"categoryIds":["electricity"]}]'),'{tasks,0,projectId}','null'),'{tasks,0,assigneeId}','null'),'{meetingSummaries,0,projectId}','""'),2);
select pg_temp.assert_true((select jsonb_array_length(data->'tasks')=3 and data#>>'{tasks,0,title}'='אישור תכנית' and data#>>'{meetingSummaries,0,notes}'='הערה ידנית' from public.get_workspace_state('20000000-0000-0000-0000-000000000001')),'project deletion preserves task and meeting content');
rollback to container_deletion;
savepoint linked_task_deletion;
select public.save_workspace_state('20000000-0000-0000-0000-000000000001',jsonb_set((select data from public.get_workspace_state('20000000-0000-0000-0000-000000000001')),'{tasks}',(select jsonb_agg(t) from public.get_workspace_state('20000000-0000-0000-0000-000000000001'),jsonb_array_elements(data->'tasks') t where t->>'id'<>'assigned')),2);
select pg_temp.assert_true((select data#>>'{meetingSummaries,0,notes}'='הערה ידנית' and data#>>'{meetingSummaries,0,taskIds,0}'='assigned' from public.get_workspace_state('20000000-0000-0000-0000-000000000001')),'deleted meeting task retains historical reference and notes');
rollback to linked_task_deletion;
savepoint unscoped_notification;
select public.save_workspace_state('20000000-0000-0000-0000-000000000001',jsonb_set((select data from public.get_workspace_state('20000000-0000-0000-0000-000000000001')),'{tasks}',(select data->'tasks' from public.get_workspace_state('20000000-0000-0000-0000-000000000001')) || '[{"id":"standalone","title":"משימה כללית","status":"בטיפול","assigneeId":"10000000-0000-0000-0000-000000000001"}]'),2);
select pg_temp.assert_true((select count(*)=1 from public.task_notifications where task_id='standalone' and state='pending'),'standalone task notification remains pending');
select public.save_workspace_state('20000000-0000-0000-0000-000000000001',(select data from public.get_workspace_state('20000000-0000-0000-0000-000000000001')),3);
select pg_temp.assert_true((select count(*)=1 from public.task_notifications where task_id='standalone'),'standalone assignment does not duplicate on unrelated saves');
rollback to unscoped_notification;
select pg_temp.expect_denied($q$select public.save_workspace_state('20000000-0000-0000-0000-000000000001',jsonb_set((select data from public.get_workspace_state('20000000-0000-0000-0000-000000000001')),'{tasks,0,categoryIds}','["electricity"]'),2)$q$);
select pg_temp.expect_denied($q$select public.save_workspace_state('20000000-0000-0000-0000-000000000001',jsonb_set((select data from public.get_workspace_state('20000000-0000-0000-0000-000000000001')),'{projects,0,contactIds}','["missing"]'),2)$q$);
select pg_temp.expect_denied($q$select public.save_workspace_state('20000000-0000-0000-0000-000000000001',jsonb_set((select data from public.get_workspace_state('20000000-0000-0000-0000-000000000001')),'{meetingSummaries}','[{"id":"bad","projectId":"p1","taskIds":["hidden"]}]'),2)$q$);

select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
select pg_temp.assert_true((select count(*)=0 from public.workspace_state),'external cannot read raw document');
select pg_temp.assert_true((select jsonb_array_length(data->'projects')=1 and jsonb_array_length(data->'tasks')=1 and not (data ? 'contacts') and not (data ? 'files') and not (data ? 'quotes') and not (data->'projects'->0 ? 'budget') and jsonb_array_length(data->'categories')=1 from public.get_workspace_state('20000000-0000-0000-0000-000000000001')),'external scope strips internal resources');
select pg_temp.assert_true(not public.can_org_action('20000000-0000-0000-0000-000000000001','files','view'),'external permission override cannot expose storage');
select pg_temp.expect_denied($q$select * from public.get_workspace_state('20000000-0000-0000-0000-000000000002')$q$);
select pg_temp.expect_denied($q$select public.set_project_collaborator('20000000-0000-0000-0000-000000000001','p2','10000000-0000-0000-0000-000000000002',true)$q$);
select pg_temp.expect_denied($q$insert into public.project_collaborators(org_id,project_id,user_id) values('20000000-0000-0000-0000-000000000001','p2','10000000-0000-0000-0000-000000000002')$q$);
select pg_temp.expect_denied($q$select public.save_workspace_state('20000000-0000-0000-0000-000000000001',jsonb_set((select data from public.get_workspace_state('20000000-0000-0000-0000-000000000001')),'{tasks,0,title}','"hacked"'),2)$q$);
select pg_temp.expect_denied($q$select public.save_workspace_state('20000000-0000-0000-0000-000000000001','{"tasks":[{"id":"hidden","status":"בוצע"}]}',2)$q$);
-- A known unassigned task is still unauthorized: NULL must not pass an ownership check.
select pg_temp.expect_denied($q$select public.save_workspace_state('20000000-0000-0000-0000-000000000001','{"tasks":[{"id":"unassigned","projectId":"p1","title":"פנימי","status":"בוצע"}]}',2)$q$);
select pg_temp.expect_denied($q$select public.save_workspace_state('20000000-0000-0000-0000-000000000001',jsonb_set((select data from public.get_workspace_state('20000000-0000-0000-0000-000000000001')),'{tasks}',(select (data->'tasks') || (data->'tasks') from public.get_workspace_state('20000000-0000-0000-0000-000000000001'))),2)$q$);
select public.save_workspace_state('20000000-0000-0000-0000-000000000001',jsonb_set((select data from public.get_workspace_state('20000000-0000-0000-0000-000000000001')),'{tasks,0,status}','"בטיפול"'),2);
-- Complete and reopen in a savepoint so later optimistic-version tests keep version 3.
savepoint completion_check;
select public.save_workspace_state('20000000-0000-0000-0000-000000000001',jsonb_set((select data from public.get_workspace_state('20000000-0000-0000-0000-000000000001')),'{tasks,0,status}','"בוצע"'),3);
select pg_temp.assert_true((select data#>>'{tasks,0,completedAt}' is not null from public.get_workspace_state('20000000-0000-0000-0000-000000000001')),'external completion records completion time');
select public.save_workspace_state('20000000-0000-0000-0000-000000000001',jsonb_set((select data from public.get_workspace_state('20000000-0000-0000-0000-000000000001')),'{tasks,0,status}','"בטיפול"'),4);
select pg_temp.assert_true((select not (data->'tasks'->0 ? 'completedAt') from public.get_workspace_state('20000000-0000-0000-0000-000000000001')),'external reopening clears completion time');
rollback to completion_check;
select public.read_task_notification((select id from public.task_notifications limit 1));
select pg_temp.assert_true((select read_at is not null from public.task_notifications limit 1),'recipient can acknowledge notification');

select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select pg_temp.assert_true((select jsonb_array_length(data->'tasks')=3 and data#>>'{tasks,0,status}'='בטיפול' and data#>>'{meetingSummaries,0,notes}'='הערה ידנית' and data#>>'{files,0,url}'='secret' from public.get_workspace_state('20000000-0000-0000-0000-000000000001')),'external save preserves unshared tasks, files and manual notes');
select pg_temp.expect_denied($q$select public.save_workspace_state('20000000-0000-0000-0000-000000000001',(select data from public.get_workspace_state('20000000-0000-0000-0000-000000000001')),2)$q$);
select public.set_project_collaborator('20000000-0000-0000-0000-000000000001','p1','10000000-0000-0000-0000-000000000002',false);
select pg_temp.assert_true((select version=4 from public.get_workspace_state('20000000-0000-0000-0000-000000000001')),'revocation changes advance workspace version');
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
select pg_temp.assert_true((select jsonb_array_length(data->'tasks')=0 and jsonb_array_length(data->'projects')=0 from public.get_workspace_state('20000000-0000-0000-0000-000000000001')),'revocation immediately removes access');
select pg_temp.assert_true((select count(*)=0 from public.task_notifications),'revoked project notifications cannot disclose task titles');
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000004',true);
select pg_temp.expect_denied($q$select public.save_workspace_state('20000000-0000-0000-0000-000000000001',jsonb_set((select data from public.get_workspace_state('20000000-0000-0000-0000-000000000001')),'{categories}','[{"id":"bad","name":"bad"}]'),4)$q$);
reset role;
savepoint hidden_permission;
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',true);
select pg_temp.expect_denied($q$select public.set_org_member_role('20000000-0000-0000-0000-000000000001','other@example.test','developer')$q$);
select pg_temp.expect_denied($q$select public.set_org_member_permissions('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000004','{"tasks":{"edit":true}}')$q$);
reset role;
update public.memberships set permissions='{"tasks":{"view":false,"edit":true}}' where user_id='10000000-0000-0000-0000-000000000004';
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000004',true);
select pg_temp.assert_true(not public.can_org_action('20000000-0000-0000-0000-000000000001','tasks','edit'),'hidden areas cannot retain a stale edit grant in SQL');
reset role;
rollback to hidden_permission;
savepoint removed_sender;
delete from public.memberships where user_id='10000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select pg_temp.assert_true((select count(*)=0 from public.task_notifications),'removed assigner cannot read former organization notifications');
reset role;
rollback to removed_sender;
select pg_temp.assert_true((select bool_and(relrowsecurity) from pg_class where oid in ('public.project_collaborators'::regclass,'public.task_notifications'::regclass)),'new exposed tables have RLS');
select pg_temp.assert_true(not has_table_privilege('anon','public.task_notifications','SELECT') and not has_function_privilege('anon','public.set_project_collaborator(uuid,text,uuid,boolean)','EXECUTE'),'anonymous access revoked');
rollback;
\echo Udi V3 database workflow and permission checks passed.
