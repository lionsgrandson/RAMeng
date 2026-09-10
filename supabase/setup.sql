-- RAMeng CRM Supabase bootstrap
-- Run once in Supabase SQL Editor for the new RAM Engineering project.

create extension if not exists pgcrypto;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'ר.א.ם הנדסה',
  created_at timestamptz not null default now()
);

create table if not exists public.memberships (
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('admin','manager','member','viewer')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

create index if not exists memberships_user_idx on public.memberships(user_id);

create table if not exists public.workspace_state (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.organizations enable row level security;
alter table public.memberships enable row level security;
alter table public.workspace_state enable row level security;

-- Helper intentionally uses SECURITY DEFINER so policies can check membership
-- without recursive policy evaluation on memberships.
create or replace function public.is_org_member(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.memberships m
    where m.org_id = target_org and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_org_admin(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.memberships m
    where m.org_id = target_org and m.user_id = auth.uid() and m.role in ('admin','manager')
  );
$$;

grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.is_org_admin(uuid) to authenticated;

-- The very first authenticated user can initialize the single organization.
-- Once any membership exists, an unrelated user cannot self-enroll.
create or replace function public.bootstrap_first_admin()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  existing_org uuid;
  new_org uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  select org_id into existing_org
  from public.memberships
  where user_id = current_user_id
  limit 1;

  if existing_org is not null then
    return existing_org;
  end if;

  if exists (select 1 from public.memberships limit 1) then
    raise exception 'Organization already initialized; an admin must add this user';
  end if;

  insert into public.organizations(name)
  values ('ר.א.ם הנדסה')
  returning id into new_org;

  insert into public.memberships(org_id, user_id, role)
  values (new_org, current_user_id, 'admin');

  insert into public.workspace_state(org_id, data, updated_by)
  values (new_org, '{}'::jsonb, current_user_id)
  on conflict (org_id) do nothing;

  return new_org;
end;
$$;

grant execute on function public.bootstrap_first_admin() to authenticated;

-- RLS policies

drop policy if exists organizations_select_member on public.organizations;
create policy organizations_select_member
on public.organizations for select
to authenticated
using (public.is_org_member(id));

drop policy if exists organizations_update_admin on public.organizations;
create policy organizations_update_admin
on public.organizations for update
to authenticated
using (public.is_org_admin(id))
with check (public.is_org_admin(id));

drop policy if exists memberships_select_org on public.memberships;
create policy memberships_select_org
on public.memberships for select
to authenticated
using (public.is_org_member(org_id));

drop policy if exists memberships_insert_admin on public.memberships;
create policy memberships_insert_admin
on public.memberships for insert
to authenticated
with check (public.is_org_admin(org_id));

drop policy if exists memberships_update_admin on public.memberships;
create policy memberships_update_admin
on public.memberships for update
to authenticated
using (public.is_org_admin(org_id))
with check (public.is_org_admin(org_id));

drop policy if exists memberships_delete_admin on public.memberships;
create policy memberships_delete_admin
on public.memberships for delete
to authenticated
using (public.is_org_admin(org_id));

drop policy if exists workspace_select_member on public.workspace_state;
create policy workspace_select_member
on public.workspace_state for select
to authenticated
using (public.is_org_member(org_id));

drop policy if exists workspace_insert_member on public.workspace_state;
create policy workspace_insert_member
on public.workspace_state for insert
to authenticated
with check (public.is_org_member(org_id));

drop policy if exists workspace_update_member on public.workspace_state;
create policy workspace_update_member
on public.workspace_state for update
to authenticated
using (public.is_org_member(org_id))
with check (public.is_org_member(org_id));

-- File storage. Files are stored under <org-id>/<project-id>/...
insert into storage.buckets (id, name, public, file_size_limit)
values ('crm-files', 'crm-files', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

drop policy if exists rameng_files_select on storage.objects;
create policy rameng_files_select
on storage.objects for select
to authenticated
using (
  bucket_id = 'crm-files'
  and public.is_org_member(((storage.foldername(name))[1])::uuid)
);

drop policy if exists rameng_files_insert on storage.objects;
create policy rameng_files_insert
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'crm-files'
  and public.is_org_member(((storage.foldername(name))[1])::uuid)
);

drop policy if exists rameng_files_update on storage.objects;
create policy rameng_files_update
on storage.objects for update
to authenticated
using (
  bucket_id = 'crm-files'
  and public.is_org_member(((storage.foldername(name))[1])::uuid)
)
with check (
  bucket_id = 'crm-files'
  and public.is_org_member(((storage.foldername(name))[1])::uuid)
);

drop policy if exists rameng_files_delete on storage.objects;
create policy rameng_files_delete
on storage.objects for delete
to authenticated
using (
  bucket_id = 'crm-files'
  and public.is_org_member(((storage.foldername(name))[1])::uuid)
);

-- Realtime updates for shared workspace state.
do $$
begin
  alter publication supabase_realtime add table public.workspace_state;
exception
  when duplicate_object then null;
end $$;

-- Recommended Auth setup in the Supabase dashboard:
-- 1. Disable public self-signup unless RAM Engineering wants it.
-- 2. Create the first admin user manually under Authentication > Users.
-- 3. Sign in once; bootstrap_first_admin() will make that first user the org admin.
