create or replace function public.community_query(p_kind text,p_id uuid default null,p_filter jsonb default '{}') returns jsonb language plpgsql stable security definer set search_path='' as $$
declare feature text; result jsonb; saved_count bigint;
begin
 feature:=case when p_kind in('conversations','messages') then 'messages'
 when p_kind in('shared','collection','versions') then 'shared'
 when p_kind in('feed','comments') then 'discover'
 when p_kind='reports' then 'moderation' else 'profiles' end;
 if not public.community_feature(feature) then raise exception 'COMMUNITY_UNAVAILABLE' using errcode='42501'; end if;
 result:=public.community_query_core(p_kind,p_id,p_filter);
 if p_kind='profile' and (result->>'mine')::boolean then
  select count(*) into saved_count from (
   select p.publication_id::text id from public.community_saves s join public.community_posts p on p.id=s.post_id where s.owner_id=auth.uid() and p.publication_id is not null
   union select data->>'publicationId' from public.personal_records where owner_id=auth.uid() and kind='copies' and data->>'publicationId' is not null
  ) saved;
  result:=jsonb_set(result,'{stats,savedPublications}',to_jsonb(saved_count));
 elsif p_kind='badges' then
  result:=result||jsonb_build_object('identity',(select jsonb_build_object('username',username,'avatar',avatar) from public.community_profiles where id=auth.uid()));
 end if;
 return result;
end $$;
