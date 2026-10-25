-- Reviewed setup only: this file is not applied by the application or build.
-- Separate Plan Study allowance; never touches Estimate usage, paid_users or existing RPCs.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '20s';
CREATE TABLE IF NOT EXISTS public.plan_studies (
  id uuid PRIMARY KEY, owner_id uuid NOT NULL, revision bigint NOT NULL DEFAULT 0,
  source_revision bigint NOT NULL DEFAULT 0, snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, owner_id)
);
CREATE TABLE IF NOT EXISTS public.plan_study_allowances (
  owner_id uuid PRIMARY KEY,
  max_attempts integer NOT NULL CHECK (max_attempts >= 0),
  max_input_tokens bigint NOT NULL CHECK (max_input_tokens >= 0),
  max_output_tokens bigint NOT NULL CHECK (max_output_tokens >= 0),
  used_attempts integer NOT NULL DEFAULT 0 CHECK (used_attempts >= 0),
  reserved_attempts integer NOT NULL DEFAULT 0 CHECK (reserved_attempts >= 0),
  used_input_tokens bigint NOT NULL DEFAULT 0 CHECK (used_input_tokens >= 0),
  reserved_input_tokens bigint NOT NULL DEFAULT 0 CHECK (reserved_input_tokens >= 0),
  used_output_tokens bigint NOT NULL DEFAULT 0 CHECK (used_output_tokens >= 0),
  reserved_output_tokens bigint NOT NULL DEFAULT 0 CHECK (reserved_output_tokens >= 0)
);
CREATE TABLE IF NOT EXISTS public.plan_study_attempts (
  id uuid PRIMARY KEY, owner_id uuid NOT NULL, study_id uuid NOT NULL,
  idempotency_key text NOT NULL, source_revision bigint NOT NULL, record jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (study_id, owner_id) REFERENCES public.plan_studies(id, owner_id),
  UNIQUE (study_id, idempotency_key)
);
CREATE TABLE IF NOT EXISTS public.plan_study_artifacts (
  id uuid PRIMARY KEY, owner_id uuid NOT NULL, study_id uuid NOT NULL,
  document_version_id uuid NOT NULL, record jsonb NOT NULL,
  FOREIGN KEY (study_id, owner_id) REFERENCES public.plan_studies(id, owner_id)
);
CREATE INDEX IF NOT EXISTS plan_studies_owner_updated ON public.plan_studies(owner_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS plan_study_attempts_owner_study ON public.plan_study_attempts(owner_id, study_id);
ALTER TABLE public.plan_studies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_study_allowances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_study_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_study_artifacts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.plan_studies, public.plan_study_allowances, public.plan_study_attempts, public.plan_study_artifacts FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.plan_studies, public.plan_study_attempts TO service_role;
REVOKE ALL (owner_id,max_attempts,max_input_tokens,max_output_tokens,used_attempts,reserved_attempts,used_input_tokens,reserved_input_tokens,used_output_tokens,reserved_output_tokens)
 ON public.plan_study_allowances FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.plan_study_allowances TO service_role;
GRANT UPDATE (used_attempts,reserved_attempts,used_input_tokens,reserved_input_tokens,used_output_tokens,reserved_output_tokens)
 ON public.plan_study_allowances TO service_role;
GRANT SELECT, INSERT ON public.plan_study_artifacts TO service_role;
-- No allowance row is inserted here. An independently authorized administrator must
-- configure a fixed owner-level allowance; creating studies cannot replenish it.
INSERT INTO storage.buckets(id, name, public) VALUES ('plan-study-private', 'plan-study-private', false)
ON CONFLICT (id) DO NOTHING;
-- Never silently turn an existing public bucket private or take over its contents.
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'plan-study-private' AND public = false)
 THEN RAISE EXCEPTION 'Plan Study requires its dedicated private bucket'; END IF;
END $$;

