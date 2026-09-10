-- Run as the database owner AFTER all migrations. Synthetic accounts and content
-- exist only inside this transaction; ROLLBACK leaves no fixtures behind.
-- This exercises PostgreSQL roles/RLS/RPCs, not HTTP login or Storage downloads.
begin;
select set_config('studyspace.smoke.a',gen_random_uuid()::text,true),
       set_config('studyspace.smoke.b',gen_random_uuid()::text,true),
       set_config('studyspace.smoke.publication',gen_random_uuid()::text,true),
       set_config('studyspace.smoke.version',gen_random_uuid()::text,true);
do $$
declare
  a uuid := current_setting('studyspace.smoke.a')::uuid;
  b uuid := current_setting('studyspace.smoke.b')::uuid;
  container uuid := gen_random_uuid();
  note uuid := gen_random_uuid();
begin
  insert into auth.users(id) values(a),(b);
  perform public.commit_workspace(a,0,jsonb_build_object(
    'schemaVersion',1,'settings',jsonb_build_object('displayName','SQL smoke fixture'),
    'containers',jsonb_build_array(jsonb_build_object(
      'id',container,'parentId',null,'system','general','title','General')),
    'notes',jsonb_build_array(jsonb_build_object(
      'id',note,'containerId',container,'revision',1,'title','Private fixture',
      'body','Never expose this private fixture','history','[]'::jsonb))
  ));
end $$;

set local role service_role;
do $$
declare
  a uuid := current_setting('studyspace.smoke.a')::uuid;
  publication uuid := current_setting('studyspace.smoke.publication')::uuid;
begin
  if jsonb_array_length(public.read_workspace(a)->'notes')<>1 then
    raise exception 'Server workspace read failed';
  end if;
  if not public.consume_quota(a,'smoke',1) or public.consume_quota(a,'smoke',1) then
    raise exception 'Quota did not enforce its limit';
  end if;
  perform public.publish_snapshot(a,publication,null,jsonb_build_object(
    'id',current_setting('studyspace.smoke.version'),
    'publicationId',publication,'version',1,'title','Approved public fixture',
    'allowQA',true,'notes',jsonb_build_array(jsonb_build_object('body','Explicitly public'))
  ),1);
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('studyspace.smoke.b'),true);
do $$
begin
  if exists(select 1 from public.notes where owner_id=current_setting('studyspace.smoke.a')::uuid) then
    raise exception 'Cross-owner private note leak';
  end if;
end $$;
select set_config('request.jwt.claim.sub',current_setting('studyspace.smoke.a'),true);
do $$
begin
  if (select count(*) from public.notes where owner_id=current_setting('studyspace.smoke.a')::uuid)<>1 then
    raise exception 'Owner cannot read their note';
  end if;
end $$;
reset role;

set local role anon;
select set_config('request.jwt.claim.sub','',true);
do $$
begin
  if (select count(*) from public.publication_versions where id=current_setting('studyspace.smoke.version')::uuid)<>1 then
    raise exception 'Public snapshot unavailable';
  end if;
  if has_table_privilege('anon','public.notes','SELECT')
    or has_table_privilege('anon','public.journal_templates','TRUNCATE') then
    raise exception 'Anonymous privileges too broad';
  end if;
end $$;
reset role;

update public.publications set status='unpublished'
where id=current_setting('studyspace.smoke.publication')::uuid;
set local role anon;
do $$
begin
  if exists(select 1 from public.publication_versions where id=current_setting('studyspace.smoke.version')::uuid) then
    raise exception 'Unpublish did not revoke public access';
  end if;
end $$;
reset role;
delete from auth.users where id in (
  current_setting('studyspace.smoke.a')::uuid,current_setting('studyspace.smoke.b')::uuid
);
set constraints all immediate;
rollback;
select 'Studyspace hosted SQL smoke passed; fixtures rolled back' as result;
