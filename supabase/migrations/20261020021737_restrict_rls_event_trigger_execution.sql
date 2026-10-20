-- Supabase's platform event trigger is not an application RPC. Its event
-- dispatch remains owned by postgres; client roles do not need EXECUTE.
-- Some older/local databases do not contain this optional platform function.
begin;
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    if (select prorettype from pg_proc where oid='public.rls_auto_enable()'::regprocedure)
      <> 'event_trigger'::regtype then
      raise exception 'Unexpected rls_auto_enable signature; review before changing grants';
    end if;
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated, service_role;
  end if;
end;
$$;
commit;
