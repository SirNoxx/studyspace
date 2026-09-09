create function public.search_workspace(p_owner uuid,p_query text,p_container uuid,p_tags text[],p_kind text,p_after text) returns setof jsonb language sql stable security definer set search_path=public as $$
 with recursive scope(id) as(select id from containers where owner_id=p_owner and id=p_container union select c.id from containers c join scope s on c.parent_id=s.id where c.owner_id=p_owner)
 select n.data-'history'||jsonb_build_object('body',left(n.body,300),'history','[]'::jsonb)
 from notes n where n.owner_id=p_owner and not coalesce((n.data->>'trashed')::boolean,false)
 and (p_container is null or n.container_id in(select id from scope))
 and (p_query='' or n.search@@websearch_to_tsquery('english',p_query))
 and (p_kind is null or n.data->>'kind'=p_kind)
 and (p_after is null or n.data->>'createdAt'>=p_after)
 and coalesce(n.data->'tags','[]') @> to_jsonb(coalesce(p_tags,array[]::text[]))
 order by ts_rank(n.search,websearch_to_tsquery('english',p_query)) desc,n.id limit 100
$$;
revoke all on function public.search_workspace(uuid,text,uuid,text[],text,text) from public,anon,authenticated;
grant execute on function public.search_workspace(uuid,text,uuid,text[],text,text) to service_role;
