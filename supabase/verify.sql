-- Read-only deployment verification. Run as the database owner in the SQL Editor
-- after applying every migration. This file does not insert accounts or content.
begin read only;
do $$
declare
  t text;
  role_name text;
  f text;
  application_tables text[] := array[
    'profiles','workspaces','containers','notes','note_revisions','personal_records',
    'publications','publication_versions','public_threads','thread_replies',
    'clarification_requests','notifications','reports','moderation_actions',
    'jobs','rate_limits','storage_tombstones','journal_templates'
  ];
begin
  foreach t in array application_tables loop
    if to_regclass('public.'||t) is null then raise exception 'Missing table: %',t; end if;
    if not (select relrowsecurity from pg_class where oid=to_regclass('public.'||t)) then
      raise exception 'RLS disabled: %',t;
    end if;
    foreach role_name in array array['anon','authenticated'] loop
      if has_table_privilege(role_name,'public.'||t,'INSERT,UPDATE,TRUNCATE,REFERENCES,TRIGGER') then
        raise exception 'Unexpected browser write privilege: % / %',role_name,t;
      end if;
      if has_table_privilege(role_name,'public.'||t,'DELETE')
        and not (t='journal_templates' and role_name='authenticated') then
        raise exception 'Unexpected browser delete privilege: % / %',role_name,t;
      end if;
    end loop;
    if not has_table_privilege('service_role','public.'||t,'SELECT') then
      raise exception 'Server cannot read: %',t;
    end if;
  end loop;
  foreach role_name in array array['anon','authenticated'] loop
    if has_schema_privilege(role_name,'public','CREATE') then raise exception 'Browser can create database objects'; end if;
    if has_column_privilege(role_name,'public.profiles','moderator','SELECT')
      or has_column_privilege(role_name,'public.profiles','suspended','SELECT') then
      raise exception 'Private profile flags exposed';
    end if;
    foreach f in array array[
      'commit_workspace(uuid,bigint,jsonb)','commit_workspace_core(uuid,bigint,jsonb)',
      'read_workspace(uuid)','publish_snapshot(uuid,uuid,uuid,jsonb,bigint)',
      'publish_snapshot_core(uuid,uuid,uuid,jsonb,bigint)','claim_job(text)',
      'consume_quota(uuid,text,integer)','moderate_publication(uuid,uuid,text,uuid)',
      'reply_to_request(uuid,uuid,uuid,text,text)','search_workspace(uuid,text,uuid,text[],text,text)',
      'claim_orphan_object(text,text)','discover_publications(text,text,text)'
    ] loop
      if has_function_privilege(role_name,'public.'||f,'EXECUTE') then
        raise exception 'Privileged RPC exposed: % / %',role_name,f;
      end if;
    end loop;
  end loop;
  if has_function_privilege('service_role','public.commit_workspace_core(uuid,bigint,jsonb)','EXECUTE')
    or has_function_privilege('service_role','public.publish_snapshot_core(uuid,uuid,uuid,jsonb,bigint)','EXECUTE') then
    raise exception 'Lifecycle wrapper can be bypassed';
  end if;
  if (select count(*) from storage.buckets where id in ('attachments','publication-assets')
      and public=false and file_size_limit=52428800)<>2 then
    raise exception 'Missing or public/unbounded storage bucket';
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.public_threads'::regclass
    and conname='thread_version_publication_fk' and convalidated) then
    raise exception 'Thread/publication relationship is not enforced';
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.publication_versions'::regclass
    and conname='snapshot_identity_check' and convalidated) then
    raise exception 'Snapshot identities are not enforced';
  end if;
  if not exists (select 1 from pg_trigger where tgrelid='public.publication_versions'::regclass
    and tgname='publication_version_immutable' and tgenabled='O') then
    raise exception 'Immutable snapshot trigger missing or disabled';
  end if;
end $$;
commit;
select 'Studyspace database verification passed' as result;
