-- REVIEW ONLY. Not applied by the implementation task. Requires separate authorization.
begin;

create table if not exists public.project_libraries (
  owner_id uuid not null references auth.users(id),
  project_id text not null check (project_id ~ '^[a-zA-Z0-9_-]{1,100}$'),
  revision integer not null check (revision > 0),
  snapshot jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (owner_id, project_id)
);
alter table public.project_libraries enable row level security;
revoke all on public.project_libraries from public, anon, authenticated;
grant select, insert, update on public.project_libraries to service_role;
-- Deliberately no client metadata policies: verified owner routes are the API.

create table if not exists public.project_library_preparation_leases (
  owner_id uuid primary key references auth.users(id),
  project_id text not null, file_id text not null, token uuid not null, expires_at timestamptz not null
);
alter table public.project_library_preparation_leases enable row level security;
revoke all on public.project_library_preparation_leases from public, anon, authenticated;
grant select, insert, update, delete on public.project_library_preparation_leases to service_role;

create or replace function public.project_library_claim_preparation(p_owner uuid,p_project text,p_file text,p_token uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare affected integer;
begin
  if not exists(select 1 from public.project_libraries l where l.owner_id=p_owner and l.project_id=p_project and exists(select 1 from jsonb_array_elements(l.snapshot->'files') f where f->>'id'=p_file and f->>'ownerId'=p_owner::text)) then raise exception 'PROJECT_NOT_FOUND'; end if;
  insert into public.project_library_preparation_leases(owner_id,project_id,file_id,token,expires_at)
  values(p_owner,p_project,p_file,p_token,now()+interval '2 minutes')
  on conflict(owner_id) do update set project_id=excluded.project_id,file_id=excluded.file_id,token=excluded.token,expires_at=excluded.expires_at
  where public.project_library_preparation_leases.expires_at < now();
  get diagnostics affected = row_count;
  return affected=1;
end;
$$;
create or replace function public.project_library_release_preparation(p_owner uuid,p_token uuid)
returns void language sql security invoker set search_path = '' as $$
  delete from public.project_library_preparation_leases where owner_id=p_owner and token=p_token;
$$;
revoke all on function public.project_library_claim_preparation(uuid,text,text,uuid) from public,anon,authenticated;
revoke all on function public.project_library_release_preparation(uuid,uuid) from public,anon,authenticated;
grant execute on function public.project_library_claim_preparation(uuid,text,text,uuid) to service_role;
grant execute on function public.project_library_release_preparation(uuid,uuid) to service_role;

create or replace function public.project_library_ready() returns integer
language sql stable security invoker set search_path = '' as $$
  select case when exists(select 1 from storage.buckets where id = 'project-originals-private' and public = false) then 1 else 0 end;
$$;
revoke all on function public.project_library_ready() from public, anon, authenticated;
grant execute on function public.project_library_ready() to service_role;

create or replace function public.project_library_save(p_owner uuid, p_project text, p_expected integer, p_snapshot jsonb)
returns integer language plpgsql security invoker set search_path = '' as $$
declare affected integer;
begin
  if p_snapshot->>'ownerId' is distinct from p_owner::text or p_snapshot->>'projectId' is distinct from p_project
    or p_project !~ '^[a-zA-Z0-9_-]{1,100}$' or p_expected < 0
    or p_snapshot->>'schemaVersion' <> '1' or jsonb_typeof(p_snapshot->'files') <> 'array'
    or jsonb_array_length(p_snapshot->'files') > 10000
    -- Shared application limit is 3 MiB compact UTF-8 JSON. This defense-in-depth
    -- 4 MiB jsonb-text limit allows PostgreSQL's canonical formatting overhead.
    or octet_length(p_snapshot::text) > 4194304
    or exists(select 1 from jsonb_array_elements(p_snapshot->'files') f where f->>'ownerId' is distinct from p_owner::text or f->>'projectId' is distinct from p_project)
    or (select coalesce(sum((f->>'size')::bigint), 0) from jsonb_array_elements(p_snapshot->'files') f) > 26843545600
  then raise exception 'PROJECT_INPUT_INVALID'; end if;
  if p_expected = 0 then
    insert into public.project_libraries(owner_id,project_id,revision,snapshot)
    values(p_owner,p_project,1,jsonb_set(p_snapshot,'{revision}','1')) on conflict do nothing;
  else
    update public.project_libraries set revision = p_expected + 1,
      snapshot = jsonb_set(p_snapshot,'{revision}',to_jsonb(p_expected + 1)), updated_at = now()
    where owner_id=p_owner and project_id=p_project and revision=p_expected;
  end if;
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'PROJECT_CHANGED'; end if;
  return p_expected + 1;
end;
$$;
revoke all on function public.project_library_save(uuid,text,integer,jsonb) from public, anon, authenticated;
grant execute on function public.project_library_save(uuid,text,integer,jsonb) to service_role;

-- A distinct private bucket; existing Plan Study and legacy originals are untouched.
insert into storage.buckets(id,name,public,file_size_limit)
values('project-originals-private','project-originals-private',false,104857600)
on conflict(id) do nothing;

commit;
