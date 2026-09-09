create table public.storage_tombstones(bucket text not null,object_key text not null,claimed_at timestamptz not null default now(),primary key(bucket,object_key));
alter table public.storage_tombstones enable row level security;
revoke all on public.storage_tombstones from public,anon,authenticated;
grant all on public.storage_tombstones to service_role;
-- Shared lifecycle locks make reference commit vs. garbage collection atomic.
alter function public.commit_workspace(uuid,bigint,jsonb) rename to commit_workspace_core;
revoke all on function public.commit_workspace_core(uuid,bigint,jsonb) from public,anon,authenticated,service_role;
create function public.commit_workspace(p_owner uuid,p_expected bigint,p_state jsonb) returns bigint language plpgsql security definer set search_path=public as $$begin
 perform pg_advisory_xact_lock_shared(73519008);
 if exists(select 1 from jsonb_array_elements(coalesce(p_state->'attachments','[]')) a join storage_tombstones t on t.bucket='attachments' and t.object_key=a->>'key') then raise exception 'STAGED_OBJECT_EXPIRED';end if;
 return commit_workspace_core(p_owner,p_expected,p_state);
end$$;
revoke all on function public.commit_workspace(uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.commit_workspace(uuid,bigint,jsonb) to service_role;
alter function public.publish_snapshot(uuid,uuid,uuid,jsonb,bigint) rename to publish_snapshot_core;
revoke all on function public.publish_snapshot_core(uuid,uuid,uuid,jsonb,bigint) from public,anon,authenticated,service_role;
create function public.publish_snapshot(p_owner uuid,p_id uuid,p_container uuid,p_snapshot jsonb,p_expected bigint) returns void language plpgsql security definer set search_path=public as $$begin
 perform pg_advisory_xact_lock_shared(73519008);
 if exists(select 1 from jsonb_array_elements(coalesce(p_snapshot->'attachments','[]')) a join storage_tombstones t on t.bucket='publication-assets' and t.object_key=p_id::text||'/'||(p_snapshot->>'id')||'/'||(a->>'id')) then raise exception 'STAGED_OBJECT_EXPIRED';end if;
 perform publish_snapshot_core(p_owner,p_id,p_container,p_snapshot,p_expected);
end$$;
revoke all on function public.publish_snapshot(uuid,uuid,uuid,jsonb,bigint) from public,anon,authenticated;
grant execute on function public.publish_snapshot(uuid,uuid,uuid,jsonb,bigint) to service_role;
create function public.claim_orphan_object(p_bucket text,p_key text) returns boolean language plpgsql security definer set search_path=public as $$begin
 if p_bucket not in('attachments','publication-assets') then return false;end if;
 perform pg_advisory_xact_lock(73519008);
 if p_bucket='attachments' then
  if exists(select 1 from personal_records where kind='attachments' and data->>'key'=p_key) then return false;end if;
  if exists(select 1 from personal_records where kind='copies' and jsonb_path_exists(data,'$.mergeCheckpoint.records.attachments[*] ? (@.key == $key)',jsonb_build_object('key',p_key))) then return false;end if;
  if exists(select 1 from jobs where (result->>'objectKey'=p_key and not coalesce((result->>'expired')::boolean,false)) or (payload->>'objectKey'=p_key and status in('queued','running'))) then return false;end if;
 else
  if exists(select 1 from publication_versions v where p_key like v.publication_id::text||'/'||v.id::text||'/%') then return false;end if;
  if exists(select 1 from jobs j where kind='publication' and status in('queued','running') and p_key like (payload#>>'{fields,publicationId}')||'/'||(payload#>>'{fields,id}')||'/%') then return false;end if;
 end if;
 insert into storage_tombstones(bucket,object_key) values(p_bucket,p_key) on conflict do nothing;return true;
end$$;
revoke all on function public.claim_orphan_object(text,text) from public,anon,authenticated;
grant execute on function public.claim_orphan_object(text,text) to service_role;
