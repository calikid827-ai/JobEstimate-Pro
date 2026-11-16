-- REVIEW ONLY. Not executed by this task. Apply only with separate authorization.
-- Keeps the prior snapshot table and every immutable original/version. Never rewrites
-- an old snapshot or silently drops records to fit a response budget.
begin;

create table if not exists public.project_libraries (
  owner_id uuid not null references auth.users(id), project_id text not null,
  revision integer not null check(revision > 0), snapshot jsonb not null,
  updated_at timestamptz not null default now(), primary key(owner_id,project_id)
);
alter table public.project_libraries enable row level security;
revoke all on public.project_libraries from public,anon,authenticated;
revoke all on public.project_libraries from service_role;
grant select on public.project_libraries to service_role;

create table if not exists public.project_library_heads (
  owner_id uuid not null references auth.users(id), project_id text not null check(project_id ~ '^[a-zA-Z0-9_-]{1,100}$'),
  revision integer not null check(revision >= 0), file_count integer not null default 0 check(file_count between 0 and 10000),
  total_bytes bigint not null default 0 check(total_bytes between 0 and 26843545600),
  prepared_pages integer not null default 0 check(prepared_pages between 0 and 10000),
  prepared_characters bigint not null default 0 check(prepared_characters between 0 and 16777216),
  primary key(owner_id,project_id)
);
create table if not exists public.project_library_files (
  owner_id uuid not null, project_id text not null, file_id text not null check(file_id ~ '^[a-zA-Z0-9_-]{1,100}$'),
  source_version integer not null check(source_version > 0), source_sha256 text not null check(source_sha256 ~ '^[a-f0-9]{64}$'),
  active boolean not null, relative_path text not null, size bigint not null check(size between 1 and 104857600),
  updated_revision integer not null, metadata jsonb not null,
  primary key(owner_id,project_id,file_id),
  foreign key(owner_id,project_id) references public.project_library_heads(owner_id,project_id),
  check(jsonb_typeof(metadata->'pages')='array' and jsonb_array_length(metadata->'pages')=0),
  check(octet_length(metadata::text) <= 24576)
);
create unique index if not exists project_library_current_path on public.project_library_files(owner_id,project_id,relative_path) where active;
create index if not exists project_library_duplicate_hash on public.project_library_files(owner_id,project_id,source_sha256);
create table if not exists public.project_library_pages (
  owner_id uuid not null, project_id text not null, file_id text not null, page_number integer not null check(page_number between 1 and 1000),
  source_version integer not null, source_sha256 text not null, metadata jsonb not null, text_content text not null check(char_length(text_content) <= 80000),
  primary key(owner_id,project_id,file_id,page_number),
  foreign key(owner_id,project_id,file_id) references public.project_library_files(owner_id,project_id,file_id),
  check(not metadata ? 'text')
);
alter table public.project_library_heads enable row level security;
alter table public.project_library_files enable row level security;
alter table public.project_library_pages enable row level security;
revoke all on public.project_library_heads,public.project_library_files,public.project_library_pages from public,anon,authenticated;
grant select,insert,update on public.project_library_heads,public.project_library_files,public.project_library_pages to service_role;

