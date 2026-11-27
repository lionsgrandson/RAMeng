-- Match ECMAScript whitespace on every database locale, including Unicode spaces.
-- Existing values are not rewritten; stop for review if registry rows need repair.
begin;
create or replace function rameng_private.normalize_business_option(raw text)
returns text language plpgsql immutable set search_path = '' as $$
declare clean text;
begin
  clean := regexp_replace(btrim(normalize(raw, NFC)), '[[:space:]' || chr(160) || chr(5760) || chr(8192) || '-' || chr(8202) || chr(8232) || chr(8233) || chr(8239) || chr(8287) || chr(12288) || chr(65279) || ']+', ' ', 'g');
  clean := btrim(clean);
  if clean is null or char_length(clean) not between 1 and 100
    or clean ~ '[[:cntrl:]]' or clean ~ ('[' || chr(8203) || '-' || chr(8207) || chr(8234) || '-' || chr(8238) || chr(8288) || '-' || chr(8303) || chr(65279) || ']')
    or left(clean, 2) = '__' or clean in ('הכל','ללא') then
    raise exception 'Invalid business option' using errcode = '22023';
  end if;
  return clean;
end $$;
create or replace function rameng_private.business_option_key(raw text)
returns text language sql immutable set search_path = '' as $$
  select lower(btrim(regexp_replace(normalize(raw,NFC), '[[:space:]' || chr(160) || chr(5760) || chr(8192) || '-' || chr(8202) || chr(8232) || chr(8233) || chr(8239) || chr(8287) || chr(12288) || chr(65279) || ']+', ' ', 'g')) collate "und-x-icu")
$$;
revoke all on function rameng_private.business_option_key(text) from public,anon,authenticated;
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
      select count(*) into other_count from jsonb_array_elements_text(new.data->'taskStatuses') v where rameng_private.business_option_key(v)=rameng_private.business_option_key(canonical);
    else
      select count(*) into other_count from jsonb_array_elements(new.data->'categories') c where rameng_private.business_option_key(c->>'name')=rameng_private.business_option_key(canonical);
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
      where c->>'id'=candidate.identity and rameng_private.business_option_key(v)=rameng_private.business_option_key(canonical);
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
do $$begin
  if exists(select 1 from public.business_options where value is distinct from rameng_private.normalize_business_option(value)) then
    raise exception 'Review existing registry whitespace before migration';
  end if;
end $$;
notify pgrst, 'reload schema';
commit;
