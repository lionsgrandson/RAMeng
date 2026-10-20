-- Immutable saved versions are review history, not a claim of legal issuance.
begin;
create table public.report_snapshots (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  report_id text not null,
  workspace_version bigint not null,
  captured_by uuid not null,
  captured_at timestamptz not null default now(),
  snapshot jsonb not null,
  unique(org_id,report_id,workspace_version)
);
alter table public.report_snapshots enable row level security;
revoke all on public.report_snapshots from public,anon,authenticated;
grant select on public.report_snapshots to authenticated;
create policy report_snapshot_read on public.report_snapshots for select to authenticated using (public.can_org_action(org_id,'reports','view'));
create function public.capture_report_snapshot(target_org uuid,target_report text)
returns uuid language plpgsql security definer set search_path='' as $$
declare document jsonb; report jsonb; v bigint; result uuid;
begin
  if auth.uid() is null or not public.can_org_action(target_org,'reports','edit') or not public.can_org_action(target_org,'reports','view') then raise exception 'Report snapshot denied' using errcode='42501'; end if;
  select data,version into document,v from public.workspace_state where org_id=target_org for update;
  select value into report from jsonb_array_elements(coalesce(document->'reports','[]')) where value->>'id'=target_report;
  if report is null then raise exception 'Report not found'; end if;
  insert into public.report_snapshots(org_id,report_id,workspace_version,captured_by,snapshot)
    values(target_org,target_report,v,auth.uid(),jsonb_build_object('report',report,'projectName',(select p->>'name' from jsonb_array_elements(document->'projects') p where p->>'id'=report->>'projectId'),'organizationName',document#>>'{settings,organizationName}'))
    on conflict(org_id,report_id,workspace_version) do nothing returning id into result;
  if result is null then select id into result from public.report_snapshots where org_id=target_org and report_id=target_report and workspace_version=v; end if;
  return result;
end;
$$;
revoke all on function public.capture_report_snapshot(uuid,text) from public,anon;
grant execute on function public.capture_report_snapshot(uuid,text) to authenticated;
commit;
