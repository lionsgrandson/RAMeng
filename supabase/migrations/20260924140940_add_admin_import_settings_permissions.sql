-- Import and settings are explicit, developer-granted application permissions.
-- Admins continue to manage users by role, independently of these two areas.

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

  if target_area in ('imports','settings') then
    return false;
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

create or replace function public.set_org_member_permissions(target_org uuid, target_user uuid, target_permissions jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  caller_role text;
  target_role text;
  existing_target_permissions jsonb;
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

  select role, permissions into target_role, existing_target_permissions
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
      if area_entry.key not in ('contacts','projects','tasks','calendar','files','reports','finance','communication','imports','settings') then
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
        if caller_role <> 'developer'
          and area_entry.key in ('imports','settings')
          and action_entry.value = 'true'::jsonb
          and coalesce(existing_target_permissions #> array[area_entry.key, action_entry.key], 'false'::jsonb) <> 'true'::jsonb then
          raise exception 'Only the developer can grant import or settings permissions';
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
      if not public.workspace_permission_allowed(caller_role, caller_permissions, 'settings', 'edit') then
        raise exception 'Permission denied: edit in settings';
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

revoke all on function public.workspace_permission_allowed(text, jsonb, text, text) from public, anon;
revoke all on function public.set_org_member_permissions(uuid, uuid, jsonb) from public, anon;
revoke all on function public.save_workspace_state(uuid, jsonb, bigint) from public, anon;
grant execute on function public.set_org_member_permissions(uuid, uuid, jsonb) to authenticated;
grant execute on function public.save_workspace_state(uuid, jsonb, bigint) to authenticated;
