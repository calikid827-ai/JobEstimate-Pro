-- REVIEW ONLY. Not applied by this implementation. Requires library v2 and the
-- existing Plan Study allowance table/column grants. No allowance row/maxima changes.
begin;

create table if not exists public.project_analysis_attempts (
  id uuid primary key,
  sequence_no bigint generated always as identity unique,
  owner_id uuid not null references auth.users(id),
  project_id text not null,
  fingerprint text not null check (fingerprint ~ '^[a-f0-9]{64}$'),
  attempt_number integer not null check (attempt_number between 1 and 2),
  claim_token uuid not null,
  reservation jsonb not null,
  record jsonb not null check (octet_length(record::text) <= 196608),
  created_at timestamptz not null default clock_timestamp(),
  unique(owner_id,project_id,fingerprint,attempt_number),
  foreign key(owner_id,project_id) references public.project_library_heads(owner_id,project_id)
);
create index if not exists project_analysis_owner_history on public.project_analysis_attempts(owner_id,project_id,sequence_no desc);
alter table public.project_analysis_attempts enable row level security;
revoke all on public.project_analysis_attempts from public,anon,authenticated,service_role;
grant select,insert,update on public.project_analysis_attempts to service_role;
revoke all on sequence public.project_analysis_attempts_sequence_no_seq from public,anon,authenticated,service_role;
grant usage,select on sequence public.project_analysis_attempts_sequence_no_seq to service_role;

-- A shared reservation guard closes the cross-path gap without rewriting the
-- existing Study claim/provider or granting any allowance configuration rights.
-- Both claim functions reserve under this row lock before inserting their new
-- attempt. A reservation increase cannot pass an older running/unknown attempt.
create or replace function public.project_analysis_shared_reservation_guard() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.reserved_attempts>old.reserved_attempts and (
    old.reserved_attempts>0 or new.reserved_attempts<>old.reserved_attempts+1
    or exists(select 1 from public.plan_study_attempts a where a.owner_id=new.owner_id and a.record->>'status' in ('running','unknown'))
    or exists(select 1 from public.project_analysis_attempts a where a.owner_id=new.owner_id and a.record->>'status' in ('running','unknown'))
  ) then raise exception 'STUDY_RECONCILIATION_REQUIRED'; end if;
  return new;
end;
$$;
revoke all on function public.project_analysis_shared_reservation_guard() from public,anon,authenticated,service_role;
grant execute on function public.project_analysis_shared_reservation_guard() to service_role;
drop trigger if exists project_analysis_shared_reservation_guard on public.plan_study_allowances;
create trigger project_analysis_shared_reservation_guard before update of reserved_attempts on public.plan_study_allowances
for each row when (new.reserved_attempts>old.reserved_attempts) execute function public.project_analysis_shared_reservation_guard();

create or replace function public.project_analysis_ready() returns integer
language sql stable security invoker set search_path = '' as $$
  select case when public.project_library_ready()=2
    and pg_catalog.to_regclass('public.plan_study_allowances') is not null
    and pg_catalog.has_table_privilege('service_role','public.project_analysis_attempts','SELECT,INSERT,UPDATE')
    and pg_catalog.has_table_privilege('service_role','public.plan_study_allowances','SELECT')
    and not pg_catalog.has_table_privilege('service_role','public.plan_study_allowances','INSERT,DELETE,TRUNCATE')
    and not pg_catalog.has_table_privilege('anon','public.project_analysis_attempts','SELECT,INSERT,UPDATE,DELETE')
    and not pg_catalog.has_table_privilege('authenticated','public.project_analysis_attempts','SELECT,INSERT,UPDATE,DELETE')
    and not pg_catalog.has_column_privilege('service_role','public.plan_study_allowances','max_attempts','UPDATE')
    and not pg_catalog.has_column_privilege('service_role','public.plan_study_allowances','max_input_tokens','UPDATE')
    and not pg_catalog.has_column_privilege('service_role','public.plan_study_allowances','max_output_tokens','UPDATE')
    and exists(select 1 from pg_catalog.pg_trigger t where t.tgrelid='public.plan_study_allowances'::pg_catalog.regclass
      and t.tgname='project_analysis_shared_reservation_guard' and t.tgenabled in ('O','A')
      and t.tgfoid='public.project_analysis_shared_reservation_guard()'::pg_catalog.regprocedure)
    then 1 else 0 end;
$$;

