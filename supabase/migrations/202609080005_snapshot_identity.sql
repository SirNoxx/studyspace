alter table public.publication_versions add constraint version_publication_identity unique(id,publication_id);
alter table public.publications add constraint current_version_publication_fk foreign key(current_version,id) references public.publication_versions(id,publication_id) deferrable initially deferred;
create or replace function public.publish_snapshot(p_owner uuid,p_id uuid,p_container uuid,p_snapshot jsonb,p_expected bigint) returns void language plpgsql security definer set search_path=public as $$
declare v_revision bigint;v_existing publication_versions;begin
 select revision into v_revision from workspaces where owner_id=p_owner for update;
 if v_revision is null or v_revision<>p_expected then raise exception 'REVISION_CONFLICT' using errcode='40001';end if;
 if exists(select 1 from publications where id=p_id and owner_id<>p_owner) then raise exception 'OWNERSHIP';end if;
 if (p_snapshot->>'publicationId')::uuid<>p_id then raise exception 'INVALID_SNAPSHOT';end if;
 select * into v_existing from publication_versions where id=(p_snapshot->>'id')::uuid;
 if found then
  if v_existing.publication_id<>p_id or v_existing.payload<>p_snapshot then raise exception 'IMMUTABLE_VERSION';end if;
  return;
 end if;
 if (p_snapshot->>'version')::int<>(select coalesce(max(version),0)+1 from publication_versions where publication_id=p_id) then raise exception 'VERSION_CONFLICT' using errcode='40001';end if;
 insert into publications(id,owner_id,container_id) values(p_id,p_owner,p_container) on conflict(id) do nothing;
 insert into publication_versions(id,publication_id,version,payload) values((p_snapshot->>'id')::uuid,p_id,(p_snapshot->>'version')::int,p_snapshot);
 update publications set current_version=(p_snapshot->>'id')::uuid,status='published' where id=p_id and owner_id=p_owner;
end$$;
