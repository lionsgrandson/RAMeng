-- Synthetic identities and organizations, always rolled back; safe on an isolated DB.
begin;
create temp table qa_counters(assertions integer, denials integer);
insert into qa_counters values(0,0);
grant select,update on qa_counters to authenticated,service_role;
create function pg_temp.qa_assert(value boolean, message text) returns void language plpgsql as $$begin if value is distinct from true then raise exception 'Assertion failed: %',message; end if; update qa_counters set assertions=assertions+1; end$$;
create function pg_temp.qa_denied(statement text) returns void language plpgsql as $$begin begin execute statement; exception when insufficient_privilege or raise_exception or serialization_failure or invalid_parameter_value then update qa_counters set denials=denials+1; return; end; raise exception 'Expected denial'; end$$;
insert into auth.users(id,email) values
('30000000-0000-0000-0000-000000000001','qa-admin@example.test'),
('30000000-0000-0000-0000-000000000002','qa-external@example.test'),
('30000000-0000-0000-0000-000000000003','qa-viewer@example.test'),
('30000000-0000-0000-0000-000000000004','qa-developer@example.test');
insert into public.organizations(id) values ('40000000-0000-0000-0000-000000000001');
insert into public.memberships(org_id,user_id,role) values
('40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','admin'),
('40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002','external'),
('40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000003','viewer'),
('40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000004','developer');
insert into public.workspace_state(org_id,data) values ('40000000-0000-0000-0000-000000000001','{"projects":[{"id":"p","name":"QA","categoryIds":[]}],"tasks":[{"id":"own","projectId":"p","assigneeId":"30000000-0000-0000-0000-000000000002","title":"QA","status":"בטיפול","custom":{},"sourceEmail":{"mailboxUserId":"private-source","messageId":"private-id"}},{"id":"other","projectId":"p","title":"private","status":"בטיפול"}],"taskStatuses":["טרם התחיל","בטיפול","בוצע"],"audit":[],"contacts":[{"id":"private","name":"internal"}]}');
insert into public.project_collaborators(org_id,project_id,user_id) values ('40000000-0000-0000-0000-000000000001','p','30000000-0000-0000-0000-000000000002');
grant select on public.memberships to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000001',true);
-- Every preset includes the harmless connection view default, with other privileged areas hidden.
do $$declare preset jsonb; name text; area text; begin
foreach name in array array['view','edit-no-delete','status','full','create-only'] loop
preset := '{}';
foreach area in array array['contacts','projects','tasks','calendar','files','reports','finance','communication'] loop
preset := preset || jsonb_build_object(area,jsonb_build_object('view',true,'create',name in ('edit-no-delete','full','create-only'),'edit',name in ('edit-no-delete','full'),'status',name in ('edit-no-delete','full','status'),'delete',name='full'));
end loop;
preset := preset || '{"connections":{"view":true,"create":false,"edit":false,"status":false,"delete":false},"imports":{"view":false,"create":false,"edit":false,"status":false,"delete":false},"settings":{"view":false,"create":false,"edit":false,"status":false,"delete":false}}';
perform public.set_org_member_permissions('40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000003',preset);
perform pg_temp.qa_assert((select permissions=preset from public.memberships where user_id='30000000-0000-0000-0000-000000000003'),'preset persists ' || name);
end loop;
end$$;
select public.set_org_member_permissions('40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000003','{"tasks":{"view":true,"status":true,"edit":false}}');
reset role;
select pg_temp.qa_assert(public.workspace_permission_allowed('viewer','{"tasks":{"view":false,"edit":true}}','tasks','edit')=false,'view prerequisite');
set local role authenticated;
select pg_temp.qa_denied($q$select public.set_org_member_permissions('40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000003','{"connections":{"edit":true}}')$q$);
select pg_temp.qa_denied($q$select public.set_org_member_permissions('40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000004',null)$q$);
select pg_temp.qa_assert((select permissions is null from public.memberships where user_id='30000000-0000-0000-0000-000000000001'),'another member unchanged');
select public.set_org_member_permissions('40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000003',null);
select pg_temp.qa_assert((select permissions is null from public.memberships where user_id='30000000-0000-0000-0000-000000000003'),'reset persists');
select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000004',true);
select public.set_org_member_permissions('40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000003','{"imports":{"view":false,"create":true}}');
select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000001',true);
select pg_temp.qa_denied($q$select public.set_org_member_permissions('40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000003','{"imports":{"view":true,"create":true}}')$q$);
select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000004',true);
select public.set_org_member_permissions('40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000003','{"connections":{"edit":true},"imports":{"view":true,"create":true},"settings":{"view":true,"edit":true}}');
select pg_temp.qa_assert((select permissions#>>'{connections,edit}'='true' from public.memberships where user_id='30000000-0000-0000-0000-000000000003'),'developer grant');
select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000003',true);
select pg_temp.qa_denied($q$select public.set_org_member_permissions('40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',null)$q$);
select pg_temp.qa_denied($q$select public.save_workspace_state('40000000-0000-0000-0000-000000000001',jsonb_set((select data from public.get_workspace_state('40000000-0000-0000-0000-000000000001')),'{tasks,0,title}','"hacked"'),0)$q$);
select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000002',true);
select pg_temp.qa_assert((select jsonb_array_length(data->'tasks')=1 and not(data ? 'contacts') and not(data->'tasks'->0 ? 'sourceEmail') from public.get_workspace_state('40000000-0000-0000-0000-000000000001')),'external projection');
select public.set_assigned_task_status('40000000-0000-0000-0000-000000000001','own','בוצע','בטיפול');
select pg_temp.qa_assert((select data#>>'{tasks,0,status}'='בוצע' and data#>>'{tasks,0,completedAt}' is not null and data#>>'{tasks,0,completedBy}'='30000000-0000-0000-0000-000000000002' from public.get_workspace_state('40000000-0000-0000-0000-000000000001')),'completion survives reload with actor and time');
select pg_temp.qa_assert(public.set_assigned_task_status('40000000-0000-0000-0000-000000000001','own','בוצע','בטיפול')=1,'retry idempotent');
select pg_temp.qa_denied($q$select public.set_assigned_task_status('40000000-0000-0000-0000-000000000001','own','בטיפול','טרם התחיל')$q$);
select pg_temp.qa_denied($q$select public.set_assigned_task_status('40000000-0000-0000-0000-000000000001','other','בוצע','בטיפול')$q$);
select pg_temp.qa_denied($q$select public.set_assigned_task_status('40000000-0000-0000-0000-000000000001','own','unknown','בוצע')$q$);
select pg_temp.qa_denied($q$select public.set_assigned_task_status('40000000-0000-0000-0000-000000000099','own','בוצע','בטיפול')$q$);
select public.set_assigned_task_status('40000000-0000-0000-0000-000000000001','own','בטיפול','בוצע');
select pg_temp.qa_assert((select not(data->'tasks'->0 ? 'completedAt') and not(data->'tasks'->0 ? 'completedBy') from public.get_workspace_state('40000000-0000-0000-0000-000000000001')),'reopen clears metadata');
select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000001',true);
select pg_temp.qa_assert((select data#>>'{tasks,1,title}'='private' and data#>>'{contacts,0,name}'='internal' and jsonb_array_length(data->'audit')=2 from public.get_workspace_state('40000000-0000-0000-0000-000000000001')),'admin sees history and other data intact');
select public.set_project_collaborator('40000000-0000-0000-0000-000000000001','p','30000000-0000-0000-0000-000000000002',false);
select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000002',true);
select pg_temp.qa_assert((select jsonb_array_length(data->'tasks')=0 from public.get_workspace_state('40000000-0000-0000-0000-000000000001')),'revoked projection');
select pg_temp.qa_denied($q$select public.set_assigned_task_status('40000000-0000-0000-0000-000000000001','own','בוצע','בטיפול')$q$);
reset role;
select pg_temp.qa_assert(not has_function_privilege('anon','public.set_assigned_task_status(uuid,text,text,text)','execute'),'anonymous denied');

-- An older browser may retain task objects without the server completion stamp.
savepoint legacy_client;
set local role authenticated;
select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000001',true);
select public.set_project_collaborator('40000000-0000-0000-0000-000000000001','p','30000000-0000-0000-0000-000000000002',true);
select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000002',true);
do $$declare old_document jsonb; v bigint; begin
select data,version into old_document,v from public.get_workspace_state('40000000-0000-0000-0000-000000000001');
perform public.save_workspace_state('40000000-0000-0000-0000-000000000001',jsonb_set(old_document,'{tasks,0,status}','"בוצע"'),v);
perform public.save_workspace_state('40000000-0000-0000-0000-000000000001',old_document,v+1);
perform pg_temp.qa_assert((select data#>>'{tasks,0,status}'='בטיפול' from public.get_workspace_state('40000000-0000-0000-0000-000000000001')),'legacy stale completion metadata does not block status-only save');
end$$;
rollback to legacy_client;
-- Organizational journal is empty until explicit developer-recorded consent.
set local role authenticated;
select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000001',true);
select pg_temp.qa_denied($q$select public.approve_communication_mailbox('40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','synthetic-only-consent',true)$q$);
select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000004',true);
select public.approve_communication_mailbox('40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','synthetic-only-consent',true);
select pg_temp.qa_denied($q$select public.ingest_communication_thread('40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','qa-admin@example.test','thread','p','["own","other"]','[]','[{"id":"message","subject":"QA","body":"business only","date":"2026-10-20T10:00:00Z","attachments":[]}]','h1')$q$);
set local role service_role;
select pg_temp.qa_denied($q$select public.ingest_communication_thread('40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','wrong@example.test','thread','p','[]','[]','[{"id":"message"}]','h1')$q$);
select pg_temp.qa_denied($q$select public.ingest_communication_thread('40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','qa-admin@example.test','thread','p','["unrelated"]','[]','[{"id":"message"}]','h1')$q$);
select public.ingest_communication_thread('40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','qa-admin@example.test','thread','p','["own","other"]','["private"]','[{"id":"message","subject":"QA","body":"business only","date":"2026-10-20T10:00:00Z","attachments":[]}]','h1');
select public.ingest_communication_thread('40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','qa-admin@example.test','thread','p','["own","other"]','["private"]','[{"id":"message","subject":"QA","body":"business only","date":"2026-10-20T10:00:00Z","attachments":[]},{"id":"reply","subject":"Re: QA","body":"approved reply","attachments":[]}]','h2');
select pg_temp.qa_assert((select count(*)=2 from public.communication_messages),'journal retries deduplicate messages');
select pg_temp.qa_assert((select count(*)=1 from public.communication_threads where history_id='h2' and jsonb_array_length(task_ids)=2),'journal multiple task links and sync cursor');
select pg_temp.qa_assert((select count(*)=3 from public.communication_journal_audit),'journal approval and sync audit');
set local role authenticated;
select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000002',true);
select pg_temp.qa_assert((select count(*)=0 from public.communication_messages),'external cannot read journal bodies');
select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000099',true);
select pg_temp.qa_assert((select count(*)=0 from public.communication_threads),'journal organization isolation');
select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000001',true);
select pg_temp.qa_assert((select count(*)=2 from public.communication_messages),'authorized organization reader can read journal');
select pg_temp.qa_denied($q$update public.communication_messages set body='forged'$q$);
select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000004',true);
select public.approve_communication_mailbox('40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','synthetic-consent-revoked',false);
set local role service_role;
select pg_temp.qa_denied($q$select public.ingest_communication_thread('40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','qa-admin@example.test','thread','p','[]','[]','[{"id":"new"}]','h3')$q$);
reset role;

-- Server snapshots capture stored reports and never allow client mutations.
update public.workspace_state set data=jsonb_set(data,'{reports}','[{"id":"qa-report","projectId":"p","title":"Original report","sections":[]}]') where org_id='40000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000001',true);
select public.capture_report_snapshot('40000000-0000-0000-0000-000000000001','qa-report');
select public.capture_report_snapshot('40000000-0000-0000-0000-000000000001','qa-report');
select pg_temp.qa_assert((select count(*)=1 from public.report_snapshots),'report snapshot retry idempotent');
select pg_temp.qa_denied($q$update public.report_snapshots set snapshot='{}'$q$);
select pg_temp.qa_denied($q$delete from public.report_snapshots$q$);
select public.save_workspace_state('40000000-0000-0000-0000-000000000001',jsonb_set((select data from public.get_workspace_state('40000000-0000-0000-0000-000000000001')),'{reports,0,title}','"Changed report"'),(select version from public.get_workspace_state('40000000-0000-0000-0000-000000000001')));
select pg_temp.qa_assert((select snapshot#>>'{report,title}'='Original report' from public.report_snapshots),'snapshot unaffected by later report edits');
select public.capture_report_snapshot('40000000-0000-0000-0000-000000000001','qa-report');
select pg_temp.qa_assert((select count(*)=2 from public.report_snapshots),'changed report receives separate version');
select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000002',true);
select pg_temp.qa_assert((select count(*)=0 from public.report_snapshots),'external cannot read report history');
select pg_temp.qa_denied($q$select public.capture_report_snapshot('40000000-0000-0000-0000-000000000001','qa-report')$q$);
select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000099',true);
select pg_temp.qa_assert((select count(*)=0 from public.report_snapshots),'report snapshot tenant isolation');
reset role;
delete from auth.users where id='30000000-0000-0000-0000-000000000001';
select pg_temp.qa_assert((select count(*)=2 from public.report_snapshots),'history does not block account removal or disappear with its author');
select pg_temp.qa_assert(not has_function_privilege('anon','public.approve_communication_mailbox(uuid,uuid,text,boolean)','execute') and not has_function_privilege('anon','public.capture_report_snapshot(uuid,text)','execute'),'new management RPCs exclude anonymous callers');
select pg_temp.qa_assert(not has_function_privilege('authenticated','public.ingest_communication_thread(uuid,uuid,text,text,text,jsonb,jsonb,jsonb,text)','execute') and has_function_privilege('service_role','public.ingest_communication_thread(uuid,uuid,text,text,text,jsonb,jsonb,jsonb,text)','execute'),'journal provenance RPC is service-only');
select pg_temp.qa_assert((select count(*)=5 and bool_and(relrowsecurity) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('communication_mailboxes','communication_threads','communication_messages','communication_journal_audit','report_snapshots')),'new tables enforce RLS');
select pg_temp.qa_assert((select bool_and(not has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') and not has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE')) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('communication_mailboxes','communication_threads','communication_messages','communication_journal_audit','report_snapshots')),'new tables forbid direct untrusted mutations');
set local role authenticated;
select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000099',true);
select pg_temp.qa_denied($q$select public.set_org_member_permissions('40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000003',null)$q$);
reset role;
select 'final-qa' as suite,assertions,denials from qa_counters;
rollback;
