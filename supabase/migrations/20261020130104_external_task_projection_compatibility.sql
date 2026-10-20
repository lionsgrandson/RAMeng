-- Preserve old clients while server-owned completion fields and private email
-- provenance are omitted from external projections. They are never accepted from clients.
begin;
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


  if caller_role = 'external' then
    return query select jsonb_build_object(
      'tasks', coalesce((select jsonb_agg(t - 'emailTo' - 'gmailThreadId' - 'custom' - 'sourceEmail') from jsonb_array_elements(coalesce(filtered_data->'tasks','[]')) t where t->>'assigneeId'=auth.uid()::text and exists(select 1 from public.project_collaborators c where c.org_id=target_org and c.user_id=auth.uid() and c.project_id=t->>'projectId')), '[]'::jsonb),
      'projects', coalesce((select jsonb_agg(jsonb_build_object('id',p->>'id','name',p->>'name','address',p->>'address','status',p->>'status','progress',p->'progress','clientIds','[]'::jsonb,'categoryIds',p->'categoryIds')) from jsonb_array_elements(coalesce(filtered_data->'projects','[]')) p where exists(select 1 from public.project_collaborators c where c.org_id=target_org and c.user_id=auth.uid() and c.project_id=p->>'id')), '[]'::jsonb),
      'team', coalesce((select jsonb_agg(t) from jsonb_array_elements(coalesce(filtered_data->'team','[]')) t where t->>'id'=auth.uid()::text), '[]'::jsonb),
      'categories', coalesce((select jsonb_agg(c) from jsonb_array_elements(coalesce(filtered_data->'categories','[]')) c where exists(select 1 from jsonb_array_elements(coalesce(filtered_data->'projects','[]')) p join public.project_collaborators pc on pc.project_id=p->>'id' and pc.org_id=target_org and pc.user_id=auth.uid() where p->'categoryIds' ? (c->>'id'))),'[]'::jsonb),
      'taskColumns', coalesce((select jsonb_agg(c) from jsonb_array_elements(coalesce(filtered_data->'taskColumns','[]')) c where c->>'key' in ('title','status','assigneeId','startDate','dueDate','followUpDate')), '[]'::jsonb),
      'taskStatuses', coalesce(filtered_data->'taskStatuses','[]'::jsonb),
      'settings', jsonb_build_object('organizationName',filtered_data#>>'{settings,organizationName}','organizationShortName',filtered_data#>>'{settings,organizationShortName}','logoUrl',filtered_data#>>'{settings,logoUrl}')
    ), state_version;
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
    filtered_data := jsonb_set(filtered_data, '{categories}', '[]'::jsonb, true);
    filtered_data := jsonb_set(filtered_data, '{meetingSummaries}', '[]'::jsonb, true);
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
      if (current_section - 'emailTo' - 'gmailThreadId' - 'custom' - 'sourceEmail' - 'completedAt' - 'completedBy' - 'status') is distinct from (next_section - 'emailTo' - 'gmailThreadId' - 'custom' - 'sourceEmail' - 'completedAt' - 'completedBy' - 'status') then raise exception 'Only assigned task status may change'; end if;
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
commit;
