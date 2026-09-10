-- Enforce relationships that must hold even for server/worker writes.
alter table public.public_threads add constraint thread_version_publication_fk
  foreign key (version_id, publication_id)
  references public.publication_versions(id, publication_id) on delete cascade;
alter table public.publication_versions add constraint snapshot_identity_check check (
  (jsonb_typeof(payload)='object' and payload->>'id'=id::text
    and payload->>'publicationId'=publication_id::text
    and payload->>'version'=version::text and version>0) is true
);
alter table public.jobs add constraint jobs_valid_work check (
  kind in ('publication','metadata','copy','import','export')
  and jsonb_typeof(payload)='object' and progress between 0 and 100
  and attempts>=0 and max_attempts between 1 and 20
);
alter table public.rate_limits add constraint rate_limits_valid_counter
  check (used>=0 and char_length(btrim(bucket)) between 1 and 80);
alter table public.clarification_requests add constraint clarification_valid_state
  check (status in ('Open','In progress','Resolved','Closed') and jsonb_typeof(replies)='array');

-- Immutable public snapshots survive private note edits. Deletion remains available
-- to account deletion/cascades; changes must create a new publication version.
create function public.protect_publication_version() returns trigger
language plpgsql set search_path='' as $$
begin
  if new is distinct from old then raise exception 'IMMUTABLE_VERSION'; end if;
  return new;
end $$;
revoke all on function public.protect_publication_version() from public, anon, authenticated, service_role;
create trigger publication_version_immutable before update on public.publication_versions
  for each row execute function public.protect_publication_version();

-- Workers share these checks with HTTP routes; a missed route check cannot let a
-- suspended account publish a journal template or another public resource.
create function public.check_posting_account() returns trigger
language plpgsql set search_path='' as $$
begin
  if exists (select 1 from public.profiles where id=new.owner_id and suspended) then
    raise exception 'POSTING_SUSPENDED' using errcode='42501';
  end if;
  return new;
end $$;
revoke all on function public.check_posting_account() from public, anon, authenticated, service_role;
create trigger template_posting_account before insert on public.journal_templates
  for each row execute function public.check_posting_account();
create trigger thread_posting_account before insert on public.public_threads
  for each row execute function public.check_posting_account();
create trigger reply_posting_account before insert on public.thread_replies
  for each row execute function public.check_posting_account();
create trigger publication_posting_account before insert or update of status on public.publications
  for each row when (new.status='published') execute function public.check_posting_account();

create or replace function public.commit_workspace(p_owner uuid,p_expected bigint,p_state jsonb)
returns bigint language plpgsql security definer set search_path=public,pg_temp as $$
declare k text;
begin
  if p_owner is null or p_expected is null or p_expected<0
    or jsonb_typeof(p_state) is distinct from 'object'
    or jsonb_typeof(p_state->'containers') is distinct from 'array'
    or jsonb_typeof(p_state->'notes') is distinct from 'array' then
    raise exception 'INVALID_WORKSPACE';
  end if;
  if jsonb_array_length(p_state->'containers')>10000 then raise exception 'CONTAINER_LIMIT'; end if;
  foreach k in array array['definitions','sources','anchors','attachments','annotations','review','copies','notifications','ai'] loop
    if p_state ? k and jsonb_typeof(p_state->k) is distinct from 'array' then
      raise exception 'INVALID_WORKSPACE';
    end if;
  end loop;
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_state->'attachments','[]')) a
    where split_part(a->>'key','/',1) is distinct from p_owner::text
      or coalesce(a->>'key','') not like p_owner::text||'/_%'
  ) then raise exception 'ASSET_OWNERSHIP'; end if;
  perform pg_advisory_xact_lock_shared(73519008);
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_state->'attachments','[]')) a
    join storage_tombstones t on t.bucket='attachments' and t.object_key=a->>'key'
  ) then raise exception 'STAGED_OBJECT_EXPIRED'; end if;
  return commit_workspace_core(p_owner,p_expected,p_state);
end $$;