create or replace function public.project_analysis_claim(p_owner uuid,p_project text,p_spec jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare prior public.project_analysis_attempts%rowtype; allowance public.plan_study_allowances%rowtype;
  ident uuid; claim uuid; ordinal integer; source jsonb; reservation jsonb; next_record jsonb;
begin
  -- All library/analysis mutations lock project head first, allowance second.
  perform 1 from public.project_library_heads where owner_id=p_owner and project_id=p_project for update;
  if not found then raise exception 'ANALYSIS_NOT_FOUND'; end if;
  if p_spec->>'fingerprint' !~ '^[a-f0-9]{64}$'
    or pg_catalog.jsonb_typeof(p_spec->'sourceVersions') <> 'array'
    or pg_catalog.jsonb_array_length(p_spec->'sourceVersions') not between 1 and 12
    or (select count(*) from pg_catalog.jsonb_array_elements(p_spec->'sourceVersions') s where s->>'role'='target') not between 1 and 4
    or (select count(*) from pg_catalog.jsonb_array_elements(p_spec->'sourceVersions') s where s->>'role'='context') > 8
    then raise exception 'ANALYSIS_INPUT_INVALID'; end if;
  for source in select value from pg_catalog.jsonb_array_elements(p_spec->'sourceVersions') loop
    if not exists(select 1 from public.project_library_files f where f.owner_id=p_owner and f.project_id=p_project
      and f.file_id=source->>'fileId' and f.source_version=(source->>'sourceVersion')::integer
      and f.source_sha256=source->>'sourceSha256' and f.active and f.metadata->>'status'='uploaded')
      then raise exception 'ANALYSIS_SOURCE_CHANGED'; end if;
  end loop;
  select * into prior from public.project_analysis_attempts
    where owner_id=p_owner and project_id=p_project and fingerprint=p_spec->>'fingerprint'
    order by attempt_number desc limit 1;
  if found and (prior.record->>'status'<>'failed' or coalesce((p_spec->>'retryFailed')::boolean,false)=false) then
    return pg_catalog.jsonb_build_object('record',prior.record,'claimToken',prior.claim_token,'reservation',prior.reservation,'acquired',false);
  end if;
  ordinal=coalesce(prior.attempt_number,0)+1;
  if ordinal>2 then raise exception 'ANALYSIS_RETRY_LIMIT'; end if;
  reservation=p_spec->'reservation';
  if reservation->>'inputTokens'<>'200000' or reservation->>'outputTokens'<>'6000' then raise exception 'ANALYSIS_ALLOWANCE_UNAVAILABLE'; end if;
  -- Reuse the existing independently administered owner-level study allowance.
  -- Never insert an allowance, change maxima or touch Estimate entitlements.
  select * into allowance from public.plan_study_allowances where owner_id=p_owner for update;
  if not found then raise exception 'ANALYSIS_ALLOWANCE_UNAVAILABLE'; end if;
  if exists(select 1 from public.project_analysis_attempts where owner_id=p_owner and record->>'status' in ('running','unknown'))
    or allowance.reserved_attempts>0 then raise exception 'ANALYSIS_RECONCILIATION_REQUIRED'; end if;
  if allowance.used_attempts+allowance.reserved_attempts+1>allowance.max_attempts
    or allowance.used_input_tokens+allowance.reserved_input_tokens+200000>allowance.max_input_tokens
    or allowance.used_output_tokens+allowance.reserved_output_tokens+6000>allowance.max_output_tokens
    then raise exception 'ANALYSIS_ALLOWANCE_UNAVAILABLE'; end if;
  update public.plan_study_allowances set reserved_attempts=reserved_attempts+1,
    reserved_input_tokens=reserved_input_tokens+200000,reserved_output_tokens=reserved_output_tokens+6000 where owner_id=p_owner;
  ident=pg_catalog.gen_random_uuid(); claim=pg_catalog.gen_random_uuid();
  next_record=pg_catalog.jsonb_build_object('id',ident,'ownerId',p_owner,'projectId',p_project,'fingerprint',p_spec->>'fingerprint','attemptNumber',ordinal,
    'sourceVersions',p_spec->'sourceVersions','status','running','createdAt',pg_catalog.clock_timestamp(),'leaseExpiresAt',pg_catalog.clock_timestamp()+interval '5 minutes',
    'modelLabel',p_spec->>'modelLabel','resultIdentity',null,'result',null);
  insert into public.project_analysis_attempts(id,owner_id,project_id,fingerprint,attempt_number,claim_token,reservation,record)
    values(ident,p_owner,p_project,p_spec->>'fingerprint',ordinal,claim,reservation,next_record);
  return pg_catalog.jsonb_build_object('record',next_record,'claimToken',claim,'reservation',reservation,'acquired',true);
end;
$$;

create or replace function public.project_analysis_complete(p_owner uuid,p_project text,p_attempt uuid,p_claim uuid,p_completion jsonb) returns void
language plpgsql security invoker set search_path = '' as $$
declare attempt public.project_analysis_attempts%rowtype; source jsonb; status text; measured jsonb; next_record jsonb;
  in_tokens bigint; out_tokens bigint; stale boolean=false;
begin
  perform 1 from public.project_library_heads where owner_id=p_owner and project_id=p_project for update;
  if not found then raise exception 'ANALYSIS_NOT_FOUND'; end if;
  select * into attempt from public.project_analysis_attempts where owner_id=p_owner and project_id=p_project and id=p_attempt for update;
  if not found or attempt.claim_token<>p_claim then raise exception 'ANALYSIS_NOT_FOUND'; end if;
  if attempt.record->>'status'<>'running' then return; end if;
  status=p_completion->>'status';
  if status is null or status not in ('complete','failed','unknown') then raise exception 'ANALYSIS_INPUT_INVALID'; end if;
  if (attempt.record->>'leaseExpiresAt')::timestamptz<=pg_catalog.clock_timestamp() then status='unknown'; end if;
  for source in select value from pg_catalog.jsonb_array_elements(attempt.record->'sourceVersions') loop
    if not exists(select 1 from public.project_library_files f where f.owner_id=p_owner and f.project_id=p_project and f.file_id=source->>'fileId'
      and f.source_version=(source->>'sourceVersion')::integer and f.source_sha256=source->>'sourceSha256' and f.active and f.metadata->>'status'='uploaded') then stale=true; end if;
  end loop;
  if stale and status='complete' then status='failed'; end if;
  next_record=attempt.record||pg_catalog.jsonb_build_object('status',status,'result',null,'resultIdentity',null);
  if p_completion ? 'errorCode' then next_record=next_record||pg_catalog.jsonb_build_object('errorCode',p_completion->>'errorCode'); end if;
  if stale then next_record=next_record||pg_catalog.jsonb_build_object('errorCode','ANALYSIS_SOURCE_CHANGED'); end if;
  if status<>'unknown' then
    measured=p_completion->'usage';
    if measured is null then raise exception 'ANALYSIS_INPUT_INVALID'; end if;
    in_tokens=(measured->>'inputTokens')::bigint; out_tokens=(measured->>'outputTokens')::bigint;
    if in_tokens is null or out_tokens is null or in_tokens<0 or out_tokens<0 then raise exception 'ANALYSIS_INPUT_INVALID'; end if;
    -- Settlement records actual known usage once, even if it exceeds a reservation.
    perform 1 from public.plan_study_allowances where owner_id=p_owner for update;
    update public.plan_study_allowances set reserved_attempts=reserved_attempts-1,used_attempts=used_attempts+1,
      reserved_input_tokens=reserved_input_tokens-(attempt.reservation->>'inputTokens')::bigint,used_input_tokens=used_input_tokens+in_tokens,
      reserved_output_tokens=reserved_output_tokens-(attempt.reservation->>'outputTokens')::bigint,used_output_tokens=used_output_tokens+out_tokens where owner_id=p_owner;
    next_record=next_record||pg_catalog.jsonb_build_object('usage',measured);
  end if;
  if status='complete' then
    if pg_catalog.jsonb_typeof(p_completion->'result') is distinct from 'object' or p_completion->>'resultIdentity' is null or p_completion->>'resultIdentity' !~ '^[a-f0-9]{64}$' then raise exception 'ANALYSIS_INPUT_INVALID'; end if;
    next_record=next_record||pg_catalog.jsonb_build_object('result',p_completion->'result','resultIdentity',p_completion->>'resultIdentity');
  end if;
  update public.project_analysis_attempts set record=next_record where id=p_attempt and owner_id=p_owner and project_id=p_project;
end;
$$;
revoke all on function public.project_analysis_ready(),public.project_analysis_claim(uuid,text,jsonb),public.project_analysis_complete(uuid,text,uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.project_analysis_ready(),public.project_analysis_claim(uuid,text,jsonb),public.project_analysis_complete(uuid,text,uuid,uuid,jsonb) to service_role;
commit;
