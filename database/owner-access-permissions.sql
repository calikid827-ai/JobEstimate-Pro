-- Reviewable permissions setup for EXISTING application objects. Not applied.
-- No schema/owner reassignment and no access to auth schema objects are added.
-- Execute only in a separately authorized database change after consumer review.
begin;

grant usage on schema public to service_role;

do $permissions$
declare
  item record;
  table_oid regclass;
  serial_name text;
  column_name text;
  routine record;
  routine_count integer := 0;
begin
  for item in select * from (values
    ('entitlements', 'select, insert, update'),
    ('usage_events', 'select, insert'),
    ('estimate_proposals', 'select, insert, update'),
    ('approval_links', 'select, insert, update'),
    ('proposal_approvals', 'select, insert'),
    ('approval_invoices', 'select, insert'),
    ('generation_results', 'select, insert'),
    ('stripe_webhook_events', 'select, insert'),
    ('approval_owner_sync_tokens', '')
  ) as objects(table_name, service_privileges)
  loop
    table_oid := to_regclass(format('public.%I', item.table_name));
    if table_oid is null then
      raise notice 'Application object missing; review its setup: public.%', item.table_name;
      continue;
    end if;
    execute format('alter table %s enable row level security', table_oid);
    execute format('revoke all on table %s from public, anon, authenticated, service_role', table_oid);
    if item.service_privileges <> '' then
      execute format('grant %s on table %s to service_role', item.service_privileges, table_oid);
    end if;
    -- Serial/identity inserts need only the relevant sequence, never all sequences.
    for column_name in select attname from pg_attribute
      where attrelid = table_oid and attnum > 0 and not attisdropped
    loop
      serial_name := pg_get_serial_sequence(table_oid::text, column_name);
      if serial_name is not null then
        execute format('revoke all on sequence %s from public, anon, authenticated, service_role', serial_name);
        if position('insert' in item.service_privileges) > 0 then
          execute format('grant usage on sequence %s to service_role', serial_name);
        end if;
      end if;
    end loop;
  end loop;

  for routine in select p.oid::regprocedure as identity from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'consume_free_generation'
      and p.prokind = 'f'
  loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', routine.identity);
    execute format('grant execute on function %s to service_role', routine.identity);
    routine_count := routine_count + 1;
  end loop;
  if routine_count = 0 then
    raise exception 'Required quota RPC public.consume_free_generation is missing; review database setup';
  end if;
end
$permissions$;

commit;
