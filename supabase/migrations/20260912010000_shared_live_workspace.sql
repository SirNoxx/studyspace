-- Additive storage for the regular workspace UI backed by a collaborative Yjs document.
create table public.shared_workspaces (
 collection_id uuid primary key references public.shared_collections(id) on delete cascade,
 state text not null check(length(state) <= 28000000),
 snapshot jsonb not null,
 revision bigint not null default 1,
 updated_at timestamptz not null default now()
);
create table public.shared_workspace_versions (
 collection_id uuid references public.shared_collections(id) on delete cascade,
 revision bigint not null, snapshot jsonb not null,
 author_id uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(), primary key(collection_id, revision)
);
create table public.shared_workspace_assets (
 id uuid primary key, collection_id uuid not null references public.shared_collections(id) on delete cascade,
 filename text not null, mime text not null, key text not null unique, size bigint not null check(size between 0 and 52428800), hash text not null,
 created_at timestamptz not null default now()
);
alter table public.shared_workspaces enable row level security;
alter table public.shared_workspace_versions enable row level security;
alter table public.shared_workspace_assets enable row level security;
revoke all on public.shared_workspaces,public.shared_workspace_versions,public.shared_workspace_assets from anon,authenticated;
grant select on public.shared_workspaces,public.shared_workspace_versions,public.shared_workspace_assets to authenticated;
grant all on public.shared_workspaces,public.shared_workspace_versions,public.shared_workspace_assets to service_role;
create policy shared_workspace_read on public.shared_workspaces for select to authenticated using(public.shared_access(collection_id));
create policy shared_workspace_version_read on public.shared_workspace_versions for select to authenticated using(public.shared_access(collection_id));
create policy shared_workspace_asset_read on public.shared_workspace_assets for select to authenticated using(public.shared_access(collection_id));

