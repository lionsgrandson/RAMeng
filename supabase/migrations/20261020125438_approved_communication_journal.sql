-- No mailbox is approved by this migration. Existing private Gmail/KV data is
-- never copied. An operator must separately record the client's mailbox consent.
begin;
create table public.communication_mailboxes (
  org_id uuid not null references public.organizations(id),
  user_id uuid not null,
  email text not null,
  approved_by uuid not null,
  approved_at timestamptz not null default now(),
  consent_reference text not null check(length(trim(consent_reference)) >= 8),
  scope text not null default 'selected_threads' check(scope='selected_threads'),
  active boolean not null default true,
  last_sync_at timestamptz,
  last_error_code text,
  primary key(org_id,user_id)
);
create table public.communication_threads (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  mailbox_user_id uuid not null,
  gmail_thread_id text not null,
  project_id text not null,
  task_ids jsonb not null default '[]' check(jsonb_typeof(task_ids)='array'),
  contact_ids jsonb not null default '[]' check(jsonb_typeof(contact_ids)='array'),
  subject text not null default '',
  history_id text,
  synced_at timestamptz not null default now(),
  foreign key(org_id,mailbox_user_id) references public.communication_mailboxes(org_id,user_id),
  unique(org_id,mailbox_user_id,gmail_thread_id)
);
create index communication_threads_org_project on public.communication_threads(org_id,project_id,synced_at desc);
create table public.communication_messages (
  thread_id uuid not null references public.communication_threads(id),
  gmail_message_id text not null,
  sender text not null default '',
  recipients text not null default '',
  cc text not null default '',
  sent_at timestamptz,
  subject text not null default '',
  body text not null default '',
  attachment_metadata jsonb not null default '[]' check(jsonb_typeof(attachment_metadata)='array'),
  primary key(thread_id,gmail_message_id)
);
create table public.communication_journal_audit (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  actor_id uuid not null,
  thread_id uuid references public.communication_threads(id),
  action text not null,
  at timestamptz not null default now()
);
create index communication_journal_audit_org on public.communication_journal_audit(org_id,at desc);
alter table public.communication_mailboxes enable row level security;
alter table public.communication_threads enable row level security;
alter table public.communication_messages enable row level security;
alter table public.communication_journal_audit enable row level security;
revoke all on public.communication_mailboxes,public.communication_threads,public.communication_messages,public.communication_journal_audit from public,anon,authenticated;
grant select on public.communication_mailboxes,public.communication_threads,public.communication_messages,public.communication_journal_audit to authenticated;
grant all on public.communication_mailboxes,public.communication_threads,public.communication_messages,public.communication_journal_audit to service_role;
create policy mailbox_read on public.communication_mailboxes for select to authenticated using (
  public.is_org_member(org_id) and (user_id=(select auth.uid()) or public.is_org_admin(org_id))
);
create policy thread_read on public.communication_threads for select to authenticated using (
  public.can_org_action(org_id,'communication','view') and public.can_org_action(org_id,'projects','view')
  and (jsonb_array_length(task_ids)=0 or public.can_org_action(org_id,'tasks','view'))
  and (jsonb_array_length(contact_ids)=0 or public.can_org_action(org_id,'contacts','view'))
);
create policy message_read on public.communication_messages for select to authenticated using (
  exists(select 1 from public.communication_threads t where t.id=thread_id)
);
create policy journal_audit_read on public.communication_journal_audit for select to authenticated using (public.is_org_admin(org_id));

-- Explicit operator-controlled approval, with a durable consent reference.
create function public.approve_communication_mailbox(target_org uuid,target_user uuid,consent_reference text,allow_sync boolean)
returns void language plpgsql security definer set search_path='' as $$
declare address text;
begin
  if auth.uid() is null or not public.is_org_developer(target_org) then raise exception 'Developer approval required' using errcode='42501'; end if;
  select u.email into address from auth.users u join public.memberships m on m.user_id=u.id where m.org_id=target_org and u.id=target_user and m.role <> 'external';
  if address is null or length(trim(consent_reference))<8 then raise exception 'Explicit business mailbox consent required'; end if;
  insert into public.communication_mailboxes(org_id,user_id,email,approved_by,consent_reference,active)
    values(target_org,target_user,lower(address),auth.uid(),consent_reference,allow_sync)
    on conflict(org_id,user_id) do update set email=excluded.email,approved_by=excluded.approved_by,approved_at=now(),consent_reference=excluded.consent_reference,active=excluded.active;
  insert into public.communication_journal_audit(org_id,actor_id,action) values(target_org,auth.uid(),case when allow_sync then 'mailbox_approved_selected_threads' else 'mailbox_sync_revoked' end);
