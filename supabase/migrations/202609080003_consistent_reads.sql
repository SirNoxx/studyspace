-- One database statement observes one MVCC snapshot and has no REST row cap.
create function public.read_workspace(p_owner uuid) returns jsonb
language sql stable security definer set search_path=public as $$
 select w.state || jsonb_build_object(
  'revision',w.revision,
  'containers',coalesce((select jsonb_agg(c.data order by c.id) from containers c where c.owner_id=p_owner),'[]'),
  'notes',coalesce((select jsonb_agg(n.data order by n.id) from notes n where n.owner_id=p_owner),'[]'),
  'records',coalesce((select jsonb_agg(jsonb_build_object('kind',r.kind,'data',r.data)) from personal_records r where r.owner_id=p_owner),'[]'),
  'publications',coalesce((select jsonb_agg(jsonb_build_object(
   'id',p.id,'containerId',p.container_id,'status',p.status,
   'current',(select v.payload from publication_versions v where v.id=p.current_version),
   'versions',coalesce((select jsonb_agg(v.payload order by v.version) from publication_versions v where v.publication_id=p.id),'[]')
  )) from publications p where p.owner_id=p_owner),'[]')
 ) from workspaces w where w.owner_id=p_owner
$$;
revoke all on function public.read_workspace(uuid) from public,anon,authenticated;
grant execute on function public.read_workspace(uuid) to service_role;
