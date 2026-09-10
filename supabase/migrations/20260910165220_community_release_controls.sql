-- Deployment controls live in Postgres so direct RPC clients respect a rollback.
create table public.community_release (
 singleton boolean primary key default true check(singleton),
 enabled boolean not null default true,
 features text[] not null default array['profiles','discover','shared','messages','moderation']
);
insert into public.community_release(singleton) values(true);
alter table public.community_release enable row level security;
revoke all on public.community_release from public,anon,authenticated;
grant select,update on public.community_release to service_role;
create function public.community_feature(feature text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.community_release where enabled and feature=any(features))
$$;
revoke all on function public.community_feature(text) from public,anon,authenticated;

alter function public.community_command(text,jsonb,uuid) rename to community_command_core;
alter function public.community_query(text,uuid,jsonb) rename to community_query_core;
alter function public.community_visible(uuid) rename to community_visible_core;
alter function public.community_post_visible(uuid) rename to community_post_visible_core;
alter function public.shared_access(uuid,boolean) rename to shared_access_core;
alter function public.community_participant(uuid) rename to community_participant_core;
revoke all on function public.community_command_core(text,jsonb,uuid),public.community_query_core(text,uuid,jsonb),public.community_visible_core(uuid),public.community_post_visible_core(uuid),public.shared_access_core(uuid,boolean),public.community_participant_core(uuid) from public,anon,authenticated,service_role;

create function public.community_visible(a uuid) returns boolean language sql stable security definer set search_path='' as $$select public.community_feature('profiles') and public.community_visible_core(a)$$;
create function public.community_post_visible(a uuid) returns boolean language sql stable security definer set search_path='' as $$select public.community_feature('discover') and public.community_post_visible_core(a)$$;
create function public.shared_access(a uuid,writing boolean default false) returns boolean language sql stable security definer set search_path='' as $$select public.community_feature('shared') and public.shared_access_core(a,writing)$$;
create function public.community_participant(a uuid) returns boolean language sql stable security definer set search_path='' as $$select public.community_feature('messages') and public.community_participant_core(a)$$;

create function public.community_command(p_action text,p_data jsonb,p_request uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare feature text;
begin
 feature:=case when p_action in('request','conversation','message','read') then 'messages'
 when p_action in('collection','invite','invitation','member','leave','node-create','node-save','node-delete','node-restore','asset','asset-delete') then 'shared'
 when p_action in('post','post-edit','post-delete','comment','comment-edit','comment-delete','save','download','topic') then 'discover'
 when p_action='moderate' then 'moderation' else 'profiles' end;
 if not public.community_feature(feature) then raise exception 'COMMUNITY_UNAVAILABLE' using errcode='42501'; end if;
 return public.community_command_core(p_action,p_data,p_request);
end $$;
create function public.community_query(p_kind text,p_id uuid default null,p_filter jsonb default '{}') returns jsonb language plpgsql stable security definer set search_path='' as $$
declare feature text;
begin
 feature:=case when p_kind in('conversations','messages') then 'messages'
 when p_kind in('shared','collection','versions') then 'shared'
 when p_kind in('feed','comments') then 'discover'
 when p_kind='reports' then 'moderation' else 'profiles' end;
 if not public.community_feature(feature) then raise exception 'COMMUNITY_UNAVAILABLE' using errcode='42501'; end if;
 return public.community_query_core(p_kind,p_id,p_filter);
end $$;
revoke all on function public.community_visible(uuid),public.community_post_visible(uuid),public.shared_access(uuid,boolean),public.community_participant(uuid),public.community_command(text,jsonb,uuid),public.community_query(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.community_visible(uuid),public.community_post_visible(uuid),public.community_query(text,uuid,jsonb) to anon,authenticated;
grant execute on function public.shared_access(uuid,boolean),public.community_participant(uuid),public.community_command(text,jsonb,uuid) to authenticated;

-- Policies retain function OIDs after RENAME, so explicitly rebind them to the
-- guarded entry points. Never leave a policy pointing at a private core helper.
alter policy community_profiles_read on public.community_profiles using(public.community_visible(id));
alter policy community_posts_read on public.community_posts using(public.community_post_visible(id));
alter policy community_comments_read on public.community_comments using(not hidden and public.community_post_visible(post_id) and not public.community_blocked(owner_id,auth.uid()));
alter policy community_conversations_read on public.community_conversations using(public.community_participant(id));
alter policy community_messages_read on public.community_messages using(public.community_participant(conversation_id));
alter policy shared_collections_read on public.shared_collections using(public.shared_access(id));
alter policy shared_members_read on public.shared_members using(public.shared_access(collection_id));
alter policy shared_nodes_read on public.shared_nodes using(public.shared_access(collection_id));
alter policy shared_versions_read on public.shared_versions using(exists(select 1 from public.shared_nodes n where n.id=node_id and public.shared_access(n.collection_id)));
alter policy shared_assets_read on public.shared_assets using(exists(select 1 from public.shared_nodes n where n.id=node_id and not n.deleted and public.shared_access(n.collection_id)));
alter policy community_audit_read on public.community_audit using(public.community_moderator() or public.shared_access(collection_id));
