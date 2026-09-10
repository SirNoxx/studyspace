-- Community data is separate from private workspace JSON and published snapshots.
create table public.community_profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 username text not null check(username ~ '^[a-zA-Z0-9_]{3,32}$'),
 bio text not null default '' check(length(bio)<=2000),
 avatar text not null default '' check(length(avatar)<=200000),
 interests text[] not null default '{}' check(cardinality(interests)<=20),
 links jsonb not null default '[]' check(jsonb_typeof(links)='array' and jsonb_array_length(links)<=10),
 public boolean not null default false, requests boolean not null default false,
 preferences jsonb not null default '{"messages":true,"invitations":true,"comments":true,"following":true}' check(jsonb_typeof(preferences)='object'),
 updated_at timestamptz not null default now()
);
create unique index community_username on public.community_profiles(lower(username));
create table public.community_blocks (
 owner_id uuid references auth.users(id) on delete cascade, target_id uuid references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(), primary key(owner_id,target_id), check(owner_id<>target_id)
);
create index community_blocks_target on public.community_blocks(target_id);
create table public.community_follows (
 owner_id uuid references auth.users(id) on delete cascade, target_id uuid references auth.users(id) on delete cascade,
 primary key(owner_id,target_id), check(owner_id<>target_id)
);
create index community_follows_target on public.community_follows(target_id);
create table public.community_topics (
 owner_id uuid references auth.users(id) on delete cascade, topic text check(length(topic) between 1 and 60), primary key(owner_id,topic)
);
create table public.community_posts (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
 kind text not null check(kind in ('research','material','idea','study-request')),
 title text not null check(length(trim(title)) between 1 and 160), body text not null check(length(body)<=20000),
 category text not null check(length(category) between 1 and 80), tags text[] not null default '{}' check(cardinality(tags)<=10),
 publication_id uuid references public.publications(id) on delete cascade,
 hidden boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index community_posts_feed on public.community_posts(created_at desc,id desc) where not hidden;
create index community_posts_owner on public.community_posts(owner_id,created_at desc);
create index community_posts_publication on public.community_posts(publication_id);
create index community_posts_tags on public.community_posts using gin(tags);
create table public.community_comments (
 id uuid primary key default gen_random_uuid(), post_id uuid not null references public.community_posts(id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade, body text not null check(length(trim(body)) between 1 and 4000),
 hidden boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index community_comments_post on public.community_comments(post_id,created_at desc,id desc);
create index community_comments_owner on public.community_comments(owner_id);
create table public.community_saves (
 owner_id uuid references auth.users(id) on delete cascade, post_id uuid references public.community_posts(id) on delete cascade,
 created_at timestamptz not null default now(), primary key(owner_id,post_id)
);
create index community_saves_post on public.community_saves(post_id);
create table public.community_downloads (
 owner_id uuid references auth.users(id) on delete cascade, publication_id uuid references public.publications(id) on delete cascade,
 created_at timestamptz not null default now(), primary key(owner_id,publication_id)
);
create index community_downloads_publication on public.community_downloads(publication_id);
create table public.community_conversations (
 id uuid primary key default gen_random_uuid(), requester uuid not null references auth.users(id) on delete cascade,
 recipient uuid not null references auth.users(id) on delete cascade,
 status text not null default 'pending' check(status in ('pending','accepted','declined','ignored')),
 requester_read bigint not null default 0, recipient_read bigint not null default 0,
 created_at timestamptz not null default now(), check(requester<>recipient)
);
create unique index community_conversation_pair on public.community_conversations(least(requester,recipient),greatest(requester,recipient));
create index community_conversations_recipient on public.community_conversations(recipient,created_at desc);
create index community_conversations_requester on public.community_conversations(requester,created_at desc);
create table public.community_messages (
 id uuid primary key, sequence bigint generated always as identity unique,
 conversation_id uuid not null references public.community_conversations(id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade, body text not null check(length(trim(body)) between 1 and 8000),
 created_at timestamptz not null default now()
);
create index community_messages_conversation on public.community_messages(conversation_id,sequence desc);
create index community_messages_owner on public.community_messages(owner_id);
create table public.shared_collections (
 id uuid primary key, owner_id uuid not null references auth.users(id) on delete cascade,
 title text not null check(length(trim(title)) between 1 and 160), revision bigint not null default 1, created_at timestamptz not null default now()
);
create index shared_collections_owner on public.shared_collections(owner_id);
create table public.shared_members (
 collection_id uuid references public.shared_collections(id) on delete cascade,
 user_id uuid references auth.users(id) on delete cascade, role text not null check(role in ('editor','viewer')),
 primary key(collection_id,user_id)
);
create index shared_members_user on public.shared_members(user_id);
create table public.shared_invites (
 id uuid primary key, collection_id uuid not null references public.shared_collections(id) on delete cascade,
 sender_id uuid not null references auth.users(id) on delete cascade, recipient_id uuid not null references auth.users(id) on delete cascade,
 role text not null check(role in ('owner','editor','viewer')), status text not null default 'pending' check(status in ('pending','accepted','declined','revoked')),
 created_at timestamptz not null default now()
);
create unique index shared_invites_pending on public.shared_invites(collection_id,recipient_id) where status='pending';
create index shared_invites_recipient on public.shared_invites(recipient_id,status);
create index shared_invites_sender on public.shared_invites(sender_id);
create table public.shared_nodes (
 id uuid primary key, collection_id uuid not null references public.shared_collections(id) on delete cascade,
 parent_id uuid, kind text not null check(kind in ('folder','note')), title text not null check(length(trim(title)) between 1 and 240),
 body text not null default '' check(length(body)<=1000000), revision bigint not null default 1,
 deleted boolean not null default false, updated_at timestamptz not null default now(),
 unique(collection_id,id), foreign key(collection_id,parent_id) references public.shared_nodes(collection_id,id) deferrable initially deferred
);
create index shared_nodes_parent on public.shared_nodes(collection_id,parent_id);
create table public.shared_versions (
 node_id uuid references public.shared_nodes(id) on delete cascade, revision bigint,
 author_id uuid references auth.users(id) on delete set null, snapshot jsonb not null, created_at timestamptz not null default now(), primary key(node_id,revision)
);
create index shared_versions_author on public.shared_versions(author_id);
create table public.shared_assets (
 id uuid primary key, node_id uuid not null references public.shared_nodes(id) on delete cascade,
 owner_id uuid references auth.users(id) on delete set null,
 filename text not null check(length(filename) between 1 and 240), mime text not null check(mime in ('application/pdf','image/png','image/jpeg','image/webp','text/plain','text/markdown')),
 content bytea not null check(octet_length(content)<=5242880), created_at timestamptz not null default now()
);
create index shared_assets_node on public.shared_assets(node_id);
create index shared_assets_owner on public.shared_assets(owner_id);
create table public.community_reports (
 id uuid primary key, owner_id uuid references auth.users(id) on delete set null,
 kind text not null check(kind in ('profile','post','comment','conversation')), target_id uuid not null,
 reason text not null check(length(trim(reason)) between 1 and 2000), evidence jsonb not null,
 status text not null default 'open' check(status in ('open','resolved','dismissed')), created_at timestamptz not null default now()
);
create index community_reports_queue on public.community_reports(status,created_at);
create index community_reports_owner on public.community_reports(owner_id);
create table public.community_audit (
 id bigint generated always as identity primary key, actor_id uuid references auth.users(id) on delete set null,
 collection_id uuid references public.shared_collections(id) on delete cascade,
 action text not null, target_id uuid, created_at timestamptz not null default now()
);
create index community_audit_collection on public.community_audit(collection_id,id desc);
create index community_audit_actor on public.community_audit(actor_id);
create table public.community_mutations (
 actor_id uuid references auth.users(id) on delete cascade, request_id uuid, fingerprint text not null, result jsonb not null,
 created_at timestamptz not null default now(), primary key(actor_id,request_id)
);

create function public.community_live() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.users u where u.id=auth.uid()) and not exists(select 1 from public.profiles p where p.id=auth.uid() and p.suspended)
$$;
create function public.community_blocked(a uuid,b uuid) returns boolean language sql stable security definer set search_path='' as $$
 select case when auth.uid() is null then false when auth.uid() not in(a,b) then true else exists(select 1 from public.community_blocks where (owner_id=a and target_id=b) or (owner_id=b and target_id=a)) end
$$;
create function public.community_visible(a uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.community_profiles p where p.id=a and (p.public or (a=auth.uid() and public.community_live())))
 and not exists(select 1 from public.profiles where id=a and suspended)
 and (auth.uid() is null or (public.community_live() and not public.community_blocked(a,auth.uid())))
$$;
create function public.community_post_visible(a uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.community_posts p where p.id=a and not p.hidden and public.community_visible(p.owner_id)
 and (p.publication_id is null or exists(select 1 from public.publications v where v.id=p.publication_id and v.status='published' and not v.hidden)))
$$;
create function public.shared_access(a uuid,writing boolean default false) returns boolean language sql stable security definer set search_path='' as $$
 select public.community_live() and exists(select 1 from public.shared_collections c where c.id=a and
 (c.owner_id=auth.uid() or (not public.community_blocked(c.owner_id,auth.uid()) and exists(select 1 from public.shared_members m where m.collection_id=c.id and m.user_id=auth.uid() and (not writing or m.role='editor')))))
$$;
create function public.community_participant(a uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.community_live() and exists(select 1 from public.community_conversations c where c.id=a and auth.uid() in(c.requester,c.recipient))
$$;
create function public.community_moderator() returns boolean language sql stable security definer set search_path='' as $$
 select public.community_live() and exists(select 1 from public.profiles where id=auth.uid() and moderator)
$$;

-- All writes use checked transactional commands; browsers never get direct DML.
do $$ declare t text; begin
 foreach t in array array['community_profiles','community_blocks','community_follows','community_topics','community_posts','community_comments','community_saves','community_downloads','community_conversations','community_messages','shared_collections','shared_members','shared_invites','shared_nodes','shared_versions','shared_assets','community_reports','community_audit','community_mutations'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 end loop;
end $$;
grant select(id,username,bio,avatar,interests,links,public,updated_at) on public.community_profiles to anon;
grant select on public.community_posts,public.community_comments to anon;
create policy community_profiles_read on public.community_profiles for select using(public.community_visible(id));
-- Preferences and request acceptance are exposed only through the owner query.
revoke select on public.community_profiles from authenticated;
grant select(id,username,bio,avatar,interests,links,public,updated_at) on public.community_profiles to authenticated;
create policy community_blocks_read on public.community_blocks for select using(owner_id=auth.uid() and public.community_live());
create policy community_follows_read on public.community_follows for select using(owner_id=auth.uid() and public.community_live());
create policy community_topics_read on public.community_topics for select using(owner_id=auth.uid() and public.community_live());
create policy community_posts_read on public.community_posts for select using(public.community_post_visible(id) or (owner_id=auth.uid() and public.community_live()));
create policy community_comments_read on public.community_comments for select using(not hidden and public.community_post_visible(post_id) and not public.community_blocked(owner_id,auth.uid()));
create policy community_saves_read on public.community_saves for select using(owner_id=auth.uid() and public.community_live());
create policy community_downloads_read on public.community_downloads for select using(owner_id=auth.uid() and public.community_live());
create policy community_conversations_read on public.community_conversations for select using(public.community_participant(id));
create policy community_messages_read on public.community_messages for select using(public.community_participant(conversation_id));
create policy shared_collections_read on public.shared_collections for select using(public.shared_access(id));
create policy shared_members_read on public.shared_members for select using(public.shared_access(collection_id));
create policy shared_invites_read on public.shared_invites for select using(public.community_live() and (recipient_id=auth.uid() or exists(select 1 from public.shared_collections where id=collection_id and owner_id=auth.uid())));
create policy shared_nodes_read on public.shared_nodes for select using(public.shared_access(collection_id));
create policy shared_versions_read on public.shared_versions for select using(exists(select 1 from public.shared_nodes n where n.id=node_id and public.shared_access(n.collection_id)));
create policy shared_assets_read on public.shared_assets for select using(exists(select 1 from public.shared_nodes n where n.id=node_id and not n.deleted and public.shared_access(n.collection_id)));
create policy community_reports_read on public.community_reports for select using(public.community_moderator() or (owner_id=auth.uid() and public.community_live()));
create policy community_audit_read on public.community_audit for select using(public.community_moderator() or public.shared_access(collection_id));
create policy community_mutations_read on public.community_mutations for select using(actor_id=auth.uid() and public.community_live());

create function public.community_notify(recipient uuid,category text,event_id uuid,heading text,link text) returns void
language plpgsql security definer set search_path='' as $$ begin
 if recipient is null or recipient=auth.uid() then return; end if;
 if exists(select 1 from public.community_profiles where id=recipient and coalesce(preferences->>category,'true')='false') then return; end if;
 if public.community_blocked(auth.uid(),recipient) then return; end if;
 insert into public.notifications(owner_id,event_key,title,body,href) values(recipient,'community:'||category||':'||event_id::text,heading,'Open Studyspace to see the details.',link) on conflict(owner_id,event_key) do nothing;
end $$;
revoke all on function public.community_notify(uuid,text,uuid,text,text) from public,anon,authenticated;

create function public.community_command(p_action text,p_data jsonb,p_request uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare a uuid:=auth.uid(); target uuid; cid uuid; nid uuid; found_id uuid; fp text; result jsonb:='{}'; previous public.community_mutations;
 c public.shared_collections; n public.shared_nodes; inv public.shared_invites; conv public.community_conversations; profile public.community_profiles;
 post public.community_posts; comment public.community_comments; report public.community_reports; parent public.shared_nodes;
 r text; v bigint; item jsonb; count_items int:=0;
begin
 if not public.community_live() then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
 if p_request is null or p_data is null or jsonb_typeof(p_data)<>'object' then raise exception 'INVALID_INPUT'; end if;
 if octet_length(p_data::text)>7500000 then raise exception 'INPUT_TOO_LARGE'; end if;
 perform pg_advisory_xact_lock(hashtextextended(a::text||p_request::text,0));
 fp:=md5(p_action||p_data::text);
 select * into previous from public.community_mutations where actor_id=a and request_id=p_request;
 if found then if previous.fingerprint<>fp then raise exception 'IDEMPOTENCY_MISMATCH'; end if; return previous.result; end if;
 if not public.consume_quota(a,'social:'||p_action,case when p_action='read' then 10000 when p_action='request' then 5 when p_action='post' then 20 when p_action='invite' then 20 when p_action='message' then 200 when p_action like 'node%' then 1000 else 100 end) then raise exception 'RATE_LIMIT' using errcode='P0001'; end if;
 target:=nullif(p_data->>'target','')::uuid; cid:=nullif(p_data->>'collection','')::uuid; nid:=nullif(p_data->>'id','')::uuid;
 if target is not null then perform pg_advisory_xact_lock(hashtextextended(least(a,target)::text||greatest(a,target)::text,1)); end if;
 if cid is not null then select * into c from public.shared_collections where id=cid for update; if not found or not public.shared_access(cid) then raise exception 'ACCESS_DENIED' using errcode='42501'; end if; end if;
 case p_action
 when 'profile' then
  if length(p_data->>'username') not between 3 and 32 or (p_data->>'username')!~'^[a-zA-Z0-9_]+$' then raise exception 'INVALID_USERNAME'; end if;
  if (p_data->>'avatar')<>'' and (p_data->>'avatar')!~'^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$' then raise exception 'INVALID_AVATAR'; end if;
  for item in select * from jsonb_array_elements(coalesce(p_data->'links','[]')) loop
   if item->>'label' is null or item->>'url' is null or length(item->>'label') not between 1 and 60 or length(item->>'url')>500 or (item->>'url')!~'^https://[^/[:space:]]+' then raise exception 'INVALID_LINK'; end if;
  end loop;
  if exists(select 1 from jsonb_array_elements_text(coalesce(p_data->'interests','[]')) s where length(s) not between 1 and 60) then raise exception 'INVALID_INTERESTS'; end if;
  if exists(select 1 from jsonb_each(coalesce(p_data->'preferences','{}')) x where x.key not in('messages','invitations','comments','following') or jsonb_typeof(x.value)<>'boolean') then raise exception 'INVALID_PREFERENCES'; end if;
  insert into public.community_profiles(id,username,bio,avatar,interests,links,public,requests,preferences)
  values(a,p_data->>'username',coalesce(p_data->>'bio',''),coalesce(p_data->>'avatar',''),array(select jsonb_array_elements_text(coalesce(p_data->'interests','[]'))),coalesce(p_data->'links','[]'),coalesce((p_data->>'public')::boolean,false),coalesce((p_data->>'requests')::boolean,false),coalesce(p_data->'preferences','{}'))
  on conflict(id) do update set username=excluded.username,bio=excluded.bio,avatar=excluded.avatar,interests=excluded.interests,links=excluded.links,public=excluded.public,requests=excluded.requests,preferences=excluded.preferences,updated_at=now();
 when 'block' then
  if target=a then raise exception 'INVALID_TARGET'; end if;
  if coalesce((p_data->>'enabled')::boolean,true) then
   insert into public.community_blocks values(a,target,now()) on conflict do nothing;
   delete from public.community_follows where (owner_id=a and target_id=target) or (owner_id=target and target_id=a);
  else delete from public.community_blocks where owner_id=a and target_id=target; end if;
 when 'follow' then
  if not public.community_visible(target) or target=a then raise exception 'ACCESS_DENIED' using errcode='42501'; end if;
  if coalesce((p_data->>'enabled')::boolean,true) then insert into public.community_follows values(a,target) on conflict do nothing;
  else delete from public.community_follows where owner_id=a and target_id=target; end if;
  if coalesce((p_data->>'enabled')::boolean,true) then perform public.community_notify(target,'following',a,'Someone followed your profile','/w/profile'); end if;
 when 'topic' then
  if coalesce((p_data->>'enabled')::boolean,true) then insert into public.community_topics values(a,lower(trim(p_data->>'topic'))) on conflict do nothing;
  else delete from public.community_topics where owner_id=a and topic=lower(trim(p_data->>'topic')); end if;
 when 'post' then
  if exists(select 1 from jsonb_array_elements_text(coalesce(p_data->'tags','[]')) s where length(trim(s)) not between 1 and 60) then raise exception 'INVALID_TAGS'; end if;
  if not exists(select 1 from public.community_profiles where id=a and public) then raise exception 'PUBLIC_PROFILE_REQUIRED'; end if;
  if p_data->>'publication' is not null and not exists(select 1 from public.publications where id=(p_data->>'publication')::uuid and owner_id=a and status='published' and not hidden) then raise exception 'PUBLICATION_UNAVAILABLE'; end if;
  insert into public.community_posts(id,owner_id,kind,title,body,category,tags,publication_id) values(p_request,a,p_data->>'kind',p_data->>'title',coalesce(p_data->>'body',''),p_data->>'category',array(select lower(trim(jsonb_array_elements_text(coalesce(p_data->'tags','[]'))))),nullif(p_data->>'publication','')::uuid);
  result:=jsonb_build_object('id',p_request);
 when 'post-edit' then
  update public.community_posts set title=p_data->>'title',body=p_data->>'body',updated_at=now() where id=nid and owner_id=a; if not found then raise exception 'ACCESS_DENIED' using errcode='42501'; end if;
 when 'post-delete' then
  delete from public.community_posts where id=nid and owner_id=a; if not found then raise exception 'ACCESS_DENIED' using errcode='42501'; end if;
 when 'comment' then
  if not public.community_post_visible(nid) then raise exception 'ACCESS_DENIED' using errcode='42501'; end if;
  insert into public.community_comments(id,post_id,owner_id,body) values(p_request,nid,a,p_data->>'body');
  perform public.community_notify((select owner_id from public.community_posts where id=nid),'comments',p_request,'A new comment on your post','/w/discover');
 when 'comment-edit' then
  update public.community_comments set body=p_data->>'body',updated_at=now() where id=nid and owner_id=a and public.community_post_visible(post_id); if not found then raise exception 'ACCESS_DENIED' using errcode='42501'; end if;
 when 'comment-delete' then
  delete from public.community_comments where id=nid and owner_id=a; if not found then raise exception 'ACCESS_DENIED' using errcode='42501'; end if;
 when 'save' then
  if not public.community_post_visible(nid) then raise exception 'ACCESS_DENIED' using errcode='42501'; end if;
  if coalesce((p_data->>'enabled')::boolean,true) then insert into public.community_saves values(a,nid,now()) on conflict do nothing;
  else delete from public.community_saves where owner_id=a and post_id=nid; end if;
 when 'download' then
  if not exists(select 1 from public.publications p join public.publication_versions v on v.id=p.current_version where p.id=nid and p.status='published' and not p.hidden and (v.payload->>'allowDownload')::boolean) then raise exception 'ACCESS_DENIED' using errcode='42501'; end if;
  insert into public.community_downloads values(a,nid,now()) on conflict do nothing;
 when 'request' then
  if target=a or not public.community_visible(target) or not exists(select 1 from public.community_profiles where id=target and public and requests) then raise exception 'REQUESTS_DISABLED' using errcode='42501'; end if;
  select id into found_id from public.community_conversations where least(requester,recipient)=least(a,target) and greatest(requester,recipient)=greatest(a,target);
  if found then raise exception 'CONVERSATION_EXISTS'; end if;
  insert into public.community_conversations(id,requester,recipient) values(p_request,a,target);
  insert into public.community_messages(id,conversation_id,owner_id,body) values(p_request,p_request,a,p_data->>'body');
  perform public.community_notify(target,'messages',p_request,'New conversation request','/w/messages');
  result:=jsonb_build_object('id',p_request);
 when 'conversation' then
  select * into conv from public.community_conversations where id=nid for update;
  if conv.recipient is distinct from a or p_data->>'status' not in ('accepted','declined','ignored') then raise exception 'ACCESS_DENIED' using errcode='42501'; end if;
  if public.community_blocked(a,conv.requester) then raise exception 'BLOCKED' using errcode='42501'; end if;
  update public.community_conversations set status=p_data->>'status' where id=nid;
 when 'message' then
  select * into conv from public.community_conversations where id=nid;
  if not public.community_participant(nid) then raise exception 'ACCESS_DENIED' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(least(conv.requester,conv.recipient)::text||greatest(conv.requester,conv.recipient)::text,1));
  select * into conv from public.community_conversations where id=nid for update;
  if conv.status<>'accepted' or public.community_blocked(conv.requester,conv.recipient) then raise exception 'CONVERSATION_NOT_ACCEPTED' using errcode='42501'; end if;
  insert into public.community_messages(id,conversation_id,owner_id,body) values(p_request,nid,a,p_data->>'body');
  perform public.community_notify(case when conv.requester=a then conv.recipient else conv.requester end,'messages',p_request,'New private message','/w/messages');
  result:=jsonb_build_object('id',p_request);
 when 'read' then
  if not public.community_participant(nid) then raise exception 'ACCESS_DENIED' using errcode='42501'; end if;
  select coalesce(max(sequence),0) into v from public.community_messages where conversation_id=nid and sequence<=coalesce((p_data->>'sequence')::bigint,0);
  update public.community_conversations set requester_read=case when requester=a then greatest(requester_read,v) else requester_read end,recipient_read=case when recipient=a then greatest(recipient_read,v) else recipient_read end where id=nid;
 when 'collection' then
  insert into public.shared_collections(id,owner_id,title) values(p_request,a,p_data->>'title');
  -- Optional explicit copy: limited notes/folders only, no private attachments or metadata.
  for item in select * from jsonb_array_elements(coalesce(p_data->'nodes','[]')) loop
   count_items:=count_items+1; if count_items>200 then raise exception 'COLLECTION_IMPORT_LIMIT'; end if;
   insert into public.shared_nodes(id,collection_id,parent_id,kind,title,body) values((item->>'id')::uuid,p_request,nullif(item->>'parent_id','')::uuid,item->>'kind',item->>'title',coalesce(item->>'body',''));
  end loop;
  if exists(select 1 from public.shared_nodes x join public.shared_nodes y on y.id=x.parent_id where x.collection_id=p_request and y.kind<>'folder') then raise exception 'INVALID_PARENT'; end if;
  if exists(with recursive paths as(select id,parent_id,array[id] path,false cycle from public.shared_nodes where collection_id=p_request union all select p.id,n.parent_id,p.path||n.id,n.id=any(p.path) from paths p join public.shared_nodes n on n.id=p.parent_id where not p.cycle) select 1 from paths where cycle) then raise exception 'FOLDER_CYCLE'; end if;
  insert into public.shared_versions select id,revision,a,to_jsonb(shared_nodes),now() from public.shared_nodes where collection_id=p_request;
  result:=jsonb_build_object('id',p_request);
 when 'invite' then
  if c.owner_id is distinct from a or target=a or public.community_blocked(a,target) or not exists(select 1 from public.community_profiles where id=target) then raise exception 'ACCESS_DENIED' using errcode='42501'; end if;
  insert into public.shared_invites(id,collection_id,sender_id,recipient_id,role) values(p_request,cid,a,target,p_data->>'role');
  perform public.community_notify(target,'invitations',p_request,'Shared collection invitation','/w/shared');
 when 'invitation' then
  select * into inv from public.shared_invites where id=nid;
  if inv.recipient_id is distinct from a or inv.status<>'pending' then raise exception 'ACCESS_DENIED' using errcode='42501'; end if;
  select * into c from public.shared_collections where id=inv.collection_id for update;
  select * into inv from public.shared_invites where id=nid for update;
  if inv.status<>'pending' then raise exception 'INVITATION_REVOKED'; end if;
  if public.community_blocked(a,c.owner_id) or c.owner_id<>inv.sender_id then raise exception 'INVITATION_REVOKED'; end if;
  if (p_data->>'accept')::boolean then
   if inv.role='owner' then
    insert into public.shared_members values(c.id,c.owner_id,'editor') on conflict(collection_id,user_id) do update set role='editor';
    delete from public.shared_members where collection_id=c.id and user_id=a;
    update public.shared_collections set owner_id=a,revision=revision+1 where id=c.id;
    update public.shared_invites set status='revoked' where collection_id=c.id and status='pending' and id<>nid;
   else insert into public.shared_members values(c.id,a,inv.role) on conflict(collection_id,user_id) do update set role=excluded.role; end if;
  end if;
  update public.shared_invites set status=case when (p_data->>'accept')::boolean then 'accepted' else 'declined' end where id=nid;
  cid:=c.id;
 when 'member' then
  if c.owner_id is distinct from a or target=c.owner_id then raise exception 'ACCESS_DENIED' using errcode='42501'; end if;
  if p_data->>'role'='remove' then
   delete from public.shared_members where collection_id=cid and user_id=target;
   update public.shared_invites set status='revoked' where collection_id=cid and recipient_id=target and status='pending';
  else update public.shared_members set role=p_data->>'role' where collection_id=cid and user_id=target; end if;
 when 'leave' then
  if c.owner_id=a then raise exception 'TRANSFER_OWNERSHIP_FIRST'; end if;
  delete from public.shared_members where collection_id=cid and user_id=a;
 when 'node-create' then
  if not public.shared_access(cid,true) then raise exception 'ACCESS_DENIED' using errcode='42501'; end if;
  if (select count(*) from public.shared_nodes where collection_id=cid)>=2000 then raise exception 'COLLECTION_ITEM_LIMIT'; end if;
  if p_data->>'parent' is not null and not exists(select 1 from public.shared_nodes where id=(p_data->>'parent')::uuid and collection_id=cid and kind='folder' and not deleted) then raise exception 'INVALID_PARENT'; end if;
  insert into public.shared_nodes(id,collection_id,parent_id,kind,title,body) values(p_request,cid,nullif(p_data->>'parent','')::uuid,p_data->>'kind',p_data->>'title',coalesce(p_data->>'body','')) returning * into n;
  insert into public.shared_versions values(n.id,n.revision,a,to_jsonb(n),now()); result:=jsonb_build_object('id',n.id);
 when 'node-save','node-delete','node-restore' then
  if not public.shared_access(cid,true) then raise exception 'ACCESS_DENIED' using errcode='42501'; end if;
  select * into n from public.shared_nodes where id=nid and collection_id=cid for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if n.revision is distinct from (p_data->>'revision')::bigint then raise exception 'REVISION_CONFLICT' using errcode='40001'; end if;
  if p_action='node-save' then
   if p_data->>'parent' is not null then
    select * into parent from public.shared_nodes where id=(p_data->>'parent')::uuid and collection_id=cid and kind='folder' and not deleted;
    if not found then raise exception 'INVALID_PARENT'; end if;
    if exists(with recursive ancestors as(select parent.id id,parent.parent_id parent_id union all select x.id,x.parent_id from public.shared_nodes x join ancestors on x.id=ancestors.parent_id) select 1 from ancestors where id=nid) then raise exception 'FOLDER_CYCLE'; end if;
   end if;
   update public.shared_nodes set title=p_data->>'title',body=p_data->>'body',parent_id=nullif(p_data->>'parent','')::uuid,revision=revision+1,updated_at=now() where id=nid returning * into n;
  elsif p_action='node-delete' then
   if exists(select 1 from public.shared_nodes where parent_id=nid and not deleted) then raise exception 'MOVE_CHILDREN_FIRST'; end if;
   update public.shared_nodes set deleted=true,revision=revision+1,updated_at=now() where id=nid returning * into n;
  else
   select snapshot into item from public.shared_versions where node_id=nid and revision=(p_data->>'version')::bigint;
   if item is null then raise exception 'VERSION_UNAVAILABLE'; end if;
   -- Restore content into the root, avoiding stale/deleted/cyclic parents.
   update public.shared_nodes set title=item->>'title',body=item->>'body',parent_id=null,deleted=false,revision=revision+1,updated_at=now() where id=nid returning * into n;
  end if;
  insert into public.shared_versions values(n.id,n.revision,a,to_jsonb(n),now()); result:=jsonb_build_object('id',n.id,'revision',n.revision);
 when 'asset' then
  if not public.shared_access(cid,true) or not exists(select 1 from public.shared_nodes where id=nid and collection_id=cid and not deleted) then raise exception 'ACCESS_DENIED' using errcode='42501'; end if;
  if (select coalesce(sum(octet_length(s.content)),0) from public.shared_assets s join public.shared_nodes x on x.id=s.node_id where x.collection_id=cid)+octet_length(decode(p_data->>'content','base64'))>52428800 then raise exception 'COLLECTION_STORAGE_LIMIT'; end if;
  insert into public.shared_assets(id,node_id,owner_id,filename,mime,content) values(p_request,nid,a,p_data->>'filename',p_data->>'mime',decode(p_data->>'content','base64'));
 when 'asset-delete' then
  if not public.shared_access(cid,true) then raise exception 'ACCESS_DENIED' using errcode='42501'; end if;
  delete from public.shared_assets s using public.shared_nodes n where s.id=nid and n.id=s.node_id and n.collection_id=cid;
 when 'report' then
  case p_data->>'kind'
   when 'profile' then if not public.community_visible(nid) then raise exception 'ACCESS_DENIED'; end if; select jsonb_build_object('username',username,'bio',bio) into item from public.community_profiles where id=nid;
   when 'post' then if not public.community_post_visible(nid) then raise exception 'ACCESS_DENIED'; end if; select to_jsonb(p) into item from public.community_posts p where id=nid;
   when 'comment' then select * into comment from public.community_comments where id=nid; if not public.community_post_visible(comment.post_id) then raise exception 'ACCESS_DENIED'; end if; item:=to_jsonb(comment);
   when 'conversation' then if not public.community_participant(nid) then raise exception 'ACCESS_DENIED'; end if; select jsonb_agg(x) into item from(select owner_id,body,created_at from public.community_messages where conversation_id=nid order by sequence desc limit 20)x;
   else raise exception 'INVALID_REPORT'; end case;
  insert into public.community_reports(id,owner_id,kind,target_id,reason,evidence) values(p_request,a,p_data->>'kind',nid,p_data->>'reason',coalesce(item,'{}'));
 when 'moderate' then
  if not public.community_moderator() then raise exception 'ACCESS_DENIED' using errcode='42501'; end if;
  select * into report from public.community_reports where id=nid for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if p_data->>'decision'='hide' then
   if report.kind='post' then update public.community_posts set hidden=true where id=report.target_id;
   elsif report.kind='comment' then update public.community_comments set hidden=true where id=report.target_id;
   else raise exception 'INVALID_DECISION'; end if;
  elsif p_data->>'decision'='suspend' and report.kind='profile' then update public.profiles set suspended=true where id=report.target_id;
  elsif p_data->>'decision' not in ('resolve','dismiss') then raise exception 'INVALID_DECISION'; end if;
  update public.community_reports set status=case when p_data->>'decision'='dismiss' then 'dismissed' else 'resolved' end where id=nid;
 else raise exception 'UNKNOWN_ACTION';
 end case;
 if cid is not null and p_action in('node-create','node-save','node-restore') and (select coalesce(sum(octet_length(body)),0) from public.shared_nodes where collection_id=cid)>20000000 then raise exception 'COLLECTION_STORAGE_LIMIT'; end if;
 if cid is not null then update public.shared_collections set revision=revision+1 where id=cid; end if;
 insert into public.community_audit(actor_id,collection_id,action,target_id) values(a,cid,p_action,coalesce(nid,target,p_request));
 insert into public.community_mutations values(a,p_request,fp,result,now());
 return result;
end $$;

revoke all on function public.community_live(),public.community_blocked(uuid,uuid),public.community_visible(uuid),public.community_post_visible(uuid),public.shared_access(uuid,boolean),public.community_participant(uuid),public.community_moderator(),public.community_command(text,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.community_live(),public.community_visible(uuid),public.community_post_visible(uuid),public.community_blocked(uuid,uuid) to anon,authenticated;
grant execute on function public.community_blocked(uuid,uuid),public.shared_access(uuid,boolean),public.community_participant(uuid),public.community_moderator(),public.community_command(text,jsonb,uuid) to authenticated;

create function public.community_query(p_kind text,p_id uuid default null,p_filter jsonb default '{}') returns jsonb
language plpgsql stable security definer set search_path='' as $$
#variable_conflict use_column
declare a uuid:=auth.uid(); result jsonb; extra jsonb; c public.shared_collections; conv public.community_conversations;
 cursor_at timestamptz:=coalesce(nullif(p_filter->>'before','')::timestamptz,'infinity');
 cursor_id uuid:=coalesce(nullif(p_filter->>'beforeId','')::uuid,'ffffffff-ffff-ffff-ffff-ffffffffffff');
begin
 if a is not null and not public.community_live() then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
 if p_filter is null or jsonb_typeof(p_filter)<>'object' or octet_length(p_filter::text)>2000 then raise exception 'INVALID_FILTER'; end if;
 if p_kind not in ('profile','feed','comments','people') and a is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
 case p_kind
 when 'profile' then
  p_id:=coalesce(p_id,a);
  if p_id is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if p_id is distinct from a and not public.community_visible(p_id) then raise exception 'PROFILE_PRIVATE' using errcode='42501'; end if;
  select to_jsonb(p)-'requests'-'preferences' into result from public.community_profiles p where id=p_id;
  if p_id=a then select to_jsonb(p) into result from public.community_profiles p where id=a; end if;
  select coalesce(jsonb_agg(x),'[]') into extra from(select v.payload from public.publications p join public.publication_versions v on v.id=p.current_version where p.owner_id=p_id and p.status='published' and not p.hidden order by p.created_at desc limit 100)x;
  result:=jsonb_build_object('profile',result,'id',p_id,'mine',p_id=a,'publications',extra,
   'following',exists(select 1 from public.community_follows where owner_id=a and target_id=p_id),
   'canRequest',p_id is distinct from a and not public.community_blocked(a,p_id) and exists(select 1 from public.community_profiles where id=p_id and public and requests),
   'followers',(select count(*) from public.community_follows where target_id=p_id));
  if p_id=a then
   result:=result||jsonb_build_object('stats',jsonb_build_object(
    'collections',(select count(*) from public.containers where owner_id=a and data->>'kind'='collection' and coalesce(system_key,'') not in ('quick','pinned') and coalesce(data->>'trashed','false')<>'true'),
    'folders',(select count(*) from public.containers where owner_id=a and data->>'kind' in ('folder','subject') and coalesce(data->>'trashed','false')<>'true'),
    'notes',(select count(*) from public.notes where owner_id=a and coalesce(data->>'trashed','false')<>'true'),
    'publications',(select count(*) from public.publications where owner_id=a and status='published' and not hidden),
    'saved',(select count(*) from public.community_saves where owner_id=a),
    'downloads',(select count(*) from public.community_downloads d join public.publications p on p.id=d.publication_id where p.owner_id=a),
    'downloaded',(select count(*) from public.community_downloads where owner_id=a),
    'comments',(select count(*) from public.community_comments x join public.community_posts p on p.id=x.post_id where p.owner_id=a and not x.hidden),
    'sharedCollections',(select count(*) from public.shared_collections where owner_id=a)),
    'blocked',(select coalesce(jsonb_agg(jsonb_build_object('id',b.target_id,'username',coalesce(p.username,'Member'))),'[]') from public.community_blocks b left join public.community_profiles p on p.id=b.target_id where b.owner_id=a));
  end if;
 when 'people' then
  select coalesce(jsonb_agg(x),'[]') into extra from(select id,username,avatar,interests from public.community_profiles where public.community_visible(id) and public and (coalesce(p_filter->>'q','')='' or position(lower(p_filter->>'q') in lower(username||' '||array_to_string(interests,' ')))>0) order by lower(username),id limit 30)x;
  result:=jsonb_build_object('items',extra);
 when 'feed' then
  if coalesce(p_filter->>'feed','latest')<>'latest' and a is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  select coalesce(jsonb_agg(x),'[]') into extra from(
   select p.*,cp.username,cp.avatar,exists(select 1 from public.community_saves where owner_id=a and post_id=p.id) saved,
    (select count(*) from public.community_comments where post_id=p.id and not hidden) comments
   from public.community_posts p join public.community_profiles cp on cp.id=p.owner_id
   where public.community_post_visible(p.id) and cp.public and (p.created_at,p.id)<(cursor_at,cursor_id)
   and (coalesce(p_filter->>'category','')='' or p.category=p_filter->>'category')
   and (coalesce(p_filter->>'q','')='' or position(lower(p_filter->>'q') in lower(p.title||' '||p.body||' '||cp.username||' '||array_to_string(p.tags,' ')))>0)
   and (coalesce(p_filter->>'feed','latest')='latest'
    or (p_filter->>'feed'='following' and (exists(select 1 from public.community_follows where owner_id=a and target_id=p.owner_id) or exists(select 1 from public.community_topics where owner_id=a and topic=any(p.tags))))
    or (p_filter->>'feed'='interests' and p.tags && coalesce((select interests from public.community_profiles where id=a),'{}'))
    or (p_filter->>'feed'='saved' and exists(select 1 from public.community_saves where owner_id=a and post_id=p.id)))
   order by p.created_at desc,p.id desc limit 30)x;
  result:=jsonb_build_object('items',extra,'topics',(select coalesce(jsonb_agg(topic),'[]') from public.community_topics where owner_id=a));
 when 'comments' then
  if not public.community_post_visible(p_id) then raise exception 'ACCESS_DENIED' using errcode='42501'; end if;
  select coalesce(jsonb_agg(x),'[]') into extra from(select cm.*,coalesce(cp.username,'Studyspace member') username from public.community_comments cm left join public.community_profiles cp on cp.id=cm.owner_id where cm.post_id=p_id and not cm.hidden and not public.community_blocked(cm.owner_id,a) and (cm.created_at,cm.id)<(cursor_at,cursor_id) order by cm.created_at desc,cm.id desc limit 30)x;
  result:=jsonb_build_object('items',extra);
 when 'conversations' then
  select coalesce(jsonb_agg(x),'[]') into extra from(select c.*,coalesce(cp.username,'Studyspace member') username,
   (select count(*) from public.community_messages m where m.conversation_id=c.id and m.owner_id<>a and m.sequence>case when c.requester=a then c.requester_read else c.recipient_read end) unread
   from public.community_conversations c left join public.community_profiles cp on cp.id=case when c.requester=a then c.recipient else c.requester end
   where a in(c.requester,c.recipient) and (c.created_at,c.id)<(cursor_at,cursor_id) order by c.created_at desc,c.id desc limit 30)x;
  result:=jsonb_build_object('items',extra);
 when 'messages' then
  if not public.community_participant(p_id) then raise exception 'ACCESS_DENIED' using errcode='42501'; end if;
  select * into conv from public.community_conversations where id=p_id;
  select coalesce(jsonb_agg(x),'[]') into extra from(select * from public.community_messages where conversation_id=p_id and sequence<coalesce((p_filter->>'sequence')::bigint,9223372036854775807) order by sequence desc limit 40)x;
  result:=jsonb_build_object('items',extra,'conversation',to_jsonb(conv),'blocked',public.community_blocked(conv.requester,conv.recipient));
 when 'shared' then
  select coalesce(jsonb_agg(x),'[]') into extra from(select c.*,case when owner_id=a then 'owner' else(select role from public.shared_members where collection_id=c.id and user_id=a)end role from public.shared_collections c where public.shared_access(c.id) order by created_at desc limit 100)x;
  result:=jsonb_build_object('items',extra,'invitations',(select coalesce(jsonb_agg(x),'[]') from(select i.*,c.title from public.shared_invites i join public.shared_collections c on c.id=i.collection_id where recipient_id=a and status='pending' and not public.community_blocked(a,c.owner_id) order by i.created_at desc limit 100)x));
 when 'collection' then
  if not public.shared_access(p_id) then raise exception 'ACCESS_DENIED' using errcode='42501'; end if;
  select * into c from public.shared_collections where id=p_id;
  if c.revision=coalesce((p_filter->>'revision')::bigint,-1) then return jsonb_build_object('notModified',true,'viewer',a); end if;
  select coalesce(jsonb_agg(x),'[]') into extra from(select * from public.shared_nodes where collection_id=p_id order by kind,title,id limit 2000)x;
  result:=jsonb_build_object('collection',to_jsonb(c),'role',case when c.owner_id=a then 'owner' else(select role from public.shared_members where collection_id=p_id and user_id=a)end,'nodes',extra,
   'members',(select coalesce(jsonb_agg(x),'[]') from(select m.user_id,m.role,cp.username from public.shared_members m left join public.community_profiles cp on cp.id=m.user_id where collection_id=p_id)x),
   'invitations',case when c.owner_id=a then(select coalesce(jsonb_agg(x),'[]') from(select i.*,cp.username from public.shared_invites i left join public.community_profiles cp on cp.id=i.recipient_id where collection_id=p_id and status='pending')x)else '[]'::jsonb end,
   'audit',(select coalesce(jsonb_agg(x),'[]') from(select id,actor_id,action,target_id,created_at from public.community_audit where collection_id=p_id order by id desc limit 30)x));
 when 'versions' then
  if not exists(select 1 from public.shared_nodes where id=p_id and public.shared_access(collection_id)) then raise exception 'ACCESS_DENIED' using errcode='42501'; end if;
  result:=jsonb_build_object('items',(select coalesce(jsonb_agg(x),'[]') from(select * from public.shared_versions where node_id=p_id and revision<coalesce((p_filter->>'revision')::bigint,9223372036854775807) order by revision desc limit 30)x),
   'assets',(select coalesce(jsonb_agg(x),'[]') from(select id,filename,mime,octet_length(content) size from public.shared_assets where node_id=p_id)x));
 when 'badges' then
  result:=jsonb_build_object('messages',(select count(*) from public.community_messages m join public.community_conversations c on c.id=m.conversation_id where a in(c.requester,c.recipient) and m.owner_id<>a and c.status in('pending','accepted') and m.sequence>case when c.requester=a then c.requester_read else c.recipient_read end),
   'invitations',(select count(*) from public.shared_invites where recipient_id=a and status='pending'),
   'moderator',public.community_moderator());
 when 'reports' then
  if not public.community_moderator() then raise exception 'ACCESS_DENIED' using errcode='42501'; end if;
  select coalesce(jsonb_agg(x),'[]') into extra from(select * from public.community_reports where status='open' order by created_at,id limit 50)x;
  result:=jsonb_build_object('items',extra);
 else raise exception 'UNKNOWN_QUERY'; end case;
 return coalesce(result,'{}')||jsonb_build_object('viewer',a);
end $$;
revoke all on function public.community_query(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.community_query(text,uuid,jsonb) to anon,authenticated;

-- The existing background worker runs this daily. Retain retry identities so an
-- old message retry cannot duplicate a previously delivered message.
create function public.community_maintenance() returns jsonb language plpgsql security definer set search_path='' as $$
declare removed int;
begin
 delete from public.community_reports where created_at<now()-interval '90 days';
 get diagnostics removed=row_count;
 delete from public.community_audit where collection_id is null and created_at<now()-interval '90 days';
 return jsonb_build_object('expiredReports',removed,'openReports',(select count(*) from public.community_reports where status='open'),'oldestOpenReport',(select min(created_at) from public.community_reports where status='open'));
end $$;
revoke all on function public.community_maintenance() from public,anon,authenticated;
grant execute on function public.community_maintenance() to service_role;
