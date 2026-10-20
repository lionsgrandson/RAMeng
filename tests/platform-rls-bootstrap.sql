-- Disposable PostgreSQL fixture for the optional Supabase platform trigger.
-- Its behavior matches the relevant platform contract: newly created public
-- tables receive RLS through event dispatch, without client EXECUTE access.
create function public.rls_auto_enable() returns event_trigger
language plpgsql security definer set search_path='pg_catalog' as $$
declare command record;
begin
  for command in select * from pg_event_trigger_ddl_commands()
    where command_tag in ('CREATE TABLE','CREATE TABLE AS','SELECT INTO')
      and object_type in ('table','partitioned table')
      and schema_name='public'
  loop
    execute format('alter table %s enable row level security',command.object_identity);
  end loop;
end;
$$;
grant execute on function public.rls_auto_enable() to public,anon,authenticated,service_role;
create event trigger audit_platform_auto_rls on ddl_command_end
when tag in ('CREATE TABLE','CREATE TABLE AS','SELECT INTO')
execute function public.rls_auto_enable();