create or replace function public.publish_snapshot(p_owner uuid,p_id uuid,p_container uuid,p_snapshot jsonb,p_expected bigint)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if p_owner is null or p_id is null or p_expected is null or p_expected<0
    or jsonb_typeof(p_snapshot) is distinct from 'object'
    or p_snapshot->>'publicationId' is distinct from p_id::text
    or p_snapshot->>'id' is null or p_snapshot->>'version' is null then
    raise exception 'INVALID_SNAPSHOT';
  end if;
  -- Match commit_workspace's lock order: lifecycle lock, then workspace row.
  perform pg_advisory_xact_lock_shared(73519008);
  -- Lock before checking the private container, preventing a concurrent workspace move.
  perform 1 from workspaces where owner_id=p_owner for update;
  if p_container is not null and not exists (
    select 1 from containers where id=p_container and owner_id=p_owner
  ) then raise exception 'OWNERSHIP'; end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_snapshot->'attachments','[]')) a
    join storage_tombstones t on t.bucket='publication-assets'
      and t.object_key=p_id::text||'/'||(p_snapshot->>'id')||'/'||(a->>'id')
  ) then raise exception 'STAGED_OBJECT_EXPIRED'; end if;
  perform publish_snapshot_core(p_owner,p_id,p_container,p_snapshot,p_expected);
end $$;

-- A rejected request no longer grows the counter forever. The conditional upsert
-- is atomic under concurrent API requests. Every daily window is midnight UTC.
create or replace function public.consume_quota(p_owner uuid,p_bucket text,p_limit int)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare n int;
begin
  if p_owner is null or p_bucket is null or char_length(btrim(p_bucket)) not between 1 and 80
    or p_limit is null or p_limit<1 then return false; end if;
  insert into rate_limits(owner_id,bucket,window_start,used)
  values(p_owner,p_bucket,date_trunc('day',now() at time zone 'UTC') at time zone 'UTC',1)
  on conflict(owner_id,bucket,window_start) do update set used=rate_limits.used+1
    where rate_limits.used<p_limit
  returning used into n;
  return n is not null;
end $$;

-- Cancelled work with an expired lease must become terminal rather than remain
-- running forever after a worker crash. Preserve live leases and SKIP LOCKED.
create or replace function public.claim_job(p_worker text) returns setof public.jobs
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if p_worker is null or char_length(btrim(p_worker)) not between 1 and 200 then
    raise exception 'INVALID_WORKER';
  end if;
  update jobs set status='cancelled',lease_until=null,worker_id=null,updated_at=now()
    where cancel_requested and (status='queued' or (status='running' and coalesce(lease_until,now())<=now()));
  update jobs set status='failed',error='Retry limit reached',lease_until=null,updated_at=now()
    where attempts>=max_attempts and status in ('running','queued') and coalesce(lease_until,now())<=now();
  return query with candidate as (
    select id from jobs
    where ((status='queued' and available_at<=now()) or (status='running' and coalesce(lease_until,now())<=now()))
      and attempts<max_attempts and not cancel_requested
    order by available_at,created_at,id for update skip locked limit 1
  ) update jobs j set status='running',attempts=j.attempts+1,worker_id=p_worker,
      lease_until=now()+interval '90 seconds',updated_at=now()
    from candidate c where j.id=c.id returning j.*;
end $$;

revoke all on function public.commit_workspace(uuid,bigint,jsonb),
  public.publish_snapshot(uuid,uuid,uuid,jsonb,bigint), public.consume_quota(uuid,text,int),
  public.claim_job(text) from public, anon, authenticated;
grant execute on function public.commit_workspace(uuid,bigint,jsonb),
  public.publish_snapshot(uuid,uuid,uuid,jsonb,bigint), public.consume_quota(uuid,text,int),
  public.claim_job(text) to service_role;

-- Cover ownership checks, FK cascades and frequently used inbox/discovery paths.
create index note_revisions_owner_note on public.note_revisions(owner_id,note_id);
create index publications_owner_created on public.publications(owner_id,created_at desc);
create index publications_current_version on public.publications(current_version,id);
create index public_threads_publication_created on public.public_threads(publication_id,created_at desc);
create index public_threads_version_publication on public.public_threads(version_id,publication_id);
create index public_threads_owner on public.public_threads(owner_id);
create index thread_replies_thread_created on public.thread_replies(thread_id,created_at);
create index thread_replies_owner on public.thread_replies(owner_id);
create index clarification_sender_created on public.clarification_requests(sender_id,created_at desc);
create index clarification_recipient_created on public.clarification_requests(recipient_id,created_at desc);
create index clarification_publication on public.clarification_requests(publication_id);
create index reports_reporter on public.reports(reporter_id);
create index reports_publication on public.reports(publication_id);
create index moderation_actions_actor on public.moderation_actions(actor_id);
create index moderation_actions_publication on public.moderation_actions(publication_id);
create index journal_templates_owner on public.journal_templates(owner_id);

notify pgrst, 'reload schema';