-- Restrictive browser-role policies also deny this bucket if the installation has
-- pre-existing permissive "all buckets" policies. Other buckets are unaffected.
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname='plan_study_private_objects' AND polrelid='storage.objects'::regclass) THEN
  CREATE POLICY plan_study_private_objects ON storage.objects AS RESTRICTIVE FOR ALL TO PUBLIC
   USING (bucket_id <> 'plan-study-private') WITH CHECK (bucket_id <> 'plan-study-private');
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname='plan_study_private_bucket' AND polrelid='storage.buckets'::regclass) THEN
  CREATE POLICY plan_study_private_bucket ON storage.buckets AS RESTRICTIVE FOR ALL TO PUBLIC
   USING (id <> 'plan-study-private') WITH CHECK (id <> 'plan-study-private');
 END IF;
END $$;

CREATE OR REPLACE FUNCTION public.plan_study_ready() RETURNS integer
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = pg_catalog, public AS $$
 SELECT CASE WHEN EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'plan-study-private' AND public = false)
   AND (SELECT relrowsecurity FROM pg_class WHERE oid='storage.objects'::regclass)
   AND (SELECT relrowsecurity FROM pg_class WHERE oid='storage.buckets'::regclass)
   AND EXISTS (SELECT 1 FROM pg_policy WHERE polname='plan_study_private_objects' AND polrelid='storage.objects'::regclass
     AND NOT polpermissive AND polcmd='*' AND polroles=ARRAY[0]::oid[]
     AND pg_get_expr(polqual,polrelid)='(bucket_id <> ''plan-study-private''::text)'
     AND pg_get_expr(polwithcheck,polrelid)='(bucket_id <> ''plan-study-private''::text)')
   AND EXISTS (SELECT 1 FROM pg_policy WHERE polname='plan_study_private_bucket' AND polrelid='storage.buckets'::regclass
     AND NOT polpermissive AND polcmd='*' AND polroles=ARRAY[0]::oid[]
     AND pg_get_expr(polqual,polrelid)='(id <> ''plan-study-private''::text)'
     AND pg_get_expr(polwithcheck,polrelid)='(id <> ''plan-study-private''::text)')
   AND NOT EXISTS (SELECT 1 FROM (VALUES ('public.plan_studies'),('public.plan_study_allowances'),('public.plan_study_attempts'),('public.plan_study_artifacts')) t(name),
     (VALUES ('anon'),('authenticated')) r(name)
     WHERE has_table_privilege(r.name,t.name,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
       OR has_any_column_privilege(r.name,t.name,'SELECT,INSERT,UPDATE,REFERENCES'))
   AND NOT EXISTS (SELECT 1 FROM (VALUES ('used_attempts'),('reserved_attempts'),('used_input_tokens'),('reserved_input_tokens'),('used_output_tokens'),('reserved_output_tokens')) c(name)
     WHERE NOT has_column_privilege('service_role','public.plan_study_allowances',c.name,'UPDATE'))
   AND has_table_privilege('service_role','public.plan_study_allowances','SELECT')
   AND NOT has_table_privilege('service_role','public.plan_study_allowances','INSERT,DELETE,TRUNCATE,REFERENCES,TRIGGER')
   AND NOT has_column_privilege('service_role','public.plan_study_allowances','owner_id','UPDATE')
   AND NOT has_column_privilege('service_role','public.plan_study_allowances','max_attempts','UPDATE')
   AND NOT has_column_privilege('service_role','public.plan_study_allowances','max_input_tokens','UPDATE')
   AND NOT has_column_privilege('service_role','public.plan_study_allowances','max_output_tokens','UPDATE')
   THEN 1 ELSE 0 END;
$$;

CREATE OR REPLACE FUNCTION public.plan_study_save(p_owner uuid, p_study uuid, p_expected_revision bigint, p_snapshot jsonb) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE s public.plan_studies%ROWTYPE;
BEGIN
 SELECT * INTO s FROM public.plan_studies WHERE id=p_study AND owner_id=p_owner FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'STUDY_NOT_FOUND'; END IF;
 IF s.revision <> p_expected_revision OR p_snapshot->>'ownerId' <> p_owner::text OR p_snapshot->>'id' <> p_study::text
 THEN RAISE EXCEPTION 'STUDY_CHANGED'; END IF;
 IF (p_snapshot->>'sourceRevision')::bigint NOT IN (s.source_revision, s.source_revision+1)
 THEN RAISE EXCEPTION 'STUDY_CHANGED'; END IF;
 UPDATE public.plan_studies SET revision=s.revision+1, source_revision=(p_snapshot->>'sourceRevision')::bigint,
 snapshot=(p_snapshot - 'attempts') || jsonb_build_object('revision',s.revision+1,'updatedAt',clock_timestamp()), updated_at=clock_timestamp()
 WHERE id=p_study AND owner_id=p_owner;
END;
$$;

CREATE OR REPLACE FUNCTION public.plan_study_claim(p_owner uuid, p_study uuid, p_expected_revision bigint, p_spec jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE s public.plan_studies%ROWTYPE; a public.plan_study_allowances%ROWTYPE;
 prior public.plan_study_attempts%ROWTYPE; r jsonb; ident uuid; claim uuid;
 in_tokens bigint; out_tokens bigint; page_exists boolean;
BEGIN
 -- Every mutation locks study first; allowance next. One fixed order avoids deadlocks.
 SELECT * INTO s FROM public.plan_studies WHERE id=p_study AND owner_id=p_owner FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'STUDY_NOT_FOUND'; END IF;
 SELECT * INTO prior FROM public.plan_study_attempts WHERE study_id=p_study AND owner_id=p_owner AND idempotency_key=p_spec->>'idempotencyKey';
 IF FOUND THEN
   RETURN jsonb_build_object('attempt',prior.record,'acquired',false,'study',s.snapshot||jsonb_build_object('id',s.id,'ownerId',s.owner_id,'revision',s.revision,'sourceRevision',s.source_revision,'attempts',(SELECT COALESCE(jsonb_agg(record ORDER BY created_at),'[]'::jsonb) FROM public.plan_study_attempts WHERE owner_id=p_owner AND study_id=p_study)));
 END IF;
 IF s.revision <> p_expected_revision THEN RAISE EXCEPTION 'STUDY_CHANGED'; END IF;
 -- Unknown or expired outcomes are never automatically reissued, even with a new key.
 IF EXISTS (SELECT 1 FROM public.plan_study_attempts WHERE study_id=p_study AND owner_id=p_owner
   AND source_revision=s.source_revision AND (record->>'kind')=(p_spec->>'kind')
   AND COALESCE(record->>'pageId','')=COALESCE(p_spec->>'pageId','')
   AND (record->>'status'='unknown' OR record->>'status'='running' AND (record->>'leaseExpiresAt')::timestamptz <= clock_timestamp()))
 THEN RAISE EXCEPTION 'STUDY_RECONCILIATION_REQUIRED'; END IF;
 IF EXISTS (SELECT 1 FROM public.plan_study_attempts WHERE study_id=p_study AND owner_id=p_owner
   AND source_revision=s.source_revision AND (record->>'kind')=(p_spec->>'kind')
   AND COALESCE(record->>'pageId','')=COALESCE(p_spec->>'pageId',''))
 THEN RAISE EXCEPTION 'STUDY_STEP_UNAVAILABLE'; END IF;
 IF p_spec->>'kind'='page' THEN
   SELECT EXISTS (SELECT 1 FROM jsonb_array_elements(s.snapshot->'documents') d,
     jsonb_array_elements(d->'pages') p WHERE (d->>'active')::boolean AND p->>'id'=p_spec->>'pageId'
     AND p->>'extraction' IN ('complete','empty') AND p->>'rendering'='complete' AND p->>'analysis'='pending') INTO page_exists;
   IF NOT page_exists THEN RAISE EXCEPTION 'STUDY_STEP_UNAVAILABLE'; END IF;
 ELSIF p_spec->>'kind'='synthesis' THEN
   IF s.snapshot->>'synthesis'<>'pending' OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(s.snapshot->'documents') d WHERE (d->>'active')::boolean)
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(s.snapshot->'documents') d, jsonb_array_elements(d->'pages') p
     WHERE (d->>'active')::boolean AND p->>'analysis' NOT IN ('complete','limited'))
   THEN RAISE EXCEPTION 'STUDY_STEP_UNAVAILABLE'; END IF;
 ELSE RAISE EXCEPTION 'STUDY_STEP_UNAVAILABLE'; END IF;
 in_tokens=(p_spec->'reservation'->>'inputTokens')::bigint;
 out_tokens=(p_spec->'reservation'->>'outputTokens')::bigint;
 IF in_tokens <= 0 OR out_tokens <= 0 OR in_tokens > 200000 OR out_tokens > 6000 THEN RAISE EXCEPTION 'STUDY_ALLOWANCE_UNAVAILABLE'; END IF;
 SELECT * INTO a FROM public.plan_study_allowances WHERE owner_id=p_owner FOR UPDATE;
 IF NOT FOUND OR a.used_attempts+a.reserved_attempts+1>a.max_attempts
   OR a.used_input_tokens+a.reserved_input_tokens+in_tokens>a.max_input_tokens
   OR a.used_output_tokens+a.reserved_output_tokens+out_tokens>a.max_output_tokens
 THEN RAISE EXCEPTION 'STUDY_ALLOWANCE_UNAVAILABLE'; END IF;
 UPDATE public.plan_study_allowances SET reserved_attempts=reserved_attempts+1,
   reserved_input_tokens=reserved_input_tokens+in_tokens, reserved_output_tokens=reserved_output_tokens+out_tokens WHERE owner_id=p_owner;
 ident=gen_random_uuid(); claim=gen_random_uuid();
 r=jsonb_build_object('id',ident,'idempotencyKey',p_spec->>'idempotencyKey','studyId',p_study,'ownerId',p_owner,
   'sourceRevision',s.source_revision,'sourceVersions',(SELECT jsonb_agg(jsonb_build_object('documentVersionId',d->>'id','sha256',d->>'sha256')) FROM jsonb_array_elements(s.snapshot->'documents') d WHERE (d->>'active')::boolean),
   'kind',p_spec->>'kind','status','running','claimToken',claim,
   'reservation',p_spec->'reservation','createdAt',clock_timestamp(),'leaseExpiresAt',clock_timestamp()+interval '5 minutes');
 IF p_spec ? 'pageId' THEN r=r||jsonb_build_object('pageId',p_spec->>'pageId'); END IF;
 INSERT INTO public.plan_study_attempts(id,owner_id,study_id,idempotency_key,source_revision,record)
 VALUES(ident,p_owner,p_study,p_spec->>'idempotencyKey',s.source_revision,r);
 UPDATE public.plan_studies SET revision=revision+1, updated_at=clock_timestamp() WHERE id=p_study AND owner_id=p_owner;
 RETURN jsonb_build_object('attempt',r,'acquired',true,'study',s.snapshot||jsonb_build_object('id',s.id,'ownerId',s.owner_id,'revision',s.revision+1,'sourceRevision',s.source_revision,'attempts',(SELECT COALESCE(jsonb_agg(record ORDER BY created_at),'[]'::jsonb) FROM public.plan_study_attempts WHERE owner_id=p_owner AND study_id=p_study)));
