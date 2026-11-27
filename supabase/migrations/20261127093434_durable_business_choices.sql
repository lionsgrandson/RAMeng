-- Additive organization-owned vocabularies. Existing workspace records are unchanged.
-- Back up workspace_state before applying this migration to a hosted environment.
begin;
create or replace function rameng_private.business_option_area(family text)
returns text language sql immutable set search_path = '' as $$
  select case family
    when 'project_status' then 'projects' when 'contact_status' then 'contacts'
    when 'priority' then 'tasks' when 'report_status' then 'reports'
    when 'plan_status' then 'files' when 'quote_status' then 'finance'
    when 'contact_role' then 'contacts' when 'company_type' then 'contacts'
    when 'contact_tag' then 'contacts' else null end
$$;
create or replace function rameng_private.normalize_business_option(raw text)
returns text language plpgsql immutable set search_path = '' as $$
declare clean text;
begin
  clean := regexp_replace(btrim(normalize(raw, NFC)), '[[:space:]' || chr(160) || ']+', ' ', 'g');
  clean := btrim(clean);
  if clean is null or char_length(clean) not between 1 and 100
    or clean ~ '[[:cntrl:]]' or clean ~ ('[' || chr(8203) || '-' || chr(8207) || chr(8234) || '-' || chr(8238) || chr(8288) || '-' || chr(8303) || chr(65279) || ']')
    or left(clean, 2) = '__' or clean in ('הכל','ללא') then
    raise exception 'Invalid business option' using errcode = '22023';
  end if;
  return clean;
end $$;
create table if not exists public.business_options (
  org_id uuid not null references public.organizations(id) on delete cascade,
  family text not null check (rameng_private.business_option_area(family) is not null),
  value text not null check (value = rameng_private.normalize_business_option(value)),
  value_key text generated always as (lower(normalize(value, NFC) collate "und-x-icu")) stored,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  primary key (org_id, family, value_key)
);
alter table public.business_options enable row level security;
revoke all on public.business_options from anon, authenticated;
grant select on public.business_options to authenticated;
grant usage on schema rameng_private to authenticated;
grant execute on function rameng_private.business_option_area(text) to authenticated;
-- Memberships are intentionally not granted as a table to API callers.
-- Keep this narrow authorization lookup in the private schema.
create or replace function rameng_private.can_read_business_options(target_org uuid, family text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.memberships m where m.org_id=target_org and m.user_id=auth.uid()
    and m.role <> 'external' and public.workspace_permission_allowed(m.role,m.permissions,rameng_private.business_option_area(family),'view'))
$$;
revoke all on function rameng_private.can_read_business_options(uuid,text) from public,anon;
grant execute on function rameng_private.can_read_business_options(uuid,text) to authenticated;
create policy business_options_read on public.business_options for select to authenticated
using (rameng_private.can_read_business_options(org_id,family));

create or replace function public.create_business_option(target_org uuid, option_family text, option_value text)
returns text language plpgsql security definer set search_path = '' as $$
declare caller public.memberships; area text; clean text; saved text;
begin
  area := rameng_private.business_option_area(option_family);
  select * into caller from public.memberships where org_id = target_org and user_id = auth.uid() for share;
  if caller.user_id is null or caller.role = 'external' or area is null
    or not public.workspace_permission_allowed(caller.role, caller.permissions, area, 'create')
    or not public.workspace_permission_allowed(caller.role, caller.permissions, area, 'edit') then
    raise exception 'Permission denied: create business option' using errcode = '42501';
  end if;
  clean := rameng_private.normalize_business_option(option_value);
  -- The unique key serializes competing requests and returns the first spelling.
  insert into public.business_options as registry(org_id, family, value, created_by)
  values(target_org, option_family, clean, auth.uid())
  on conflict (org_id, family, value_key) do update set value = registry.value
  returning value into saved;
  return saved;
end $$;
revoke all on function public.create_business_option(uuid,text,text) from public, anon;
grant execute on function public.create_business_option(uuid,text,text) to authenticated;
revoke all on function rameng_private.normalize_business_option(text) from public, anon, authenticated;
revoke all on function rameng_private.business_option_area(text) from public, anon;

