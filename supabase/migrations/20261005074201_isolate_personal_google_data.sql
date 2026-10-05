begin;
-- Preserve the previous shared snapshots in a schema unavailable to the Data API.
create schema if not exists rameng_private;
revoke all on schema rameng_private from public, anon, authenticated;
create table if not exists rameng_private.google_privacy_backup (
  org_id uuid primary key,
  data jsonb not null,
  backed_up_at timestamptz not null default now()
);
alter table rameng_private.google_privacy_backup enable row level security;
revoke all on rameng_private.google_privacy_backup from public, anon, authenticated;
insert into rameng_private.google_privacy_backup(org_id, data)
select org_id, data from public.workspace_state
on conflict (org_id) do nothing;

create or replace function public.shared_crm_data(input_data jsonb)
returns jsonb language sql immutable set search_path = pg_catalog as $$
  select jsonb_set(
    jsonb_set(input_data, '{tasks}', coalesce((
      select jsonb_agg(task - 'gmailThreadId')
      from jsonb_array_elements(coalesce(input_data -> 'tasks', '[]'::jsonb)) task
    ), '[]'::jsonb), true),
    '{events}', coalesce((
      select jsonb_agg(event - 'googleEventId' - 'googleHtmlLink')
      from jsonb_array_elements(coalesce(input_data -> 'events', '[]'::jsonb)) event
      -- Imported mailbox calendar copies have no CRM project/task relationship.
      -- CRM events retain their business details; personal Google links are removed.
      where coalesce(event ->> 'googleEventId', '') = ''
         or coalesce(event ->> 'projectId', '') <> ''
         or coalesce(event ->> 'taskId', '') <> ''
    ), '[]'::jsonb), true
  );
$$;

create or replace function public.sanitize_shared_google_data()
returns trigger language plpgsql set search_path = public as $$
begin
  new.data := public.shared_crm_data(new.data);
  return new;
end;
$$;
revoke all on function public.sanitize_shared_google_data() from public, anon, authenticated;
drop trigger if exists shared_google_privacy on public.workspace_state;
create trigger shared_google_privacy before insert or update on public.workspace_state
for each row execute function public.sanitize_shared_google_data();
update public.workspace_state
set data = public.shared_crm_data(data), version = version + 1, updated_at = now()
where data is distinct from public.shared_crm_data(data);
commit;
