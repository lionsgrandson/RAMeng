-- Disposable database only: persisted document layouts, photos and permissions.
begin;
create function pg_temp.check_layout(value boolean) returns void language plpgsql as $$begin if value is distinct from true then raise exception 'Document layout check failed'; end if; end$$;
create function pg_temp.deny_layout(statement text) returns void language plpgsql as $$begin begin execute statement; exception when insufficient_privilege or raise_exception then return; end; raise exception 'Expected document permission denial'; end$$;
insert into auth.users(id,email) values ('50000000-0000-0000-0000-000000000001','layout-admin@example.test'),('50000000-0000-0000-0000-000000000002','layout-editor@example.test'),('50000000-0000-0000-0000-000000000003','layout-viewer@example.test');
insert into public.organizations(id) values ('60000000-0000-0000-0000-000000000001');
insert into public.memberships(org_id,user_id,role,permissions) values
('60000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','admin',null),
('60000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000002','inspector','{"projects":{"view":true,"edit":true,"delete":false},"reports":{"view":true,"edit":true,"delete":false},"tasks":{"view":true,"edit":true,"delete":false}}'),
('60000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000003','viewer',null);
insert into public.workspace_state(org_id,data) values ('60000000-0000-0000-0000-000000000001','{"projects":[{"id":"p","name":"QA"}],"tasks":[],"categories":[],"meetingSummaries":[],"reports":[],"reportTemplates":[],"audit":[]}');
set local role authenticated;
select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000001',true);
select public.save_workspace_state('60000000-0000-0000-0000-000000000001',
'{"projects":[{"id":"p","name":"QA","reportTemplateId":"rt","reportTemplateIds":["rt"],"meetingColumns":[{"key":"notes","visible":true}]}],"tasks":[],"categories":[],"reportTemplates":[{"id":"rt","name":"QA","layout":"cards","sectionTitles":[],"columns":[{"key":"status","visible":false}]}],"reports":[{"id":"r","projectId":"p","title":"QA","layout":"cards","sections":[],"columns":[{"key":"status","visible":false},{"key":"description","visible":true}]}],"meetingSummaries":[{"id":"m","projectId":"p","title":"QA","taskIds":[],"notes":"manual","taskNotes":{},"columns":[{"key":"notes","visible":true},{"key":"status","visible":false}],"photos":[{"id":"photo","url":"https://example.test/test.png","caption":"QA"}]}],"audit":[]}',0);
select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000002',true);
do $$declare d jsonb; v bigint; begin
select data,version into d,v from public.get_workspace_state('60000000-0000-0000-0000-000000000001');
perform pg_temp.check_layout(d#>>'{projects,0,reportTemplateId}'='rt');
perform pg_temp.check_layout(d#>>'{meetingSummaries,0,photos,0,caption}'='QA');
d:=jsonb_set(d,'{reports,0,columns}','[{"key":"description","visible":true},{"key":"status","visible":true}]');
perform public.save_workspace_state('60000000-0000-0000-0000-000000000001',d,v);
select data,version into d,v from public.get_workspace_state('60000000-0000-0000-0000-000000000001');
perform pg_temp.check_layout(d#>>'{reports,0,columns,0,key}'='description');
perform pg_temp.check_layout(d#>>'{reports,0,columns,1,visible}'='true');
perform pg_temp.deny_layout(format('select public.save_workspace_state(%L,%L,%s)','60000000-0000-0000-0000-000000000001',jsonb_set(d,'{meetingSummaries,0,photos}','[]'),v));
end$$;
-- Optional plan fields use the existing file permission boundary and JSON storage.
select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000001',true);
do $$declare d jsonb; v bigint; begin
select data,version into d,v from public.get_workspace_state('60000000-0000-0000-0000-000000000001');
d:=jsonb_set(d,'{files}','[{"id":"plan","projectId":"p","name":"plan.pdf","url":"https://example.test/plan.pdf","version":1,"uploadedAt":"2026-11-08","planRevision":"A-01","revisionNotes":"first","planHistory":[]}]');
perform public.save_workspace_state('60000000-0000-0000-0000-000000000001',d,v);
end$$;
select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000002',true);
do $$declare d jsonb; v bigint; begin
select data,version into d,v from public.get_workspace_state('60000000-0000-0000-0000-000000000001');
d:=jsonb_set(d,'{files,0,planRevision}','"A-02"');
d:=jsonb_set(d,'{files,0,revisionNotes}','"updated"');
d:=jsonb_set(d,'{files,0,updatedBy}','"50000000-0000-0000-0000-000000000002"');
d:=jsonb_set(d,'{files,0,planHistory}','[{"version":1,"planRevision":"A-01","revisionNotes":"first","recordedAt":"2026-11-08T00:00:00Z"}]');
perform public.save_workspace_state('60000000-0000-0000-0000-000000000001',d,v);
select data,version into d,v from public.get_workspace_state('60000000-0000-0000-0000-000000000001');
perform pg_temp.check_layout(d#>>'{files,0,planRevision}'='A-02');
perform pg_temp.check_layout(d#>>'{files,0,planHistory,0,revisionNotes}'='first');
end$$;
-- The single profession selector persists its ID without rewriting project grants.
select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000001',true);
do $$declare d jsonb; v bigint; begin
select data,version into d,v from public.get_workspace_state('60000000-0000-0000-0000-000000000001');
d:=jsonb_set(d,'{categories}','[{"id":"electric","name":"חשמל"}]');
d:=jsonb_set(d,'{taskStatuses}','["טרם התחיל","בוצע","סגור"]');
d:=jsonb_set(d,'{tasks}','[{"id":"task-profession","projectId":"p","title":"QA","status":"טרם התחיל","priority":"רגילה","createdAt":"2026-11-08","categoryIds":[],"custom":{"profession":"חשמל"},"professionId":"electric"}]');
perform public.save_workspace_state('60000000-0000-0000-0000-000000000001',d,v);
select data,version into d,v from public.get_workspace_state('60000000-0000-0000-0000-000000000001');
perform pg_temp.check_layout(d#>>'{tasks,0,professionId}'='electric');
perform pg_temp.check_layout(d#>>'{tasks,0,custom,profession}'='חשמל');
end$$;
select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000003',true);
do $$declare d jsonb; v bigint; begin
select data,version into d,v from public.get_workspace_state('60000000-0000-0000-0000-000000000001');
perform pg_temp.deny_layout(format('select public.save_workspace_state(%L,%L,%s)','60000000-0000-0000-0000-000000000001',jsonb_set(d,'{reports,0,columns}','[{"key":"status","visible":true}]'),v));
perform pg_temp.deny_layout(format('select public.save_workspace_state(%L,%L,%s)','60000000-0000-0000-0000-000000000001',jsonb_set(d,'{files,0,planRevision}','"forbidden"'),v));
end$$;
reset role;
rollback;
