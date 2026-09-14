-- RAMeng CRM Supabase bootstrap
-- Run this in the Supabase SQL Editor for the RAM Engineering project.

create extension if not exists pgcrypto;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'ר.א.ם הנדסה',
  created_at timestamptz not null default now()
);

create table if not exists public.memberships (
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'viewer',
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

alter table public.memberships drop constraint if exists memberships_role_check;
alter table public.memberships add constraint memberships_role_check
  check (role in ('admin','assistant','inspector','engineer','viewer','manager','member'));

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
    where m.org_id = target_org
      and m.user_id = auth.uid()
      and m.role in ('admin','manager')
  );
$$;

create or replace function public.can_org_edit(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.memberships m
    where m.org_id = target_org
      and m.user_id = auth.uid()
      and m.role <> 'viewer'
  );
$$;

grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.is_org_admin(uuid) to authenticated;
grant execute on function public.can_org_edit(uuid) to authenticated;

-- The first authenticated user initializes the organization and becomes its first admin.
-- Additional users must be explicitly added by an admin.
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

create or replace function public.list_org_members(target_org uuid)
returns table (
  user_id uuid,
  email text,
  display_name text,
  role text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not public.is_org_member(target_org) then
    raise exception 'Access denied';
  end if;

  return query
  select
    m.user_id,
    u.email::text,
    coalesce(
      nullif(u.raw_user_meta_data ->> 'full_name', ''),
      nullif(u.raw_user_meta_data ->> 'name', ''),
      split_part(u.email, '@', 1)
    )::text as display_name,
    m.role,
    m.created_at
  from public.memberships m
  join auth.users u on u.id = m.user_id
  where m.org_id = target_org
  order by m.created_at;
end;
$$;

grant execute on function public.list_org_members(uuid) to authenticated;

create or replace function public.set_org_member_role(target_org uuid, target_email text, target_role text)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target_user_id uuid;
begin
  if not public.is_org_admin(target_org) then
    raise exception 'Only an administrator can manage users';
  end if;

  if target_role not in ('admin','assistant','inspector','engineer','viewer') then
    raise exception 'Invalid role';
  end if;

  select id into target_user_id
  from auth.users
  where lower(email) = lower(trim(target_email))
  limit 1;

  if target_user_id is null then
    raise exception 'No user exists with this email';
  end if;

  insert into public.memberships(org_id, user_id, role)
  values (target_org, target_user_id, target_role)
  on conflict (org_id, user_id)
  do update set role = excluded.role;

  return target_user_id;
end;
$$;

grant execute on function public.set_org_member_role(uuid, text, text) to authenticated;

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
with check (public.can_org_edit(org_id));

drop policy if exists workspace_update_member on public.workspace_state;
create policy workspace_update_member
on public.workspace_state for update
to authenticated
using (public.can_org_edit(org_id))
with check (public.can_org_edit(org_id));

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
  and public.can_org_edit(((storage.foldername(name))[1])::uuid)
);

drop policy if exists rameng_files_update on storage.objects;
create policy rameng_files_update
on storage.objects for update
to authenticated
using (
  bucket_id = 'crm-files'
  and public.can_org_edit(((storage.foldername(name))[1])::uuid)
)
with check (
  bucket_id = 'crm-files'
  and public.can_org_edit(((storage.foldername(name))[1])::uuid)
);

drop policy if exists rameng_files_delete on storage.objects;
create policy rameng_files_delete
on storage.objects for delete
to authenticated
using (
  bucket_id = 'crm-files'
  and public.can_org_edit(((storage.foldername(name))[1])::uuid)
);

-- Realtime updates for shared workspace state.
do $$
begin
  alter publication supabase_realtime add table public.workspace_state;
exception
  when duplicate_object then null;
end $$;

-- Setup flow:
-- 1. Keep public self-signup disabled.
-- 2. Create users under Authentication > Users.
-- 3. The first user to sign in becomes the initial admin.
-- 4. Additional users can be assigned from the CRM Users & Permissions screen.