create function public.shared_workspace_read(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; workspace public.shared_workspaces; collection public.shared_collections;
begin
 if not public.shared_access(p_id) then raise exception 'ACCESS_DENIED' using errcode='42501'; end if;
 select * into collection from public.shared_collections where id=p_id;
 select * into workspace from public.shared_workspaces where collection_id=p_id;
 return jsonb_build_object('state',workspace.state,'revision',coalesce(workspace.revision,0), 'collection',to_jsonb(collection),
 'legacy',case when workspace.state is null then jsonb_build_object(
   'collection',to_jsonb(collection),
   'nodes',(select coalesce(jsonb_agg(n order by n.id),'[]') from public.shared_nodes n where collection_id=p_id),
   'assets',(select coalesce(jsonb_agg(x order by x.id),'[]') from(select a.id,a.node_id,a.filename,a.mime,octet_length(a.content) size,encode(sha256(a.content),'hex') hash,a.created_at from public.shared_assets a join public.shared_nodes n on n.id=a.node_id where n.collection_id=p_id)x),
   'versions',(select coalesce(jsonb_agg(x order by x.node_id,x.revision),'[]') from(select v.* from public.shared_versions v join public.shared_nodes n on n.id=v.node_id where n.collection_id=p_id order by v.created_at desc limit 2000)x)
 ) else null end,'role' ,case when collection.owner_id=auth.uid() then 'owner' when public.shared_access(p_id,true) then 'editor' else 'viewer' end);
end $$;
revoke all on function public.shared_workspace_read(uuid) from public,anon;
grant execute on function public.shared_workspace_read(uuid) to authenticated;

-- Only the authenticated server may commit a decoded, validated CRDT document.
-- Recheck access inside the same lock/transaction as the commit to handle revocation.
create function public.shared_workspace_commit(p_id uuid,p_actor uuid,p_revision bigint,p_state text,p_snapshot jsonb) returns bigint language plpgsql security definer set search_path='' as $$
declare actual bigint; next_revision bigint;
begin
 perform set_config('request.jwt.claim.sub',p_actor::text,true);
 perform 1 from public.shared_collections where id=p_id for update;
 if not public.shared_access(p_id,true) then raise exception 'ACCESS_DENIED' using errcode='42501'; end if;
 select revision into actual from public.shared_workspaces where collection_id=p_id;
 if coalesce(actual,0)<>p_revision then raise exception 'REVISION_CONFLICT' using errcode='40001'; end if;
 if length(p_state)>28000000 or octet_length(p_snapshot::text)>20000000 then raise exception 'COLLECTION_STORAGE_LIMIT'; end if;
 next_revision:=coalesce(actual,0)+1;
 -- Retain periodic recoverable snapshots without creating history on each keystroke.
 if actual is not null and not exists(select 1 from public.shared_workspace_versions where collection_id=p_id and created_at>now()-interval '30 seconds') then
   insert into public.shared_workspace_versions(collection_id,revision,snapshot,author_id)
   select collection_id,revision,snapshot,p_actor from public.shared_workspaces where collection_id=p_id on conflict do nothing;
 end if;
 delete from public.shared_workspace_versions where collection_id=p_id and revision not in(select revision from public.shared_workspace_versions where collection_id=p_id order by revision desc limit 100);
 insert into public.shared_workspaces(collection_id,state,snapshot,revision) values(p_id,p_state,p_snapshot,next_revision)
 on conflict(collection_id) do update set state=excluded.state,snapshot=excluded.snapshot,revision=excluded.revision,updated_at=now();
 update public.shared_collections set revision=revision+1 where id=p_id;
 return next_revision;
end $$;
revoke all on function public.shared_workspace_commit(uuid,uuid,bigint,text,jsonb) from public,anon,authenticated;
grant execute on function public.shared_workspace_commit(uuid,uuid,bigint,text,jsonb) to service_role;

-- Prevent older editors from making invisible edits once this collection uses the live workspace.
create function public.shared_legacy_write_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if exists(select 1 from public.shared_workspaces where collection_id=coalesce(new.collection_id,old.collection_id)) then
  raise exception 'Open the updated shared workspace to edit this collection.';
 end if;
 return coalesce(new,old);
end $$;
revoke all on function public.shared_legacy_write_guard() from public,anon,authenticated;
create trigger shared_legacy_write_guard before insert or update on public.shared_nodes for each row execute function public.shared_legacy_write_guard();

insert into storage.buckets(id,name,public,file_size_limit) values('shared-workspace-assets','shared-workspace-assets',false,52428800) on conflict(id) do nothing;

-- Atomically freeze one canonical seed before any client edits it. Viewers may
-- initialize existing data, but cannot supply arbitrary state directly.
create function public.shared_workspace_initialize(p_id uuid,p_actor uuid,p_legacy_revision bigint,p_state text,p_snapshot jsonb) returns boolean language plpgsql security definer set search_path='' as $$
declare actual bigint;
begin
 perform set_config('request.jwt.claim.sub',p_actor::text,true);
 select revision into actual from public.shared_collections where id=p_id for update;
 if not public.shared_access(p_id) then raise exception 'ACCESS_DENIED' using errcode='42501'; end if;
 if exists(select 1 from public.shared_workspaces where collection_id=p_id) then return false; end if;
 if actual<>p_legacy_revision then return false; end if;
 insert into public.shared_workspaces(collection_id,state,snapshot,revision) values(p_id,p_state,p_snapshot,1);
 return true;
end $$;
revoke all on function public.shared_workspace_initialize(uuid,uuid,bigint,text,jsonb) from public,anon,authenticated;
grant execute on function public.shared_workspace_initialize(uuid,uuid,bigint,text,jsonb) to service_role;

create function public.shared_workspace_history(p_id uuid,p_note uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not public.shared_access(p_id) then raise exception 'ACCESS_DENIED' using errcode='42501'; end if;
 return (select coalesce(jsonb_agg(x order by x.revision desc),'[]') from(
  select v.revision,n->>'title' title,n->>'body' body,v.created_at at,'Shared checkpoint' reason
  from public.shared_workspace_versions v cross join lateral jsonb_array_elements(v.snapshot->'notes') n
  where v.collection_id=p_id and n->>'id'=p_note::text order by v.revision desc limit 100
 )x);
end $$;
revoke all on function public.shared_workspace_history(uuid,uuid) from public,anon;
grant execute on function public.shared_workspace_history(uuid,uuid) to authenticated;

-- Reserve capacity under the collection lock before issuing a one-use upload URL.
create function public.shared_workspace_asset_reserve(p_id uuid,p_actor uuid,p_asset uuid,p_filename text,p_mime text,p_key text,p_size bigint,p_hash text) returns void language plpgsql security definer set search_path='' as $$
begin
 perform set_config('request.jwt.claim.sub',p_actor::text,true);
 perform 1 from public.shared_collections where id=p_id for update;
 if not public.shared_access(p_id,true) then raise exception 'ACCESS_DENIED' using errcode='42501'; end if;
 if (select count(*) from public.shared_workspace_assets where collection_id=p_id and created_at>now()-interval '1 hour')>=100 then raise exception 'UPLOAD_RATE_LIMIT'; end if;
 if (select coalesce(sum(size),0) from public.shared_workspace_assets where collection_id=p_id)+p_size>262144000 then raise exception 'COLLECTION_STORAGE_LIMIT'; end if;
 insert into public.shared_workspace_assets(id,collection_id,filename,mime,key,size,hash) values(p_asset,p_id,p_filename,p_mime,p_key,p_size,p_hash);
end $$;
revoke all on function public.shared_workspace_asset_reserve(uuid,uuid,uuid,text,text,text,bigint,text) from public,anon,authenticated;
grant execute on function public.shared_workspace_asset_reserve(uuid,uuid,uuid,text,text,text,bigint,text) to service_role;
