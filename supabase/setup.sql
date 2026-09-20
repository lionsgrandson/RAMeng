-- RAMeng CRM Supabase production bootstrap
-- Current schema: 2026-09-20
-- Run this entire file in Supabase SQL Editor for the RAM Engineering project.
-- The script is intentionally idempotent so the latest version can be run again after updates.

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
  check (role in ('developer','admin','assistant','inspector','engineer','viewer','reviewer','manager','member'));

alter table public.memberships add column if not exists permissions jsonb;

create index if not exists memberships_user_idx on public.memberships(user_id);

create table if not exists public.workspace_state (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  version bigint not null default 0,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.workspace_state add column if not exists version bigint not null default 0;

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
    select 1
    from public.memberships m
    where m.org_id = target_org
      and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_org_developer(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.memberships m
    where m.org_id = target_org
      and m.user_id = auth.uid()
      and m.role = 'developer'
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
    select 1
    from public.memberships m
    where m.org_id = target_org
      and m.user_id = auth.uid()
      and m.role in ('developer','admin','manager')
  );
$$;

create or replace function public.workspace_permission_allowed(
  user_role text,
  user_permissions jsonb,
  target_area text,
  target_action text
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  custom_value text;
begin
  if user_role = 'developer' then
    return true;
  end if;

  custom_value := user_permissions #>> array[target_area, target_action];
  if custom_value in ('true', 'false') then
    return custom_value::boolean;
  end if;

  if target_action = 'view' then
    return user_role in ('admin','manager','assistant','inspector','engineer','viewer','reviewer','member');
  end if;

  if user_role in ('admin','manager') then
    return true;
  end if;

  if user_role = 'assistant' then
    return target_area = any(array['contacts','projects','tasks','calendar','files','finance','communication']);
  end if;

  if user_role in ('inspector','engineer') then
    return target_area = any(array['projects','tasks','calendar','files','reports','communication']);
  end if;

  return false;
end;
$$;

create or replace function public.can_org_action(target_org uuid, target_area text, target_action text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select public.workspace_permission_allowed(m.role, m.permissions, target_area, target_action)
      from public.memberships m
      where m.org_id = target_org
        and m.user_id = auth.uid()
      limit 1
    ),
    false
  );
$$;

create or replace function public.jsonb_status_only_change(before_value jsonb, after_value jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  key_name text;
  idx integer;
  before_type text;
  after_type text;
begin
  if before_value is not distinct from after_value then
    return true;
  end if;

  before_type := jsonb_typeof(before_value);
  after_type := jsonb_typeof(after_value);
  if before_type is distinct from after_type then
    return false;
  end if;

  if before_type = 'object' then
    for key_name in
      select key from (
        select jsonb_object_keys(coalesce(before_value, '{}'::jsonb)) as key
        union
        select jsonb_object_keys(coalesce(after_value, '{}'::jsonb)) as key
      ) keys
    loop
      if key_name = 'status' then
        continue;
      end if;
      if not public.jsonb_status_only_change(before_value -> key_name, after_value -> key_name) then
        return false;
      end if;
    end loop;
    return true;
  end if;

  if before_type = 'array' then
    if jsonb_array_length(before_value) <> jsonb_array_length(after_value) then
      return false;
    end if;
    if jsonb_array_length(before_value) = 0 then
      return true;
    end if;
    for idx in 0..jsonb_array_length(before_value) - 1 loop
      if not public.jsonb_status_only_change(before_value -> idx, after_value -> idx) then
        return false;
      end if;
    end loop;
    return true;
  end if;

  return false;
end;
$$;

create or replace function public.jsonb_has_nested_entity_deletion(before_value jsonb, after_value jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  key_name text;
  idx integer;
  overlap_length integer;
  identifiable boolean;
  old_item jsonb;
  new_item jsonb;
begin
  if before_value is null or after_value is null or before_value is not distinct from after_value then
    return false;
  end if;

  if jsonb_typeof(before_value) is distinct from jsonb_typeof(after_value) then
    return false;
  end if;

  if jsonb_typeof(before_value) = 'object' then
    for key_name in select jsonb_object_keys(before_value)
    loop
      if after_value ? key_name
        and public.jsonb_has_nested_entity_deletion(before_value -> key_name, after_value -> key_name) then
        return true;
      end if;
    end loop;
    return false;
  end if;

  if jsonb_typeof(before_value) = 'array' then
    identifiable := jsonb_array_length(before_value) > 0
      and not exists (
        select 1 from jsonb_array_elements(before_value) item
        where jsonb_typeof(item) <> 'object' or not (item ? 'id')
      )
      and not exists (
        select 1 from jsonb_array_elements(after_value) item
        where jsonb_typeof(item) <> 'object' or not (item ? 'id')
      );

    if identifiable then
      if exists (
        select 1
        from jsonb_array_elements(before_value) old_element
        where not exists (
          select 1
          from jsonb_array_elements(after_value) new_element
          where new_element ->> 'id' = old_element ->> 'id'
        )
      ) then
        return true;
      end if;

      for old_item, new_item in
        select old_element, new_element
        from jsonb_array_elements(before_value) old_element
        join jsonb_array_elements(after_value) new_element
          on new_element ->> 'id' = old_element ->> 'id'
      loop
        if public.jsonb_has_nested_entity_deletion(old_item, new_item) then
          return true;
        end if;
      end loop;

      return false;
    end if;

    overlap_length := least(jsonb_array_length(before_value), jsonb_array_length(after_value));
    if overlap_length > 0 then
      for idx in 0..overlap_length - 1 loop
        if public.jsonb_has_nested_entity_deletion(before_value -> idx, after_value -> idx) then
          return true;
        end if;
      end loop;
    end if;
  end if;

  return false;
end;
$$;

create or replace function public.get_workspace_state(target_org uuid)
returns table (
  data jsonb,
  version bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  caller_role text;
  caller_permissions jsonb;
  filtered_data jsonb;
  state_version bigint;
begin
  select m.role, m.permissions
  into caller_role, caller_permissions
  from public.memberships m
  where m.org_id = target_org
    and m.user_id = auth.uid()
  limit 1;

  if caller_role is null then
    raise exception 'Access denied';
  end if;

  select ws.data, ws.version
  into filtered_data, state_version
  from public.workspace_state ws
  where ws.org_id = target_org
  limit 1;

  if filtered_data is null then
    return;
  end if;

  if not public.workspace_permission_allowed(caller_role, caller_permissions, 'contacts', 'view') then
    filtered_data := jsonb_set(filtered_data, '{contacts}', '[]'::jsonb, true);
    filtered_data := jsonb_set(filtered_data, '{deals}', '[]'::jsonb, true);
  end if;

  if not public.workspace_permission_allowed(caller_role, caller_permissions, 'projects', 'view') then
    filtered_data := jsonb_set(filtered_data, '{projects}', '[]'::jsonb, true);
  end if;

  if not public.workspace_permission_allowed(caller_role, caller_permissions, 'tasks', 'view') then
    filtered_data := jsonb_set(filtered_data, '{tasks}', '[]'::jsonb, true);
    filtered_data := jsonb_set(filtered_data, '{taskColumns}', '[]'::jsonb, true);
    filtered_data := jsonb_set(filtered_data, '{taskStatuses}', '[]'::jsonb, true);
    filtered_data := jsonb_set(filtered_data, '{checklistTemplates}', '[]'::jsonb, true);
  end if;

  if not public.workspace_permission_allowed(caller_role, caller_permissions, 'calendar', 'view') then
    filtered_data := jsonb_set(filtered_data, '{events}', '[]'::jsonb, true);
  end if;

  if not public.workspace_permission_allowed(caller_role, caller_permissions, 'files', 'view') then
    filtered_data := jsonb_set(filtered_data, '{files}', '[]'::jsonb, true);
  end if;

  if not public.workspace_permission_allowed(caller_role, caller_permissions, 'reports', 'view') then
    filtered_data := jsonb_set(filtered_data, '{reports}', '[]'::jsonb, true);
    filtered_data := jsonb_set(filtered_data, '{reportTemplates}', '[]'::jsonb, true);
  end if;

  if not public.workspace_permission_allowed(caller_role, caller_permissions, 'finance', 'view') then
    filtered_data := jsonb_set(filtered_data, '{quotes}', '[]'::jsonb, true);
  end if;

  if not public.workspace_permission_allowed(caller_role, caller_permissions, 'communication', 'view') then
    filtered_data := jsonb_set(filtered_data, '{clientNotes}', '[]'::jsonb, true);
  end if;

  return query select filtered_data, state_version;
end;
$$;

create or replace function public.can_org_edit(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.memberships m
    where m.org_id = target_org
      and m.user_id = auth.uid()
      and (
        public.workspace_permission_allowed(m.role, m.permissions, 'contacts', 'create')
        or public.workspace_permission_allowed(m.role, m.permissions, 'contacts', 'edit')
        or public.workspace_permission_allowed(m.role, m.permissions, 'contacts', 'status')
        or public.workspace_permission_allowed(m.role, m.permissions, 'contacts', 'delete')
        or public.workspace_permission_allowed(m.role, m.permissions, 'projects', 'create')
        or public.workspace_permission_allowed(m.role, m.permissions, 'projects', 'edit')
        or public.workspace_permission_allowed(m.role, m.permissions, 'projects', 'status')
        or public.workspace_permission_allowed(m.role, m.permissions, 'projects', 'delete')
        or public.workspace_permission_allowed(m.role, m.permissions, 'tasks', 'create')
        or public.workspace_permission_allowed(m.role, m.permissions, 'tasks', 'edit')
        or public.workspace_permission_allowed(m.role, m.permissions, 'tasks', 'status')
        or public.workspace_permission_allowed(m.role, m.permissions, 'tasks', 'delete')
        or public.workspace_permission_allowed(m.role, m.permissions, 'calendar', 'create')
        or public.workspace_permission_allowed(m.role, m.permissions, 'calendar', 'edit')
        or public.workspace_permission_allowed(m.role, m.permissions, 'calendar', 'delete')
        or public.workspace_permission_allowed(m.role, m.permissions, 'files', 'create')
        or public.workspace_permission_allowed(m.role, m.permissions, 'files', 'edit')
        or public.workspace_permission_allowed(m.role, m.permissions, 'files', 'delete')
        or public.workspace_permission_allowed(m.role, m.permissions, 'reports', 'create')
        or public.workspace_permission_allowed(m.role, m.permissions, 'reports', 'edit')
        or public.workspace_permission_allowed(m.role, m.permissions, 'reports', 'status')
        or public.workspace_permission_allowed(m.role, m.permissions, 'reports', 'delete')
        or public.workspace_permission_allowed(m.role, m.permissions, 'finance', 'create')
        or public.workspace_permission_allowed(m.role, m.permissions, 'finance', 'edit')
        or public.workspace_permission_allowed(m.role, m.permissions, 'finance', 'status')
        or public.workspace_permission_allowed(m.role, m.permissions, 'finance', 'delete')
        or public.workspace_permission_allowed(m.role, m.permissions, 'communication', 'create')
        or public.workspace_permission_allowed(m.role, m.permissions, 'communication', 'edit')
        or public.workspace_permission_allowed(m.role, m.permissions, 'communication', 'delete')
      )
  );
$$;

create or replace function public.save_workspace_state(
  target_org uuid,
  next_data jsonb,
  expected_version bigint
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_role text;
  caller_permissions jsonb;
  current_data jsonb;
  current_version bigint;
  changed_key text;
  target_area text;
  current_section jsonb;
  next_section jsonb;
  has_identifiable_items boolean;
  has_created boolean;
  has_deleted boolean;
  has_edited boolean;
  has_status_change boolean;
  effective_data jsonb;
  next_version bigint;
begin
  select m.role, m.permissions into caller_role, caller_permissions
  from public.memberships m
  where m.org_id = target_org
    and m.user_id = auth.uid()
  limit 1;

  if caller_role is null then
    raise exception 'Access denied';
  end if;

  select ws.data, ws.version
    into current_data, current_version
  from public.workspace_state ws
  where ws.org_id = target_org
  for update;

  if current_version is null then
    raise exception 'Workspace not initialized';
  end if;

  if current_version <> expected_version then
    raise exception 'WORKSPACE_VERSION_CONFLICT';
  end if;

  effective_data := next_data;

  if not public.workspace_permission_allowed(caller_role, caller_permissions, 'contacts', 'view') then
    effective_data := jsonb_set(effective_data, '{contacts}', coalesce(current_data -> 'contacts', '[]'::jsonb), true);
    effective_data := jsonb_set(effective_data, '{deals}', coalesce(current_data -> 'deals', '[]'::jsonb), true);
  end if;

  if not public.workspace_permission_allowed(caller_role, caller_permissions, 'projects', 'view') then
    effective_data := jsonb_set(effective_data, '{projects}', coalesce(current_data -> 'projects', '[]'::jsonb), true);
  end if;

  if not public.workspace_permission_allowed(caller_role, caller_permissions, 'tasks', 'view') then
    effective_data := jsonb_set(effective_data, '{tasks}', coalesce(current_data -> 'tasks', '[]'::jsonb), true);
    effective_data := jsonb_set(effective_data, '{taskColumns}', coalesce(current_data -> 'taskColumns', '[]'::jsonb), true);
    effective_data := jsonb_set(effective_data, '{taskStatuses}', coalesce(current_data -> 'taskStatuses', '[]'::jsonb), true);
    effective_data := jsonb_set(effective_data, '{checklistTemplates}', coalesce(current_data -> 'checklistTemplates', '[]'::jsonb), true);
  end if;

  if not public.workspace_permission_allowed(caller_role, caller_permissions, 'calendar', 'view') then
    effective_data := jsonb_set(effective_data, '{events}', coalesce(current_data -> 'events', '[]'::jsonb), true);
  end if;

  if not public.workspace_permission_allowed(caller_role, caller_permissions, 'files', 'view') then
    effective_data := jsonb_set(effective_data, '{files}', coalesce(current_data -> 'files', '[]'::jsonb), true);
  end if;

  if not public.workspace_permission_allowed(caller_role, caller_permissions, 'reports', 'view') then
    effective_data := jsonb_set(effective_data, '{reports}', coalesce(current_data -> 'reports', '[]'::jsonb), true);
    effective_data := jsonb_set(effective_data, '{reportTemplates}', coalesce(current_data -> 'reportTemplates', '[]'::jsonb), true);
  end if;

  if not public.workspace_permission_allowed(caller_role, caller_permissions, 'finance', 'view') then
    effective_data := jsonb_set(effective_data, '{quotes}', coalesce(current_data -> 'quotes', '[]'::jsonb), true);
  end if;

  if not public.workspace_permission_allowed(caller_role, caller_permissions, 'communication', 'view') then
    effective_data := jsonb_set(effective_data, '{clientNotes}', coalesce(current_data -> 'clientNotes', '[]'::jsonb), true);
  end if;

  for changed_key in
    select key
    from (
      select jsonb_object_keys(coalesce(current_data, '{}'::jsonb)) as key
      union
      select jsonb_object_keys(coalesce(effective_data, '{}'::jsonb)) as key
    ) keys
    where coalesce(current_data -> key, 'null'::jsonb) is distinct from coalesce(effective_data -> key, 'null'::jsonb)
  loop
    if changed_key = 'audit' then
      continue;
    end if;

    if changed_key = 'team' then
      if caller_role not in ('developer','admin','manager') then
        raise exception 'This account cannot manage team data';
      end if;
      continue;
    end if;

    if changed_key = 'settings' then
      if caller_role <> 'developer' then
        raise exception 'Only the developer can change system settings';
      end if;
      continue;
    end if;

    target_area := case
      when changed_key in ('contacts','deals') then 'contacts'
      when changed_key = 'projects' then 'projects'
      when changed_key in ('tasks','taskColumns','taskStatuses','checklistTemplates') then 'tasks'
      when changed_key = 'events' then 'calendar'
      when changed_key = 'files' then 'files'
      when changed_key in ('reports','reportTemplates') then 'reports'
      when changed_key = 'quotes' then 'finance'
      when changed_key = 'clientNotes' then 'communication'
      else null
    end;

    if target_area is null then
      raise exception 'Workspace section % is not permission-mapped', changed_key;
    end if;

    current_section := coalesce(current_data -> changed_key, 'null'::jsonb);
    next_section := coalesce(effective_data -> changed_key, 'null'::jsonb);
    has_created := false;
    has_deleted := false;
    has_edited := false;
    has_status_change := false;

    if jsonb_typeof(current_section) = 'array' and jsonb_typeof(next_section) = 'array' then
      select coalesce(bool_and(jsonb_typeof(item) = 'object' and item ? 'id'), true)
      into has_identifiable_items
      from (
        select value as item from jsonb_array_elements(current_section)
        union all
        select value as item from jsonb_array_elements(next_section)
      ) items;

      if has_identifiable_items then
        select exists (
          select 1
          from jsonb_array_elements(next_section) n
          where not exists (
            select 1 from jsonb_array_elements(current_section) c
            where c ->> 'id' = n ->> 'id'
          )
        ) into has_created;

        select exists (
          select 1
          from jsonb_array_elements(current_section) c
          where not exists (
            select 1 from jsonb_array_elements(next_section) n
            where n ->> 'id' = c ->> 'id'
          )
        ) into has_deleted;

        if not has_deleted then
          select exists (
            select 1
            from jsonb_array_elements(current_section) old_item
            join jsonb_array_elements(next_section) new_item
              on new_item ->> 'id' = old_item ->> 'id'
            where public.jsonb_has_nested_entity_deletion(old_item, new_item)
          ) into has_deleted;
        end if;

        select exists (
          select 1
          from jsonb_array_elements(current_section) old_item
          join jsonb_array_elements(next_section) new_item on new_item ->> 'id' = old_item ->> 'id'
          where old_item is distinct from new_item
            and not public.jsonb_status_only_change(old_item, new_item)
        ) into has_edited;

        select exists (
          select 1
          from jsonb_array_elements(current_section) old_item
          join jsonb_array_elements(next_section) new_item on new_item ->> 'id' = old_item ->> 'id'
          where old_item is distinct from new_item
            and public.jsonb_status_only_change(old_item, new_item)
        ) into has_status_change;
      else
        has_edited := current_section is distinct from next_section;
      end if;
    else
      has_edited := current_section is distinct from next_section;
    end if;

    if has_created and not public.workspace_permission_allowed(caller_role, caller_permissions, target_area, 'create') then
      raise exception 'Permission denied: create in %', target_area;
    end if;

    if has_deleted and not public.workspace_permission_allowed(caller_role, caller_permissions, target_area, 'delete') then
      raise exception 'Permission denied: delete in %', target_area;
    end if;

    if has_edited and not public.workspace_permission_allowed(caller_role, caller_permissions, target_area, 'edit') then
      raise exception 'Permission denied: edit in %', target_area;
    end if;

    if has_status_change
      and not public.workspace_permission_allowed(caller_role, caller_permissions, target_area, 'status')
      and not public.workspace_permission_allowed(caller_role, caller_permissions, target_area, 'edit') then
      raise exception 'Permission denied: status in %', target_area;
    end if;
  end loop;

  next_version := current_version + 1;

  update public.workspace_state
  set data = effective_data,
      version = next_version,
      updated_by = auth.uid(),
      updated_at = now()
  where org_id = target_org;

  return next_version;
end;
$$;

-- The first authenticated user initializes the organization. The configured
-- developer email is promoted to the protected developer role by the Worker.
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

create or replace function public.list_org_members(target_org uuid)
returns table (
  user_id uuid,
  email text,
  display_name text,
  role text,
  permissions jsonb,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not public.is_org_admin(target_org) then
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
    m.permissions,
    m.created_at
  from public.memberships m
  join auth.users u on u.id = m.user_id
  where m.org_id = target_org
  order by case when m.role = 'developer' then 0 else 1 end, m.created_at;
end;
$$;

create or replace function public.set_org_member_role(target_org uuid, target_email text, target_role text)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target_user_id uuid;
  caller_role text;
  existing_target_role text;
begin
  select role into caller_role
  from public.memberships
  where org_id = target_org
    and user_id = auth.uid()
  limit 1;

  if caller_role not in ('developer','admin','manager') then
    raise exception 'Only an administrator can manage users';
  end if;

  if target_role not in ('developer','admin','assistant','inspector','engineer','viewer','reviewer') then
    raise exception 'Invalid role';
  end if;

  if target_role = 'developer' and caller_role <> 'developer' then
    raise exception 'Only the developer can assign the developer role';
  end if;

  select id into target_user_id
  from auth.users
  where lower(email) = lower(trim(target_email))
  limit 1;

  if target_user_id is null then
    raise exception 'No user exists with this email';
  end if;

  select role into existing_target_role
  from public.memberships
  where org_id = target_org
    and user_id = target_user_id
  limit 1;

  if existing_target_role = 'developer' and caller_role <> 'developer' then
    raise exception 'Only the developer can change the developer account';
  end if;

  insert into public.memberships(org_id, user_id, role, permissions)
  values (target_org, target_user_id, target_role, null)
  on conflict (org_id, user_id)
  do update set role = excluded.role, permissions = null;

  return target_user_id;
end;
$$;

create or replace function public.set_org_member_permissions(target_org uuid, target_user uuid, target_permissions jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  caller_role text;
  target_role text;
  area_entry record;
  action_entry record;
begin
  select role into caller_role
  from public.memberships
  where org_id = target_org
    and user_id = auth.uid()
  limit 1;

  if caller_role not in ('developer','admin','manager') then
    raise exception 'Only an administrator can manage users';
  end if;

  select role into target_role
  from public.memberships
  where org_id = target_org
    and user_id = target_user
  limit 1;

  if target_role is null then
    raise exception 'User is not a member of this organization';
  end if;

  if target_role = 'developer' then
    raise exception 'Developer permissions are protected';
  end if;

  if target_permissions is not null then
    if jsonb_typeof(target_permissions) <> 'object' then
      raise exception 'Permissions must be a JSON object';
    end if;

    for area_entry in select key, value from jsonb_each(target_permissions) loop
      if area_entry.key not in ('contacts','projects','tasks','calendar','files','reports','finance','communication') then
        raise exception 'Invalid permission area: %', area_entry.key;
      end if;
      if jsonb_typeof(area_entry.value) <> 'object' then
        raise exception 'Permission area % must be an object', area_entry.key;
      end if;
      for action_entry in select key, value from jsonb_each(area_entry.value) loop
        if action_entry.key not in ('view','create','edit','status','delete') then
          raise exception 'Invalid permission action: %', action_entry.key;
        end if;
        if jsonb_typeof(action_entry.value) <> 'boolean' then
          raise exception 'Permission % in % must be boolean', action_entry.key, area_entry.key;
        end if;
      end loop;
    end loop;
  end if;

  update public.memberships
  set permissions = target_permissions
  where org_id = target_org
    and user_id = target_user;

  return target_user;
end;
$$;

-- Do not expose helper RPCs to anonymous clients. They still perform their own
-- authorization checks, but explicit grants make the intended boundary clear.
revoke all on function public.is_org_member(uuid) from public, anon;
revoke all on function public.is_org_developer(uuid) from public, anon;
revoke all on function public.is_org_admin(uuid) from public, anon;
revoke all on function public.workspace_permission_allowed(text, jsonb, text, text) from public, anon;
revoke all on function public.can_org_action(uuid, text, text) from public, anon;
revoke all on function public.jsonb_status_only_change(jsonb, jsonb) from public, anon;
revoke all on function public.jsonb_has_nested_entity_deletion(jsonb, jsonb) from public, anon;
revoke all on function public.get_workspace_state(uuid) from public, anon;
revoke all on function public.can_org_edit(uuid) from public, anon;
revoke all on function public.save_workspace_state(uuid, jsonb, bigint) from public, anon;
revoke all on function public.bootstrap_first_admin() from public, anon;
revoke all on function public.list_org_members(uuid) from public, anon;
revoke all on function public.set_org_member_role(uuid, text, text) from public, anon;
revoke all on function public.set_org_member_permissions(uuid, uuid, jsonb) from public, anon;

grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.is_org_developer(uuid) to authenticated;
grant execute on function public.is_org_admin(uuid) to authenticated;
grant execute on function public.can_org_action(uuid, text, text) to authenticated;
grant execute on function public.get_workspace_state(uuid) to authenticated;
grant execute on function public.can_org_edit(uuid) to authenticated;
grant execute on function public.save_workspace_state(uuid, jsonb, bigint) to authenticated;
grant execute on function public.bootstrap_first_admin() to authenticated;
grant execute on function public.list_org_members(uuid) to authenticated;
grant execute on function public.set_org_member_role(uuid, text, text) to authenticated;
grant execute on function public.set_org_member_permissions(uuid, uuid, jsonb) to authenticated;

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
using (user_id = auth.uid() or public.is_org_admin(org_id));

drop policy if exists memberships_insert_admin on public.memberships;
create policy memberships_insert_admin
on public.memberships for insert
to authenticated
with check (
  public.is_org_admin(org_id)
  and (role <> 'developer' or public.is_org_developer(org_id))
);

drop policy if exists memberships_update_admin on public.memberships;
create policy memberships_update_admin
on public.memberships for update
to authenticated
using (
  public.is_org_admin(org_id)
  and (role <> 'developer' or public.is_org_developer(org_id))
)
with check (
  public.is_org_admin(org_id)
  and (role <> 'developer' or public.is_org_developer(org_id))
);

drop policy if exists memberships_delete_admin on public.memberships;
create policy memberships_delete_admin
on public.memberships for delete
to authenticated
using (
  public.is_org_admin(org_id)
  and (role <> 'developer' or public.is_org_developer(org_id))
);

drop policy if exists workspace_select_member on public.workspace_state;
create policy workspace_select_member
on public.workspace_state for select
to authenticated
using (public.is_org_admin(org_id));

drop policy if exists workspace_insert_member on public.workspace_state;
drop policy if exists workspace_update_member on public.workspace_state;

-- Workspace writes go through save_workspace_state(), which validates the caller's
-- role, the changed top-level sections and the optimistic version atomically.
-- Direct client writes are intentionally not granted by RLS.

-- File storage. Files are stored under <org-id>/<project-id>/...
insert into storage.buckets (id, name, public, file_size_limit)
values ('crm-files', 'crm-files', false, 52428800)
on conflict (id)
do update set public = false, file_size_limit = excluded.file_size_limit;

drop policy if exists rameng_files_select on storage.objects;
create policy rameng_files_select
on storage.objects for select
to authenticated
using (
  bucket_id = 'crm-files'
  and public.can_org_action(((storage.foldername(name))[1])::uuid, 'files', 'view')
);

drop policy if exists rameng_files_insert on storage.objects;
create policy rameng_files_insert
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'crm-files'
  and public.can_org_action(((storage.foldername(name))[1])::uuid, 'files', 'create')
);

drop policy if exists rameng_files_update on storage.objects;
create policy rameng_files_update
on storage.objects for update
to authenticated
using (
  bucket_id = 'crm-files'
  and public.can_org_action(((storage.foldername(name))[1])::uuid, 'files', 'edit')
)
with check (
  bucket_id = 'crm-files'
  and public.can_org_action(((storage.foldername(name))[1])::uuid, 'files', 'edit')
);

drop policy if exists rameng_files_delete on storage.objects;
create policy rameng_files_delete
on storage.objects for delete
to authenticated
using (
  bucket_id = 'crm-files'
  and public.can_org_action(((storage.foldername(name))[1])::uuid, 'files', 'delete')
);

-- Realtime updates for the shared workspace.
do $$
begin
  alter publication supabase_realtime add table public.workspace_state;
exception
  when duplicate_object then null;
end $$;

-- Production flow:
-- 1. Keep public self-signup disabled in Supabase Auth.
-- 2. Keep SUPABASE_SECRET_KEY only in Cloudflare Worker secrets.
-- 3. Configure the final CRM URL and /?invite=1 under Auth URL Configuration.
-- 4. Create/invite the first developer account in Supabase Authentication > Users.
-- 5. The first login initializes the organization; the configured developer email is protected by the Worker.
-- 6. Invite all additional users from the CRM Users & Permissions screen.