-- Explicit, atomic import for each old snapshot. An existing normalized project is
-- never overwritten. Counts/identities are validated before the transaction commits.
do $$
declare legacy record; f jsonb; p jsonb; stats jsonb; meta jsonb; files_count integer; bytes_count bigint; pages_count integer; chars_count bigint;
begin
  for legacy in select * from public.project_libraries order by owner_id,project_id for update loop
    if exists(select 1 from public.project_library_heads h where h.owner_id=legacy.owner_id and h.project_id=legacy.project_id) then
      perform 1 from public.project_library_heads where owner_id=legacy.owner_id and project_id=legacy.project_id for update;
      if exists(select 1 from jsonb_array_elements(legacy.snapshot->'files') prior where not exists(select 1 from public.project_library_files current where current.owner_id=legacy.owner_id and current.project_id=legacy.project_id and current.file_id=prior->>'id' and current.source_version=(prior->>'sourceVersion')::integer and current.source_sha256=prior->>'sha256' and current.metadata->>'objectKey'=prior->>'objectKey')) then raise exception 'PROJECT_LEGACY_IMPORT_INCOMPLETE'; end if;
      continue;
    end if;
    if legacy.snapshot->>'ownerId' is distinct from legacy.owner_id::text or legacy.snapshot->>'projectId' is distinct from legacy.project_id or jsonb_typeof(legacy.snapshot->'files') is distinct from 'array' then raise exception 'PROJECT_LEGACY_INVALID'; end if;
    files_count := jsonb_array_length(legacy.snapshot->'files');
    select coalesce(sum((x->>'size')::bigint),0) into bytes_count from jsonb_array_elements(legacy.snapshot->'files') x;
    select count(*),coalesce(sum(char_length(coalesce(pages->>'text',''))),0) into pages_count,chars_count from jsonb_array_elements(legacy.snapshot->'files') files cross join lateral jsonb_array_elements(files->'pages') pages;
    insert into public.project_library_heads(owner_id,project_id,revision,file_count,total_bytes,prepared_pages,prepared_characters)
    values(legacy.owner_id,legacy.project_id,legacy.revision,files_count,bytes_count,pages_count,chars_count);
    for f in select * from jsonb_array_elements(legacy.snapshot->'files') loop
      if f->>'ownerId' is distinct from legacy.owner_id::text or f->>'projectId' is distinct from legacy.project_id or f->>'objectKey' is distinct from legacy.owner_id::text||'/'||legacy.project_id||'/'||(f->>'id')||'/original' or jsonb_typeof(f->'pages') is distinct from 'array' then raise exception 'PROJECT_LEGACY_SOURCE_INVALID'; end if;
      select jsonb_build_object('prepared',count(*) filter(where x->>'extraction'<>'failed'),'failed',count(*) filter(where x->>'extraction'='failed'),'textCharacters',coalesce(sum(char_length(coalesce(x->>'text',''))),0)) into stats from jsonb_array_elements(f->'pages') x;
      meta := jsonb_set(f,'{pages}','[]')||jsonb_build_object('pageStats',stats,'contentStatus','not_loaded');
      insert into public.project_library_files(owner_id,project_id,file_id,source_version,source_sha256,active,relative_path,size,updated_revision,metadata)
      values(legacy.owner_id,legacy.project_id,f->>'id',(f->>'sourceVersion')::integer,f->>'sha256',(f->>'active')::boolean,f->>'relativePath',(f->>'size')::bigint,legacy.revision,meta);
      for p in select * from jsonb_array_elements(f->'pages') loop
        insert into public.project_library_pages(owner_id,project_id,file_id,page_number,source_version,source_sha256,metadata,text_content)
        values(legacy.owner_id,legacy.project_id,f->>'id',(p->>'pageNumber')::integer,(f->>'sourceVersion')::integer,f->>'sha256',(p-'text'-'contentLoaded')||jsonb_build_object('textCharacters',char_length(coalesce(p->>'text',''))),coalesce(p->>'text',''));
      end loop;
    end loop;
    if (select count(*) from public.project_library_files where owner_id=legacy.owner_id and project_id=legacy.project_id)<>files_count or (select count(*) from public.project_library_pages where owner_id=legacy.owner_id and project_id=legacy.project_id)<>pages_count then raise exception 'PROJECT_LEGACY_IMPORT_INCOMPLETE'; end if;
  end loop;
end;
$$;

