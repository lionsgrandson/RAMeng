-- Close the workspace-save path around create_business_option permissions.
-- Additive validation only: no existing records/options are rewritten.
begin;
create or replace function rameng_private.workspace_business_labels(document jsonb)
returns table(family text, value text) language sql immutable set search_path='' as $$
  select 'project_status',p->>'status' from jsonb_array_elements(coalesce(document->'projects','[]')) p
  union all select 'contact_status',c->>'status' from jsonb_array_elements(coalesce(document->'contacts','[]')) c
  union all select 'priority',t->>'priority' from jsonb_array_elements(coalesce(document->'tasks','[]')) t
  union all select 'report_status',i->>'status' from jsonb_array_elements(coalesce(document->'reports','[]')) r cross join lateral jsonb_array_elements(coalesce(r->'sections','[]')) s cross join lateral jsonb_array_elements(coalesce(s->'items','[]')) i
  union all select 'plan_status',f->>'planStatus' from jsonb_array_elements(coalesce(document->'files','[]')) f
  union all select 'quote_status',q->>'status' from jsonb_array_elements(coalesce(document->'quotes','[]')) q
  union all select 'contact_role',c->>'role' from jsonb_array_elements(coalesce(document->'contacts','[]')) c
  union all select 'company_type',c->>'companyType' from jsonb_array_elements(coalesce(document->'contacts','[]')) c
  union all select 'contact_tag',tag from jsonb_array_elements(coalesce(document->'contacts','[]')) c cross join lateral jsonb_array_elements_text(coalesce(c->'tags','[]')) tag
$$;
revoke all on function rameng_private.workspace_business_labels(jsonb) from public,anon,authenticated;

create or replace function rameng_private.builtin_business_label(family text,value text)
returns boolean language sql immutable set search_path='' as $$
  select value=any(case family
    when 'project_status' then array['בתכנון','בביצוע','בהמתנה','הושלם','מוקפא']
    when 'contact_status' then array['ליד','פעיל','בהמתנה','לא פעיל']
    when 'priority' then array['נמוכה','רגילה','גבוהה','דחופה']
    when 'report_status' then array['פתוח','לא תקין','בוצע חלקית','לא בוצע','תקין','בוצע','סגור']
    when 'plan_status' then array['טיוטה','לעיון','לאישור','מאושרת','לביצוע','מבוטלת','עדות (As Made)']
    when 'quote_status' then array['טיוטה','נשלחה','אושרה','נדחתה','שולמה חלקית','שולמה']
    else array[]::text[] end)
$$;
revoke all on function rameng_private.builtin_business_label(text,text) from public,anon,authenticated;

create or replace function rameng_private.validate_workspace_business_labels()
returns trigger language plpgsql security definer set search_path='' as $$
declare candidate record; clean text; area text; caller public.memberships; prior jsonb;
begin
  -- Anonymous API writes are denied by RLS/RPCs. Trusted SQL maintenance and
  -- migrations have no JWT; historical backfills remain possible for operators.
  if auth.uid() is null then return new; end if;
  prior:=case when tg_op='INSERT' then '{}'::jsonb else old.data end;
  select * into caller from public.memberships where org_id=new.org_id and user_id=auth.uid() for share;
  for candidate in select distinct labels.family,labels.value from rameng_private.workspace_business_labels(new.data) labels
    where coalesce(rameng_private.business_option_key(labels.value),'')<>''
    and not exists(select 1 from rameng_private.workspace_business_labels(prior) previous where previous.family=labels.family and previous.value=labels.value)
  loop
    clean:=rameng_private.normalize_business_option(candidate.value);
    if rameng_private.builtin_business_label(candidate.family,clean)
      or exists(select 1 from public.business_options o where o.org_id=new.org_id and o.family=candidate.family and o.value_key=rameng_private.business_option_key(clean))
      or exists(select 1 from rameng_private.workspace_business_labels(prior) previous where previous.family=candidate.family and rameng_private.business_option_key(previous.value)=rameng_private.business_option_key(clean))
      then continue; end if;
    area:=rameng_private.business_option_area(candidate.family);
    if caller.user_id is null or caller.role='external'
      or not public.workspace_permission_allowed(caller.role,caller.permissions,area,'create')
      or not public.workspace_permission_allowed(caller.role,caller.permissions,area,'edit') then
      raise exception 'Permission denied: create business option through workspace' using errcode='42501';
    end if;
  end loop;
  return new;
end $$;
revoke all on function rameng_private.validate_workspace_business_labels() from public,anon,authenticated;
create trigger validate_workspace_business_labels before insert or update of data on public.workspace_state
for each row execute function rameng_private.validate_workspace_business_labels();
commit;
