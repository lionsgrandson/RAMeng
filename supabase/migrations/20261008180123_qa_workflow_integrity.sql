-- Incremental fixes; preserve workspace records and existing grants.
begin;
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


  if caller_role = 'external' then
    -- The external snapshot contains only explicitly assigned tasks. Never replace
    -- an organization document with this filtered snapshot.
    if jsonb_typeof(next_data->'tasks') is distinct from 'array' then raise exception 'Invalid tasks'; end if;
    if (select count(*) from jsonb_array_elements(next_data->'tasks')) <> (select count(distinct value->>'id') from jsonb_array_elements(next_data->'tasks')) then raise exception 'Duplicate task identifiers'; end if;
    for next_section in select value from jsonb_array_elements(next_data->'tasks') loop
      select value into current_section from jsonb_array_elements(coalesce(current_data->'tasks','[]')) where value->>'id'=next_section->>'id';
      if current_section is null or current_section->>'assigneeId' is distinct from auth.uid()::text or not exists(select 1 from public.project_collaborators c where c.org_id=target_org and c.user_id=auth.uid() and c.project_id=current_section->>'projectId') then raise exception 'Task access denied'; end if;
      if (current_section - 'emailTo' - 'gmailThreadId' - 'custom' - 'status') is distinct from (next_section - 'emailTo' - 'gmailThreadId' - 'custom' - 'status') then raise exception 'Only assigned task status may change'; end if;
      if not exists(select 1 from jsonb_array_elements_text(coalesce(current_data->'taskStatuses','[]')) status where status=next_section->>'status') then raise exception 'Invalid status'; end if;
    end loop;
    effective_data := jsonb_set(current_data, '{tasks}', coalesce((select jsonb_agg(case
      when n.value is null then t.value
      when n.value->>'status' in ('בוצע','סגור') then jsonb_set(jsonb_set(t.value,'{status}',n.value->'status'),'{completedAt}',coalesce(t.value->'completedAt',to_jsonb(now())))
      else jsonb_set(t.value - 'completedAt','{status}',n.value->'status')
    end) from jsonb_array_elements(coalesce(current_data->'tasks','[]')) t left join jsonb_array_elements(next_data->'tasks') n on n.value->>'id'=t.value->>'id'),'[]'::jsonb));
    -- Only status is accepted; other sections and omitted tasks remain unchanged.
    next_version := current_version + 1;
    update public.workspace_state set data=effective_data, version=next_version, updated_by=auth.uid(), updated_at=now() where org_id=target_org;
    return next_version;
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
    effective_data := jsonb_set(effective_data, '{categories}', coalesce(current_data->'categories','[]'::jsonb),true);
    effective_data := jsonb_set(effective_data, '{meetingSummaries}', coalesce(current_data->'meetingSummaries','[]'::jsonb),true);
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
      when changed_key in ('tasks','taskColumns','taskStatuses','checklistTemplates','categories','meetingSummaries') then 'tasks'
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
create or replace function public.set_project_collaborator(target_org uuid, target_project text, target_user uuid, allow_access boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_org_admin(target_org) then raise exception 'Access denied'; end if;
  if not exists (select 1 from public.memberships where org_id=target_org and user_id=target_user and role='external') then raise exception 'External membership required'; end if;
  if allow_access then
    if not exists (select 1 from public.workspace_state ws, jsonb_array_elements(coalesce(ws.data->'projects','[]')) p where ws.org_id=target_org and p->>'id'=target_project) then raise exception 'Project not found'; end if;
    insert into public.project_collaborators(org_id,project_id,user_id) values(target_org,target_project,target_user) on conflict do nothing;
  else
    delete from public.project_collaborators where org_id=target_org and project_id=target_project and user_id=target_user;
  end if;
  -- Grant changes alter filtered projections even when business records do not change.
  -- Lock/update in the same transaction so polling and stale saves see a new version.
  if found then
    update public.workspace_state set version=version+1, updated_by=auth.uid(), updated_at=now() where org_id=target_org;
  end if;
end; $$;
create or replace function rameng_private.notify_task_assignment()
returns trigger language plpgsql security definer set search_path='' as $$
declare t jsonb; recipient uuid; address text;
begin
  for t in select value from jsonb_array_elements(coalesce(new.data->'tasks','[]')) loop
    if coalesce(t->>'assigneeId','')='' or exists(select 1 from jsonb_array_elements(coalesce(old.data->'tasks','[]')) previous where previous->>'id'=t->>'id' and previous->>'assigneeId'=t->>'assigneeId' and nullif(previous->>'projectId','') is not distinct from nullif(t->>'projectId','')) then continue; end if;
    select m.user_id,u.email into recipient,address from public.memberships m join auth.users u on u.id=m.user_id where m.org_id=new.org_id and m.user_id::text=t->>'assigneeId';
    if recipient is not null and address is not null then
      insert into public.task_notifications(org_id,task_id,project_id,user_id,assigned_by,title,email) values(new.org_id,t->>'id',nullif(t->>'projectId',''),recipient,auth.uid(),t->>'title',address);
    end if;
  end loop;
  update public.task_notifications n set state='cancelled' where n.org_id=new.org_id and n.state in ('pending','failed') and not exists(select 1 from jsonb_array_elements(coalesce(new.data->'tasks','[]')) t_entry where t_entry->>'id'=n.task_id and t_entry->>'assigneeId'=n.user_id::text and nullif(t_entry->>'projectId','') is not distinct from n.project_id);
  return new;
end; $$;
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

  if auth.uid() is null or caller_role is null or caller_role not in ('developer','admin','manager') then
    raise exception 'Only an administrator can manage users';
  end if;

  if target_role not in ('developer','admin','assistant','inspector','engineer','viewer','reviewer','external') then
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

-- A removed sender or a converted external account must not retain organization notification access.
drop policy recipient_notifications on public.task_notifications;
create policy recipient_notifications on public.task_notifications for select to authenticated using (
  public.is_org_member(org_id) and (
    (user_id=(select auth.uid()) and (not exists(select 1 from public.memberships m where m.org_id=task_notifications.org_id and m.user_id=auth.uid() and m.role='external') or exists(select 1 from public.project_collaborators c where c.org_id=task_notifications.org_id and c.user_id=auth.uid() and c.project_id=task_notifications.project_id)))
    or (assigned_by=(select auth.uid()) and not exists(select 1 from public.memberships m where m.org_id=task_notifications.org_id and m.user_id=auth.uid() and m.role='external'))
    or public.is_org_admin(org_id)
  )
);
commit;
