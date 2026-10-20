create table public.audit_platform_rls_verification(id integer);
do $$
begin
  if has_function_privilege('anon','public.rls_auto_enable()','EXECUTE')
    or has_function_privilege('authenticated','public.rls_auto_enable()','EXECUTE')
    or has_function_privilege('service_role','public.rls_auto_enable()','EXECUTE') then
    raise exception 'Platform event trigger remains client-executable';
  end if;
  if not (select relrowsecurity from pg_class where oid='public.audit_platform_rls_verification'::regclass) then
    raise exception 'Restricting function EXECUTE broke automatic RLS event dispatch';
  end if;
end;
$$;
