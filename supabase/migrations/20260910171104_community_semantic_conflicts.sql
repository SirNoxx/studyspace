-- A stale application revision is not a retryable database serialization
-- failure. PostgREST 14 retries SQLSTATE 40001 indefinitely. Return PT409 at
-- the public boundary while preserving rollback and genuine engine failures.
create or replace function public.community_command(p_action text,p_data jsonb,p_request uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare feature text;
begin
 feature:=case when p_action in('request','conversation','message','read') then 'messages'
 when p_action in('collection','invite','invitation','member','leave','node-create','node-save','node-delete','node-restore','asset','asset-delete') then 'shared'
 when p_action in('post','post-edit','post-delete','comment','comment-edit','comment-delete','save','download','topic') then 'discover'
 when p_action='moderate' then 'moderation' else 'profiles' end;
 if not public.community_feature(feature) then raise exception 'COMMUNITY_UNAVAILABLE' using errcode='42501'; end if;
 begin
  return public.community_command_core(p_action,p_data,p_request);
 exception when serialization_failure then
  if sqlerrm='REVISION_CONFLICT' then raise exception 'REVISION_CONFLICT' using errcode='PT409'; else raise; end if;
 end;
end $$;
