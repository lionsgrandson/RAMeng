-- Existing pending mail remains manual; only new assignments opt into background delivery.
begin;
alter table public.task_notifications add column background_ready boolean not null default false;
alter table public.task_notifications add column delivery_started_at timestamptz;
update public.task_notifications set state='uncertain', error='השליחה הקודמת נקטעה ללא אישור ודאי. יש לבדוק את תיקיית נשלח.' where state='sending';
create or replace function rameng_private.notify_task_assignment()
returns trigger language plpgsql security definer set search_path='' as $$
declare t jsonb; recipient uuid; address text;
begin
  for t in select value from jsonb_array_elements(coalesce(new.data->'tasks','[]')) loop
    if coalesce(t->>'assigneeId','')='' or exists(select 1 from jsonb_array_elements(coalesce(old.data->'tasks','[]')) previous where previous->>'id'=t->>'id' and previous->>'assigneeId'=t->>'assigneeId' and nullif(previous->>'projectId','') is not distinct from nullif(t->>'projectId','')) then continue; end if;
    select m.user_id,u.email into recipient,address from public.memberships m join auth.users u on u.id=m.user_id where m.org_id=new.org_id and m.user_id::text=t->>'assigneeId';
    if recipient is not null and address is not null then
      insert into public.task_notifications(org_id,task_id,project_id,user_id,assigned_by,title,email,background_ready) values(new.org_id,t->>'id',nullif(t->>'projectId',''),recipient,auth.uid(),t->>'title',address,true);
    end if;
  end loop;
  update public.task_notifications n set state='cancelled' where n.org_id=new.org_id and n.state in ('pending','failed') and not exists(select 1 from jsonb_array_elements(coalesce(new.data->'tasks','[]')) t_entry where t_entry->>'id'=n.task_id and t_entry->>'assigneeId'=n.user_id::text and nullif(t_entry->>'projectId','') is not distinct from n.project_id);
  return new;
end; $$;
commit;
