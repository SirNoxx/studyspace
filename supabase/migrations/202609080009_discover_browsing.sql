-- Additive discovery index. Ranking exposes aggregate counts, never copy owners/content.
create index if not exists personal_copy_publication on public.personal_records((data->>'publicationId')) where kind='copies';
create function public.discover_publications(p_query text,p_category text,p_sort text) returns setof jsonb language sql stable security definer set search_path=public as $$
 with visible as (
 select v.payload,v.created_at,p.id,(select count(*) from personal_records r where r.kind='copies' and r.data->>'publicationId'=p.id::text) popularity
 from publications p join publication_versions v on v.id=p.current_version and v.publication_id=p.id
 where p.status='published' and not p.hidden
 and (p_category='all' or coalesce(v.payload->>'category','General research')=p_category)
 and (p_query='' or concat_ws(' ',v.payload->>'title',v.payload->>'description',v.payload->>'author',v.payload->>'topics') ilike '%'||p_query||'%')
 ) select payload||jsonb_build_object('popularity',popularity) from visible
 order by case when p_sort='popular' then popularity else 0 end desc,created_at desc,id limit 100
$$;
revoke all on function public.discover_publications(text,text,text) from public,anon,authenticated;
grant execute on function public.discover_publications(text,text,text) to service_role;