END;
$$;

CREATE OR REPLACE FUNCTION public.plan_study_complete(p_owner uuid,p_study uuid,p_attempt uuid,p_claim uuid,p_source_revision bigint,p_completion jsonb) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE s public.plan_studies%ROWTYPE; a public.plan_study_attempts%ROWTYPE; r jsonb; docs jsonb; d jsonb; pages jsonb; p jsonb;
 status text; in_tokens bigint; out_tokens bigint; reservation jsonb; findings jsonb; result jsonb;
BEGIN
 SELECT * INTO s FROM public.plan_studies WHERE id=p_study AND owner_id=p_owner FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'STUDY_NOT_FOUND'; END IF;
 SELECT * INTO a FROM public.plan_study_attempts WHERE id=p_attempt AND owner_id=p_owner AND study_id=p_study FOR UPDATE;
 IF NOT FOUND OR a.record->>'claimToken'<>p_claim::text THEN RAISE EXCEPTION 'STUDY_CHANGED'; END IF;
 IF a.record->>'status'<>'running' THEN RETURN; END IF;
 status=p_completion->>'status';
 IF status NOT IN ('complete','failed','unknown') THEN RAISE EXCEPTION 'STUDY_CHANGED'; END IF;
 reservation=a.record->'reservation';
 -- A late/invalidated worker can record no new findings and cannot settle uncertain usage.
 IF s.source_revision<>p_source_revision OR a.source_revision<>p_source_revision OR (a.record->>'leaseExpiresAt')::timestamptz<=clock_timestamp()
 THEN status='unknown'; END IF;
 r=a.record||jsonb_build_object('status',status);
 IF p_completion ? 'errorCode' THEN r=r||jsonb_build_object('errorCode',p_completion->>'errorCode'); END IF;
 IF status <> 'unknown' THEN
  in_tokens=COALESCE((p_completion->'usage'->>'inputTokens')::bigint,(p_completion->'result'->'usage'->>'inputTokens')::bigint,(reservation->>'inputTokens')::bigint);
  out_tokens=COALESCE((p_completion->'usage'->>'outputTokens')::bigint,(p_completion->'result'->'usage'->>'outputTokens')::bigint,(reservation->>'outputTokens')::bigint);
  IF in_tokens<0 OR out_tokens<0 THEN RAISE EXCEPTION 'STUDY_CHANGED'; END IF;
  UPDATE public.plan_study_allowances SET reserved_attempts=reserved_attempts-1, used_attempts=used_attempts+1,
   reserved_input_tokens=reserved_input_tokens-(reservation->>'inputTokens')::bigint, used_input_tokens=used_input_tokens+in_tokens,
   reserved_output_tokens=reserved_output_tokens-(reservation->>'outputTokens')::bigint, used_output_tokens=used_output_tokens+out_tokens WHERE owner_id=p_owner;
  r=r||jsonb_build_object('usage',jsonb_build_object('inputTokens',in_tokens,'outputTokens',out_tokens));
 END IF;
 UPDATE public.plan_study_attempts SET record=r WHERE id=p_attempt AND owner_id=p_owner;
 -- Preserve current answers and all unrelated snapshot fields. Never write a captured whole snapshot.
 IF s.source_revision=p_source_revision THEN
  result=p_completion->'result';
  IF status='complete' AND result IS NULL THEN RAISE EXCEPTION 'STUDY_CHANGED'; END IF;
  IF a.record->>'kind'='page' THEN
   docs='[]'::jsonb;
   FOR d IN SELECT value FROM jsonb_array_elements(s.snapshot->'documents') LOOP
    pages='[]'::jsonb;
    FOR p IN SELECT value FROM jsonb_array_elements(d->'pages') LOOP
     IF p->>'id'=a.record->>'pageId' THEN
      p=p||jsonb_build_object('analysis',CASE WHEN status='complete' THEN result->>'pageStatus' ELSE status END);
      IF status='complete' THEN p=p||jsonb_build_object('issue',COALESCE((SELECT string_agg(value, ' ') FROM jsonb_array_elements_text(result->'limitations')),'')); END IF;
     END IF;
     pages=pages||jsonb_build_array(p);
    END LOOP;
    docs=docs||jsonb_build_array(d||jsonb_build_object('pages',pages));
   END LOOP;
   s.snapshot=jsonb_set(s.snapshot,'{documents}',docs);
  ELSE
   s.snapshot=jsonb_set(s.snapshot,'{synthesis}',to_jsonb(status));
   IF status='complete' THEN s.snapshot=s.snapshot||jsonb_build_object('synthesisReviewStatus',result->>'pageStatus','synthesisLimitations',COALESCE(result->'limitations','[]'::jsonb)); END IF;
  END IF;
  IF status='complete' THEN
   findings=COALESCE(s.snapshot->'findings','[]'::jsonb)||COALESCE(result->'findings','[]'::jsonb);
   s.snapshot=s.snapshot||jsonb_build_object('findings',findings,'modelLabel',result->>'modelLabel');
  END IF;
 END IF;
 UPDATE public.plan_studies SET snapshot=s.snapshot,revision=revision+1,updated_at=clock_timestamp() WHERE id=p_study AND owner_id=p_owner;
END;
$$;
REVOKE ALL ON FUNCTION public.plan_study_ready(), public.plan_study_save(uuid,uuid,bigint,jsonb), public.plan_study_claim(uuid,uuid,bigint,jsonb), public.plan_study_complete(uuid,uuid,uuid,uuid,bigint,jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.plan_study_ready(), public.plan_study_save(uuid,uuid,bigint,jsonb), public.plan_study_claim(uuid,uuid,bigint,jsonb), public.plan_study_complete(uuid,uuid,uuid,uuid,bigint,jsonb) TO service_role;
COMMIT;