-- Capture historical labels independently of their last referencing record.
-- Skip invalid legacy labels without rewriting or rejecting historical records.
create or replace function rameng_private.capture_business_options(target_org uuid, document jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare row record; clean text;
begin
  for row in
    select target_org org_id, labels.family, labels.value from (
      select 'project_status'::text family, p->>'status' value from jsonb_array_elements(coalesce(document->'projects','[]')) p
      union all select 'contact_status', c->>'status' from jsonb_array_elements(coalesce(document->'contacts','[]')) c
      union all select 'priority', t->>'priority' from jsonb_array_elements(coalesce(document->'tasks','[]')) t
      union all select 'report_status', i->>'status' from jsonb_array_elements(coalesce(document->'reports','[]')) r cross join lateral jsonb_array_elements(coalesce(r->'sections','[]')) s cross join lateral jsonb_array_elements(coalesce(s->'items','[]')) i
      union all select 'plan_status', f->>'planStatus' from jsonb_array_elements(coalesce(document->'files','[]')) f
      union all select 'quote_status', q->>'status' from jsonb_array_elements(coalesce(document->'quotes','[]')) q
      union all select 'contact_role', c->>'role' from jsonb_array_elements(coalesce(document->'contacts','[]')) c
      union all select 'company_type', c->>'companyType' from jsonb_array_elements(coalesce(document->'contacts','[]')) c
      union all select 'contact_tag', tag from jsonb_array_elements(coalesce(document->'contacts','[]')) c cross join lateral jsonb_array_elements_text(coalesce(c->'tags','[]')) tag
    ) labels
  loop
    begin
      clean := rameng_private.normalize_business_option(row.value);
      insert into public.business_options(org_id,family,value) values(row.org_id,row.family,clean) on conflict do nothing;
    exception when invalid_parameter_value then null;
    end;
  end loop;
end $$;
revoke all on function rameng_private.capture_business_options(uuid,jsonb) from public,anon,authenticated;
select rameng_private.capture_business_options(org_id,data) from public.workspace_state;
create or replace function rameng_private.capture_business_options_trigger()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform rameng_private.capture_business_options(new.org_id,new.data);
  return new;
end $$;
revoke all on function rameng_private.capture_business_options_trigger() from public,anon,authenticated;
create trigger capture_business_options after insert or update on public.workspace_state for each row execute function rameng_private.capture_business_options_trigger();


-- Validate only newly introduced workspace choices; grandfather historical values.
create or replace function rameng_private.validate_inline_choices()
returns trigger language plpgsql set search_path = '' as $$
declare candidate record; canonical text; other_count integer;
begin
  for candidate in
    select 'status' family, value label, value identity from jsonb_array_elements_text(coalesce(new.data->'taskStatuses','[]')) value
    where not (coalesce(old.data->'taskStatuses','[]') ? value)
    union all
    select 'profession', c->>'name', c->>'id' from jsonb_array_elements(coalesce(new.data->'categories','[]')) c
    where not exists (select 1 from jsonb_array_elements(coalesce(old.data->'categories','[]')) previous where previous->>'id'=c->>'id' and previous->>'name'=c->>'name')
  loop
    canonical := rameng_private.normalize_business_option(candidate.label);
    if canonical <> candidate.label then raise exception 'Business option must be normalized'; end if;
    if candidate.family='status' then
      select count(*) into other_count from jsonb_array_elements_text(new.data->'taskStatuses') v where lower(normalize(regexp_replace(btrim(v),'[[:space:]]+',' ','g'),NFC) collate "und-x-icu")=lower(canonical collate "und-x-icu");
    else
      select count(*) into other_count from jsonb_array_elements(new.data->'categories') c where lower(normalize(regexp_replace(btrim(c->>'name'),'[[:space:]]+',' ','g'),NFC) collate "und-x-icu")=lower(canonical collate "und-x-icu");
    end if;
    if other_count > 1 then raise exception 'Duplicate business option' using errcode='23505'; end if;
  end loop;
  for candidate in
    select c->>'id' identity, option_value label from jsonb_array_elements(coalesce(new.data->'taskColumns','[]')) c
    cross join lateral jsonb_array_elements_text(coalesce(c->'options','[]')) option_value
    where not exists (select 1 from jsonb_array_elements(coalesce(old.data->'taskColumns','[]')) previous where previous->>'id'=c->>'id' and coalesce(previous->'options','[]') ? option_value)
  loop
    canonical := rameng_private.normalize_business_option(candidate.label);
    if canonical <> candidate.label then raise exception 'Column option must be normalized'; end if;
    select count(*) into other_count from jsonb_array_elements(new.data->'taskColumns') c
      cross join lateral jsonb_array_elements_text(coalesce(c->'options','[]')) v
      where c->>'id'=candidate.identity and lower(normalize(regexp_replace(btrim(v),'[[:space:]]+',' ','g'),NFC) collate "und-x-icu")=lower(canonical collate "und-x-icu");
    if other_count > 1 then raise exception 'Duplicate column option' using errcode='23505'; end if;
  end loop;
  for candidate in
    select p->>'name' label, p->>'address' address from jsonb_array_elements(coalesce(new.data->'projects','[]')) p
    where not exists (select 1 from jsonb_array_elements(coalesce(old.data->'projects','[]')) previous where previous->>'id'=p->>'id')
  loop
    if coalesce(btrim(candidate.label),'')='' or coalesce(btrim(candidate.address),'')='' then raise exception 'Project name and address are required'; end if;
  end loop;
  return new;
end $$;
revoke all on function rameng_private.validate_inline_choices() from public, anon, authenticated;
drop trigger if exists validate_inline_choices on public.workspace_state;
create trigger validate_inline_choices before update on public.workspace_state for each row execute function rameng_private.validate_inline_choices();
notify pgrst, 'reload schema';
commit;
