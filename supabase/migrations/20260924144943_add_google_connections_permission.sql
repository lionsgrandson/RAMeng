-- Google Workspace connection is an explicit, developer-granted permission.
-- It controls access to the personal OAuth flow; infrastructure credentials remain developer-only.

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

  if target_area in ('connections','imports','settings') then
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
      if area_entry.key not in ('contacts','projects','tasks','calendar','files','reports','finance','communication','connections','imports','settings') then
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
          and area_entry.key in ('connections','imports','settings')
          and action_entry.value = 'true'::jsonb
          and coalesce(existing_target_permissions #> array[area_entry.key, action_entry.key], 'false'::jsonb) <> 'true'::jsonb then
          raise exception 'Only the developer can grant Google connection, import, or settings permissions';
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

revoke all on function public.set_org_member_permissions(uuid, uuid, jsonb) from public, anon;
grant execute on function public.set_org_member_permissions(uuid, uuid, jsonb) to authenticated;
