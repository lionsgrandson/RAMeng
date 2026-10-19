-- Fix removal permission checks when a nested collection is omitted or replaced.
-- No records or grants are changed. Preserve the existing helper's signature/ACL.
begin;
create or replace function public.jsonb_has_nested_entity_deletion(before_value jsonb, after_value jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  key_name text;
  idx integer;
  identifiable boolean;
  old_item jsonb;
  new_item jsonb;
begin
  if before_value is null or before_value is not distinct from after_value then return false; end if;
  if jsonb_typeof(before_value) = 'object' then
    if before_value ? 'id' and jsonb_typeof(after_value) is distinct from 'object' then return true; end if;
    for key_name in select jsonb_object_keys(before_value) loop
      if public.jsonb_has_nested_entity_deletion(before_value->key_name,
        case when jsonb_typeof(after_value) = 'object' then after_value->key_name else null end) then return true; end if;
    end loop;
    return false;
  end if;
  if jsonb_typeof(before_value) = 'array' then
    identifiable := jsonb_array_length(before_value) > 0 and not exists (
      select 1 from jsonb_array_elements(before_value) item where jsonb_typeof(item) <> 'object' or not (item ? 'id')
    );
    if identifiable then
      if jsonb_typeof(after_value) is distinct from 'array' then return true; end if;
      for old_item in select value from jsonb_array_elements(before_value) loop
        select value into new_item from jsonb_array_elements(after_value) where value->>'id' = old_item->>'id';
        if new_item is null or public.jsonb_has_nested_entity_deletion(old_item, new_item) then return true; end if;
      end loop;
    else
      if jsonb_array_length(before_value) = 0 then return false; end if;
      for idx in 0..jsonb_array_length(before_value)-1 loop
        if public.jsonb_has_nested_entity_deletion(before_value->idx,
          case when jsonb_typeof(after_value) = 'array' then after_value->idx else null end) then return true; end if;
      end loop;
    end if;
  end if;
  return false;
end;
$$;
revoke all on function public.jsonb_has_nested_entity_deletion(jsonb,jsonb) from public, anon;

create or replace function rameng_private.validate_task_statuses()
returns trigger language plpgsql set search_path = '' as $$
declare
  status_name text;
  task jsonb;
begin
  if new.data->'taskStatuses' is not distinct from old.data->'taskStatuses'
    and new.data->'tasks' is not distinct from old.data->'tasks' then return new; end if;
  if jsonb_typeof(new.data->'taskStatuses') is distinct from 'array' then raise exception 'Invalid task statuses'; end if;
  for status_name in select jsonb_array_elements_text(coalesce(old.data->'taskStatuses','[]')) loop
    if status_name in ('טרם התחיל','בטיפול','ממתין לגורם חיצוני','דורש מעקב','בוצע חלקית','בוצע','סגור')
      and not (new.data->'taskStatuses' ? status_name) then raise exception 'Built-in task status cannot be removed'; end if;
  end loop;
  for task in select value from jsonb_array_elements(coalesce(new.data->'tasks','[]')) loop
    if not (new.data->'taskStatuses' ? coalesce(task->>'status','')) and (
      old.data->'taskStatuses' is distinct from new.data->'taskStatuses'
      or not exists(select 1 from jsonb_array_elements(coalesce(old.data->'tasks','[]')) previous
        where previous->>'id'=task->>'id' and previous->'status' is not distinct from task->'status')
    ) then raise exception 'Task status requires a configured replacement'; end if;
  end loop;
  return new;
end; $$;
revoke all on function rameng_private.validate_task_statuses() from public, anon, authenticated;
create trigger validate_task_statuses before update of data on public.workspace_state
for each row execute function rameng_private.validate_task_statuses();
commit;