create table if not exists public.project_library_preparation_leases (
  owner_id uuid primary key references auth.users(id), project_id text not null,file_id text not null,token uuid not null,expires_at timestamptz not null
);
alter table public.project_library_preparation_leases enable row level security;
revoke all on public.project_library_preparation_leases from public,anon,authenticated;
grant select,insert,update,delete on public.project_library_preparation_leases to service_role;
create or replace function public.project_library_claim_preparation(p_owner uuid,p_project text,p_file text,p_token uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
declare affected integer;
begin
  if not exists(select 1 from public.project_library_files where owner_id=p_owner and project_id=p_project and file_id=p_file) then raise exception 'PROJECT_NOT_FOUND'; end if;
  insert into public.project_library_preparation_leases(owner_id,project_id,file_id,token,expires_at) values(p_owner,p_project,p_file,p_token,now()+interval '2 minutes')
  on conflict(owner_id) do update set project_id=excluded.project_id,file_id=excluded.file_id,token=excluded.token,expires_at=excluded.expires_at where public.project_library_preparation_leases.expires_at<now();
  get diagnostics affected=row_count; return affected=1;
end;
$$;
create or replace function public.project_library_release_preparation(p_owner uuid,p_token uuid)
returns void language sql security invoker set search_path='' as $$ delete from public.project_library_preparation_leases where owner_id=p_owner and token=p_token; $$;
revoke all on function public.project_library_claim_preparation(uuid,text,text,uuid) from public,anon,authenticated;
revoke all on function public.project_library_release_preparation(uuid,uuid) from public,anon,authenticated;
grant execute on function public.project_library_claim_preparation(uuid,text,text,uuid) to service_role;
grant execute on function public.project_library_release_preparation(uuid,uuid) to service_role;

create or replace function public.project_library_save_files(p_owner uuid,p_project text,p_expected integer,p_files jsonb)
returns integer language plpgsql security invoker set search_path='' as $$
declare h public.project_library_heads%rowtype; old public.project_library_files%rowtype; f jsonb; p jsonb; meta jsonb; next_revision integer; n_pages integer; n_chars bigint;
begin
  if p_project !~ '^[a-zA-Z0-9_-]{1,100}$' or p_expected<0 or jsonb_typeof(p_files) is distinct from 'array' or jsonb_array_length(p_files) not between 1 and 2 or octet_length(p_files::text)>655360 then raise exception 'PROJECT_INPUT_INVALID'; end if;
  if not exists(select 1 from public.project_library_heads where owner_id=p_owner and project_id=p_project) and exists(select 1 from public.project_libraries where owner_id=p_owner and project_id=p_project) then raise exception 'PROJECT_LEGACY_IMPORT_REQUIRED'; end if;
  insert into public.project_library_heads(owner_id,project_id,revision) values(p_owner,p_project,0) on conflict do nothing;
  select * into h from public.project_library_heads where owner_id=p_owner and project_id=p_project for update;
  if h.revision<>p_expected then raise exception 'PROJECT_CHANGED'; end if;
  next_revision:=p_expected+1;
  -- Deactivate the predecessor before inserting a replacement under the path index.
  for f in select * from jsonb_array_elements(p_files) where value->>'active'='false' loop
    update public.project_library_files set active=false,metadata=jsonb_set(metadata,'{active}','false'),updated_revision=next_revision
    where owner_id=p_owner and project_id=p_project and file_id=f->>'id';
  end loop;
  for f in select * from jsonb_array_elements(p_files) loop
    if f->>'ownerId' is distinct from p_owner::text or f->>'projectId' is distinct from p_project or f->>'objectKey' is distinct from p_owner::text||'/'||p_project||'/'||(f->>'id')||'/original' or jsonb_typeof(f->'pages') is distinct from 'array' or jsonb_array_length(f->'pages')>1 then raise exception 'PROJECT_SOURCE_INVALID'; end if;
    select * into old from public.project_library_files where owner_id=p_owner and project_id=p_project and file_id=f->>'id';
    if found then
      if old.source_version<>(f->>'sourceVersion')::integer or old.source_sha256<>f->>'sha256' or old.relative_path<>f->>'relativePath' or old.size<>(f->>'size')::bigint or old.metadata->>'name'<>f->>'name' or old.metadata->>'mimeType'<>f->>'mimeType' then raise exception 'PROJECT_IMMUTABLE_SOURCE_CHANGED'; end if;
    else
      h.file_count:=h.file_count+1; h.total_bytes:=h.total_bytes+(f->>'size')::bigint;
    end if;
    meta:=jsonb_set(f,'{pages}','[]')||jsonb_build_object('contentStatus','not_loaded');
    insert into public.project_library_files(owner_id,project_id,file_id,source_version,source_sha256,active,relative_path,size,updated_revision,metadata)
    values(p_owner,p_project,f->>'id',(f->>'sourceVersion')::integer,f->>'sha256',(f->>'active')::boolean,f->>'relativePath',(f->>'size')::bigint,next_revision,meta)
    on conflict(owner_id,project_id,file_id) do update set active=excluded.active,metadata=excluded.metadata,updated_revision=excluded.updated_revision;
    for p in select * from jsonb_array_elements(f->'pages') loop
      if p->>'contentLoaded' is distinct from 'true' or char_length(coalesce(p->>'text',''))>80000 or p->>'extraction' not in ('complete','empty','failed') or p->>'review'<>'pending' then raise exception 'PROJECT_PAGE_INVALID'; end if;
      insert into public.project_library_pages(owner_id,project_id,file_id,page_number,source_version,source_sha256,metadata,text_content)
      values(p_owner,p_project,f->>'id',(p->>'pageNumber')::integer,(f->>'sourceVersion')::integer,f->>'sha256',(p-'text'-'contentLoaded')||jsonb_build_object('textCharacters',char_length(coalesce(p->>'text',''))),coalesce(p->>'text',''))
      on conflict(owner_id,project_id,file_id,page_number) do update set metadata=excluded.metadata,text_content=excluded.text_content;
    end loop;
    select count(*),coalesce(sum(char_length(text_content)),0) into n_pages,n_chars from public.project_library_pages where owner_id=p_owner and project_id=p_project and file_id=f->>'id';
    select jsonb_build_object('prepared',count(*) filter(where metadata->>'extraction'<>'failed'),'failed',count(*) filter(where metadata->>'extraction'='failed'),'textCharacters',coalesce(sum(char_length(text_content)),0)) into meta from public.project_library_pages where owner_id=p_owner and project_id=p_project and file_id=f->>'id';
    update public.project_library_files set metadata=jsonb_set(metadata,'{pageStats}',meta) where owner_id=p_owner and project_id=p_project and file_id=f->>'id';
  end loop;
  select count(*),coalesce(sum(char_length(text_content)),0) into h.prepared_pages,h.prepared_characters from public.project_library_pages where owner_id=p_owner and project_id=p_project;
  update public.project_library_heads set revision=next_revision,file_count=h.file_count,total_bytes=h.total_bytes,prepared_pages=h.prepared_pages,prepared_characters=h.prepared_characters where owner_id=p_owner and project_id=p_project;
  return next_revision;
end;
$$;
revoke all on function public.project_library_save_files(uuid,text,integer,jsonb) from public,anon,authenticated;
grant execute on function public.project_library_save_files(uuid,text,integer,jsonb) to service_role;

-- Disable old writers after import; retained snapshots stay available for audit.
create or replace function public.project_library_save(p_owner uuid,p_project text,p_expected integer,p_snapshot jsonb)
returns integer language plpgsql security invoker set search_path='' as $$ begin raise exception 'PROJECT_NORMALIZED_WRITE_REQUIRED'; end; $$;
revoke all on function public.project_library_save(uuid,text,integer,jsonb) from public,anon,authenticated,service_role;
create or replace function public.project_library_ready() returns integer language sql stable security invoker set search_path='' as $$
  select case when exists(select 1 from storage.buckets where id='project-originals-private' and public=false) then 2 else 0 end;
$$;
revoke all on function public.project_library_ready() from public,anon,authenticated;
grant execute on function public.project_library_ready() to service_role;
insert into storage.buckets(id,name,public,file_size_limit) values('project-originals-private','project-originals-private',false,104857600) on conflict(id) do nothing;
commit;