end;
$$;
revoke all on function public.approve_communication_mailbox(uuid,uuid,text,boolean) from public,anon;
grant execute on function public.approve_communication_mailbox(uuid,uuid,text,boolean) to authenticated;

-- Provider-verified payloads enter only through the Worker using service_role.
-- The browser cannot impersonate another mailbox or forge provider provenance.
create function public.ingest_communication_thread(target_org uuid,actor uuid,mailbox_email text,provider_thread text,project text,tasks jsonb,contacts jsonb,messages jsonb,history text)
returns uuid language plpgsql security definer set search_path='' as $$
declare approved public.communication_mailboxes; document jsonb; record_id uuid; entry jsonb; ref text;
begin
  select * into approved from public.communication_mailboxes where org_id=target_org and user_id=actor and active for update;
  if approved.user_id is null or approved.email<>lower(mailbox_email) or not exists(select 1 from public.memberships m where m.org_id=target_org and m.user_id=actor and m.role<>'external' and public.workspace_permission_allowed(m.role,m.permissions,'communication','create') and public.workspace_permission_allowed(m.role,m.permissions,'communication','view') and public.workspace_permission_allowed(m.role,m.permissions,'projects','view')) then
    raise exception 'Approved business mailbox required' using errcode='42501';
  end if;
  select data into document from public.workspace_state where org_id=target_org;
  if not exists(select 1 from jsonb_array_elements(document->'projects') p where p->>'id'=project) then raise exception 'Project not found'; end if;
  if jsonb_typeof(tasks) is distinct from 'array' or jsonb_typeof(contacts) is distinct from 'array' or jsonb_typeof(messages) is distinct from 'array' or jsonb_array_length(messages)>100 or jsonb_array_length(messages)=0 or length(provider_thread)>160 or coalesce(provider_thread,'')='' then raise exception 'Invalid journal payload'; end if;
  for ref in select jsonb_array_elements_text(tasks) loop
    if not exists(select 1 from jsonb_array_elements(document->'tasks') t where t->>'id'=ref and t->>'projectId'=project) or not exists(select 1 from public.memberships m where m.org_id=target_org and m.user_id=actor and public.workspace_permission_allowed(m.role,m.permissions,'tasks','view')) then raise exception 'Task association denied'; end if;
  end loop;
  for ref in select jsonb_array_elements_text(contacts) loop
    if not exists(select 1 from jsonb_array_elements(document->'contacts') c where c->>'id'=ref) or not exists(select 1 from public.memberships m where m.org_id=target_org and m.user_id=actor and public.workspace_permission_allowed(m.role,m.permissions,'contacts','view')) then raise exception 'Contact association denied'; end if;
  end loop;
  insert into public.communication_threads(org_id,mailbox_user_id,gmail_thread_id,project_id,task_ids,contact_ids,subject,history_id)
    values(target_org,actor,provider_thread,project,tasks,contacts,left(messages->0->>'subject',1000),history)
    on conflict(org_id,mailbox_user_id,gmail_thread_id) do update set project_id=excluded.project_id,task_ids=excluded.task_ids,contact_ids=excluded.contact_ids,subject=excluded.subject,history_id=excluded.history_id,synced_at=now()
    returning id into record_id;
  for entry in select value from jsonb_array_elements(messages) loop
    if coalesce(entry->>'id','')='' or length(entry->>'id')>160 or length(entry->>'body')>200000 then raise exception 'Invalid message'; end if;
    insert into public.communication_messages(thread_id,gmail_message_id,sender,recipients,cc,sent_at,subject,body,attachment_metadata)
      values(record_id,entry->>'id',coalesce(entry->>'from',''),coalesce(entry->>'to',''),coalesce(entry->>'cc',''),nullif(entry->>'date','')::timestamptz,coalesce(entry->>'subject',''),coalesce(entry->>'body',''),coalesce(entry->'attachments','[]'))
      on conflict(thread_id,gmail_message_id) do update set sender=excluded.sender,recipients=excluded.recipients,cc=excluded.cc,sent_at=excluded.sent_at,subject=excluded.subject,body=excluded.body,attachment_metadata=excluded.attachment_metadata;
  end loop;
  update public.communication_mailboxes set last_sync_at=now(),last_error_code=null where org_id=target_org and user_id=actor;
  insert into public.communication_journal_audit(org_id,actor_id,thread_id,action) values(target_org,actor,record_id,'selected_thread_synchronized');
  return record_id;
end;
$$;
revoke all on function public.ingest_communication_thread(uuid,uuid,text,text,text,jsonb,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function public.ingest_communication_thread(uuid,uuid,text,text,text,jsonb,jsonb,jsonb,text) to service_role;
commit;
