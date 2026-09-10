-- Public clients read through RLS; all transactional writes use the server.
-- In particular, TRUNCATE is not governed by RLS. Do not inherit Supabase's
-- historical ALL grants on newly created application tables.
revoke create on schema public from public, anon, authenticated;
grant usage on schema public to anon, authenticated, service_role;

alter default privileges in schema public revoke all on tables from public, anon, authenticated;
alter default privileges in schema public revoke all on sequences from public, anon, authenticated;
-- PUBLIC's built-in function grant is global, so a schema-only revoke is insufficient.
alter default privileges revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array[
    'profiles','workspaces','containers','notes','note_revisions','personal_records',
    'publications','publication_versions','public_threads','thread_replies',
    'clarification_requests','notifications','reports','moderation_actions',
    'jobs','rate_limits','storage_tombstones','journal_templates'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update, delete on table public.%I to service_role', t);
  end loop;
end $$;

grant select on public.workspaces, public.containers, public.notes,
  public.note_revisions, public.personal_records, public.notifications,
  public.jobs, public.clarification_requests, public.reports,
  public.moderation_actions to authenticated;
grant select on public.publications, public.publication_versions,
  public.public_threads, public.thread_replies, public.journal_templates to anon, authenticated;
grant select (id, display_name, bio) on public.profiles to anon, authenticated;
grant delete on public.journal_templates to authenticated;
revoke all on sequence public.note_revisions_id_seq from public, anon, authenticated;
grant usage, select on sequence public.note_revisions_id_seq to service_role;

-- Pin trusted relations ahead of temporary relations in existing definer functions.
-- Keep the two read-only RLS helpers callable, and keep the core implementations
-- inaccessible even to the service role (only their lifecycle wrappers call them).
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as signature, p.proname
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname = any(array[
      'is_moderator','public_available','commit_workspace','commit_workspace_core',
      'read_workspace','publish_snapshot','publish_snapshot_core','claim_job',
      'consume_quota','moderate_publication','reply_to_request',
      'search_workspace','claim_orphan_object','discover_publications'
    ])
  loop
    execute format('alter function %s set search_path = public, pg_temp', f.signature);
    execute format('revoke all on function %s from public, anon, authenticated, service_role', f.signature);
    if f.proname in ('is_moderator','public_available') then
      execute format('grant execute on function %s to anon, authenticated, service_role', f.signature);
    elsif f.proname not in ('commit_workspace_core','publish_snapshot_core') then
      execute format('grant execute on function %s to service_role', f.signature);
    end if;
  end loop;
  -- Some hosted projects provide this event trigger. It is not an application RPC.
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end $$;

-- Cache the caller identity per statement for large private workspaces.
do $$
declare t text;
begin
  foreach t in array array['workspaces','containers','notes','note_revisions','personal_records','notifications','jobs'] loop
    execute format('alter policy owner_read on public.%I using (owner_id = (select auth.uid()))', t);
  end loop;
end $$;
alter policy profile_read on public.profiles to anon, authenticated
  using (id=(select auth.uid()) or exists (
    select 1 from public.publications p where p.owner_id=profiles.id and public.public_available(p.id)
  ));
alter policy publication_read on public.publications to anon, authenticated
  using (owner_id=(select auth.uid()) or public.public_available(id) or (select public.is_moderator()));
alter policy version_read on public.publication_versions to anon, authenticated
  using (public.public_available(publication_id) or exists (
    select 1 from public.publications p where p.id=publication_id and p.owner_id=(select auth.uid())
  ));
alter policy request_read on public.clarification_requests
  using (sender_id=(select auth.uid()) or recipient_id=(select auth.uid()) or (select public.is_moderator()));
alter policy report_read on public.reports
  using (reporter_id=(select auth.uid()) or (select public.is_moderator()));
alter policy moderation_read on public.moderation_actions using ((select public.is_moderator()));

-- Match the community API: disabling Q&A also hides discussions from direct REST reads.
alter policy question_read on public.public_threads to anon, authenticated using (
  not hidden and public.public_available(publication_id) and exists (
    select 1 from public.publications p join public.publication_versions v on v.id=p.current_version
    where p.id=public_threads.publication_id and v.payload->'allowQA'='true'::jsonb
  )
);
alter policy replies_read on public.thread_replies to anon, authenticated;
drop policy journal_templates_owner_read on public.journal_templates;
alter policy journal_templates_public_read on public.journal_templates
  using (not hidden or owner_id=(select auth.uid()));
alter policy journal_templates_owner_delete on public.journal_templates
  using (owner_id=(select auth.uid()));

-- Preserve immutable upload semantics: new private paths only, no overwrite policy.
alter policy own_assets_read on storage.objects
  using (bucket_id='attachments' and (storage.foldername(name))[1]=(select auth.uid())::text);
alter policy own_assets_insert on storage.objects
  with check (bucket_id='attachments' and (storage.foldername(name))[1]=(select auth.uid())::text);
alter policy own_assets_delete on storage.objects
  using (bucket_id='attachments' and (storage.foldername(name))[1]=(select auth.uid())::text);
update storage.buckets set public=false, file_size_limit=52428800
where id in ('attachments','publication-assets');

notify pgrst, 'reload schema';
