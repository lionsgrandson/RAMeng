begin;
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
  if user_role = 'external' then
    return (target_action='view' and target_area in ('projects','tasks')) or (target_area='tasks' and target_action='status');
  end if;
  if user_role = 'developer' then
    return true;
  end if;

  -- The connection page is viewable; OAuth configuration still requires explicit edit.
  if target_area = 'connections' and target_action = 'view' then return true; end if;

  if user_permissions #>> array[target_area, 'view'] = 'false' then return false; end if;

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

-- A task-local compare-and-set avoids submitting a filtered workspace or stale
-- server-owned completion metadata. Preserve every other task and workspace field.
create or replace function public.set_assigned_task_status(
  target_org uuid, target_task text, next_status text, expected_status text
) returns bigint language plpgsql security definer set search_path = '' as $$
declare
  document jsonb;
  current_task jsonb;
  updated_task jsonb;
  task_index integer;
  current_version bigint;
  stamp timestamptz := clock_timestamp();
begin
  if auth.uid() is null then raise exception 'Task access denied' using errcode='42501'; end if;
  select data, version into document, current_version from public.workspace_state where org_id=target_org for update;
  if not exists(select 1 from public.memberships where org_id=target_org and user_id=auth.uid() and role='external') then
    raise exception 'Task access denied' using errcode='42501';
  end if;
  select value, ordinality::integer-1 into current_task, task_index
    from jsonb_array_elements(coalesce(document->'tasks','[]')) with ordinality where value->>'id'=target_task;
  if current_task is null or current_task->>'assigneeId' is distinct from auth.uid()::text
    or not exists(select 1 from public.project_collaborators where org_id=target_org and user_id=auth.uid() and project_id=current_task->>'projectId') then
    raise exception 'Task access denied' using errcode='42501';
  end if;
  if next_status is null or not exists(select 1 from jsonb_array_elements_text(document->'taskStatuses') s where s=next_status) then
    raise exception 'Invalid status' using errcode='22023';
  end if;
  -- Safe retry after an uncertain response; never fabricate another completion.
  if current_task->>'status'=next_status then return current_version; end if;
  if current_task->>'status' is distinct from expected_status then raise exception 'TASK_STATUS_CONFLICT' using errcode='40001'; end if;
  updated_task := jsonb_set(current_task,'{status}',to_jsonb(next_status));
  if next_status in ('בוצע','סגור') then
    updated_task := updated_task || jsonb_build_object('completedAt',coalesce(nullif(current_task->'completedAt','null'::jsonb),to_jsonb(stamp)), 'completedBy',coalesce(nullif(current_task->'completedBy','null'::jsonb),to_jsonb(auth.uid()::text)));
  else
    updated_task := updated_task - 'completedAt' - 'completedBy';
  end if;
  document := jsonb_set(document,array['tasks',task_index::text],updated_task);
  document := jsonb_set(document,'{audit}',jsonb_build_array(jsonb_build_object('id',gen_random_uuid()::text,'at',stamp,'actor',auth.uid()::text,'action','עדכון סטטוס משימה: ' || next_status,'entity','משימות','entityId',target_task)) || coalesce(document->'audit','[]'::jsonb));
  update public.workspace_state set data=document, version=current_version+1, updated_by=auth.uid(), updated_at=stamp where org_id=target_org;
  return current_version+1;
end;
$$;
revoke all on function public.set_assigned_task_status(uuid,text,text,text) from public, anon;
grant execute on function public.set_assigned_task_status(uuid,text,text,text) to authenticated;

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

  if auth.uid() is null or caller_role is null or caller_role not in ('developer','admin','manager') then
    raise exception 'Only an administrator can manage users';
  end if;

  select role, permissions into target_role, existing_target_permissions
  from public.memberships
  where org_id = target_org
    and user_id = target_user
  for update;

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

      end loop;
    end loop;
  end if;

  if caller_role <> 'developer' then
    for area_entry in select unnest(array['connections','imports','settings']) as key loop
      for action_entry in select unnest(array['view','create','edit','status','delete']) as key loop
        if public.workspace_permission_allowed(target_role, target_permissions, area_entry.key, action_entry.key)
          and not public.workspace_permission_allowed(target_role, existing_target_permissions, area_entry.key, action_entry.key) then
          raise exception 'Only the developer can grant Google connection, import, or settings permissions' using errcode='42501';
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

revoke all on function public.set_org_member_permissions(uuid,uuid,jsonb) from public, anon;
grant execute on function public.set_org_member_permissions(uuid,uuid,jsonb) to authenticated;
commit;
