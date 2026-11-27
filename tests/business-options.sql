-- Disposable PostgreSQL only; every identity and row is rolled back.
begin;
create temp table choice_checks(n int default 0);
insert into choice_checks values(0);
grant select,update on choice_checks to authenticated;
create function pg_temp.check_choice(ok boolean, description text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %',description; end if; update choice_checks set n=n+1; end $$;
create function pg_temp.choice_denied(statement text) returns void language plpgsql as $$
begin begin execute statement; exception when insufficient_privilege or invalid_parameter_value or raise_exception or check_violation or unique_violation then update choice_checks set n=n+1; return; end; raise exception 'Expected denial: %',statement; end $$;
insert into auth.users(id,email) values
('50000000-0000-0000-0000-000000000001','choices-admin@example.test'),
('50000000-0000-0000-0000-000000000002','choices-peer@example.test'),
('50000000-0000-0000-0000-000000000003','choices-viewer@example.test'),
('50000000-0000-0000-0000-000000000004','choices-other@example.test'),
('50000000-0000-0000-0000-000000000005','choices-external@example.test');
insert into public.organizations(id) values('60000000-0000-0000-0000-000000000001'),('60000000-0000-0000-0000-000000000002');
insert into public.memberships(org_id,user_id,role) values
('60000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','admin'),
('60000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000002','admin'),
('60000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000003','viewer'),
('60000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000004','admin'),
('60000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000005','external');
set local role authenticated;
select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000001',true);
do $$declare family text; begin
  foreach family in array array['project_status','contact_status','priority','report_status','plan_status','quote_status','contact_role','company_type','contact_tag'] loop
    perform pg_temp.check_choice(public.create_business_option('60000000-0000-0000-0000-000000000001',family,'  QA   Choice  ')='QA Choice','save acknowledgement: '||family);
    perform pg_temp.check_choice(public.create_business_option('60000000-0000-0000-0000-000000000001',family,'qa choice')='QA Choice','case insensitive duplicate: '||family);
  end loop;
end $$;
select pg_temp.check_choice((select count(*)=9 from public.business_options),'durable choices without parent records');
select pg_temp.check_choice(public.create_business_option('60000000-0000-0000-0000-000000000001','project_status',U&'Cafe\0301')='Café','Unicode NFC');
select pg_temp.check_choice(public.create_business_option('60000000-0000-0000-0000-000000000001','project_status','Café')='Café','NFC duplicate');
select pg_temp.check_choice(public.create_business_option('60000000-0000-0000-0000-000000000001','project_status','CafÉ')='Café','Unicode case insensitive duplicate');
select pg_temp.check_choice(public.create_business_option('60000000-0000-0000-0000-000000000001','priority','QA'||chr(8195)||'Choice')='QA Choice','Unicode em-space duplicate');
select pg_temp.check_choice(public.create_business_option('60000000-0000-0000-0000-000000000001','priority',chr(5760)||'QA'||chr(8239)||'Choice'||chr(12288))='QA Choice','Unicode leading, narrow and ideographic whitespace');
select pg_temp.choice_denied($q$select public.create_business_option('60000000-0000-0000-0000-000000000001','role','developer')$q$);
select pg_temp.choice_denied($q$select public.create_business_option('60000000-0000-0000-0000-000000000001','project_status','__none__')$q$);
select pg_temp.choice_denied($q$select public.create_business_option('60000000-0000-0000-0000-000000000001','project_status','הכל')$q$);
select pg_temp.choice_denied($q$select public.create_business_option('60000000-0000-0000-0000-000000000001','project_status',' ')$q$);
select pg_temp.choice_denied($q$select public.create_business_option('60000000-0000-0000-0000-000000000001','project_status',repeat('x',101))$q$);
select pg_temp.choice_denied($q$select public.create_business_option('60000000-0000-0000-0000-000000000001','project_status','x'||chr(8207)||'y')$q$);
select pg_temp.choice_denied($q$insert into public.business_options(org_id,family,value) values('60000000-0000-0000-0000-000000000001','project_status','bypass')$q$);
select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000002',true);
select pg_temp.check_choice((select count(*)=10 from public.business_options),'another authorized account reads persisted options');
select pg_temp.check_choice(public.create_business_option('60000000-0000-0000-0000-000000000001','priority','QA CHOICE')='QA Choice','another authorized account reuses canonical spelling');
select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000003',true);
select pg_temp.check_choice((select count(*)=10 from public.business_options),'viewer reads allowed options');
select pg_temp.choice_denied($q$select public.create_business_option('60000000-0000-0000-0000-000000000001','priority','forbidden')$q$);
select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000004',true);
select pg_temp.check_choice((select count(*)=0 from public.business_options),'other organization cannot read options');
select pg_temp.choice_denied($q$select public.create_business_option('60000000-0000-0000-0000-000000000001','priority','forbidden')$q$);
select pg_temp.check_choice(public.create_business_option('60000000-0000-0000-0000-000000000002','priority','QA Choice')='QA Choice','same name belongs independently to another organization');
select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000005',true);
select pg_temp.check_choice((select count(*)=0 from public.business_options),'external collaborator has no global vocabulary access');
select pg_temp.choice_denied($q$select public.create_business_option('60000000-0000-0000-0000-000000000001','priority','forbidden')$q$);
reset role;
insert into public.workspace_state(org_id,data) values('60000000-0000-0000-0000-000000000001','{"projects":[{"id":"choice-project","name":"QA","address":"QA test address","clientIds":[],"categoryIds":[]}],"tasks":[{"id":"choice-task","title":"QA custom status task","projectId":"choice-project","assigneeId":"50000000-0000-0000-0000-000000000005","status":"בטיפול","priority":"רגילה","custom":{},"order":1,"createdAt":"2026-11-27"}],"taskStatuses":["טרם התחיל","בטיפול","בוצע","סגור","QA custom"],"audit":[]}');
insert into public.project_collaborators(org_id,project_id,user_id) values('60000000-0000-0000-0000-000000000001','choice-project','50000000-0000-0000-0000-000000000005');
set local role authenticated;
select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000005',true);
select public.set_assigned_task_status('60000000-0000-0000-0000-000000000001','choice-task','QA custom','בטיפול');
select pg_temp.check_choice((select data#>>'{tasks,0,status}'='QA custom' and data#>'{tasks,0,completedAt}' is null from public.get_workspace_state('60000000-0000-0000-0000-000000000001')),'external assignee can select canonical custom status without completing');
select public.set_assigned_task_status('60000000-0000-0000-0000-000000000001','choice-task','בוצע','QA custom');
select pg_temp.check_choice((select data#>>'{tasks,0,status}'='בוצע' and data#>>'{tasks,0,completedAt}' is not null from public.get_workspace_state('60000000-0000-0000-0000-000000000001')),'built-in completion semantics retained');
select public.set_assigned_task_status('60000000-0000-0000-0000-000000000001','choice-task','QA custom','בוצע');
select pg_temp.check_choice((select data#>>'{tasks,0,status}'='QA custom' and data#>'{tasks,0,completedAt}' is null from public.get_workspace_state('60000000-0000-0000-0000-000000000001')),'reopening in custom status clears completion');
select pg_temp.choice_denied($q$select public.set_assigned_task_status('60000000-0000-0000-0000-000000000001','choice-task','__none__','QA custom')$q$);
reset role;
update public.memberships set permissions='{"projects":{"view":true,"status":true,"create":false,"edit":false,"delete":false}}' where org_id='60000000-0000-0000-0000-000000000001' and user_id='50000000-0000-0000-0000-000000000003';
set local role authenticated;
select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000003',true);
do $$declare w record; begin
  select * into w from public.get_workspace_state('60000000-0000-0000-0000-000000000001');
  perform public.save_workspace_state('60000000-0000-0000-0000-000000000001',jsonb_set(w.data,'{projects,0,status}','"בביצוע"'),w.version);
  perform pg_temp.check_choice(true,'status-only member can select built-in project status');
  select * into w from public.get_workspace_state('60000000-0000-0000-0000-000000000001');
  perform public.save_workspace_state('60000000-0000-0000-0000-000000000001',jsonb_set(w.data,'{projects,0,status}','"QA Choice"'),w.version);
  perform pg_temp.check_choice(true,'status-only member can reuse registered option');
  perform pg_temp.choice_denied(format('select public.save_workspace_state(%L,%L::jsonb,%s)','60000000-0000-0000-0000-000000000001',jsonb_set(w.data,'{projects,0,status}','"Unauthorized new option"'),w.version+1));
  perform pg_temp.choice_denied(format('select public.save_workspace_state(%L,%L::jsonb,%s)','60000000-0000-0000-0000-000000000001',jsonb_set(w.data,'{projects,0,status}','"__none__"'),w.version+1));
end $$;
select pg_temp.check_choice(not exists(select 1 from public.business_options where value='Unauthorized new option'),'rejected workspace save does not register option');
select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000001',true);
do $$declare w record; begin
  select * into w from public.get_workspace_state('60000000-0000-0000-0000-000000000001');
  perform public.save_workspace_state('60000000-0000-0000-0000-000000000001',jsonb_set(w.data,'{projects,0,status}','"Authorized import label"'),w.version);
  perform pg_temp.check_choice(exists(select 1 from public.business_options where family='project_status' and value='Authorized import label'),'authorized workspace import registers durable option');
end $$;
reset role;
select n as business_option_assertions from choice_checks;
rollback;
