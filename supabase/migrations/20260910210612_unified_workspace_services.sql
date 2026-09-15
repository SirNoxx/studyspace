-- Encrypted, short-lived OAuth transfer codes; never readable through the public API.
create table public.desktop_handoffs (
 code_hash text primary key, owner_id uuid not null references auth.users(id) on delete cascade,
 challenge text not null, payload text not null, expires_at timestamptz not null
);
alter table public.desktop_handoffs enable row level security;
revoke all on public.desktop_handoffs from public,anon,authenticated;
grant all on public.desktop_handoffs to service_role;
create function public.consume_desktop_handoff(p_hash text,p_challenge text) returns text
language plpgsql security definer set search_path='' as $$
declare result text;
begin
 delete from public.desktop_handoffs where code_hash=p_hash and challenge=p_challenge and expires_at>now() returning payload into result;
 delete from public.desktop_handoffs where expires_at<now();
 return result;
end $$;
revoke all on function public.consume_desktop_handoff(text,text) from public,anon,authenticated;
grant execute on function public.consume_desktop_handoff(text,text) to service_role;

create table public.collaboration_invitations (
 id uuid primary key, sender_id uuid not null references auth.users(id) on delete cascade,
 recipient_email text not null check(length(recipient_email)<=254), kind text not null check(kind in ('collection','planner')),
 collection_id uuid references public.shared_collections(id) on delete cascade,
 role text not null default 'editor' check(role in ('viewer','editor')),
 status text not null default 'pending' check(status in ('pending','accepted','declined','revoked')),
 created_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '30 days',
 check((kind='collection')=(collection_id is not null))
);
create unique index collaboration_pending_email on public.collaboration_invitations(sender_id,lower(recipient_email),kind,coalesce(collection_id,'00000000-0000-0000-0000-000000000000')) where status='pending';
create index collaboration_recipient on public.collaboration_invitations(lower(recipient_email));
create index collaboration_collection on public.collaboration_invitations(collection_id);
create table public.planner_connections (
 owner_id uuid references auth.users(id) on delete cascade, collaborator_id uuid references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(), primary key(owner_id,collaborator_id),check(owner_id<>collaborator_id)
);
create index planner_collaborator on public.planner_connections(collaborator_id);
create table public.planner_tasks (
 id uuid primary key, owner_id uuid not null references auth.users(id) on delete cascade,
 assignee_id uuid not null references auth.users(id) on delete cascade,
 title text not null check(length(trim(title)) between 1 and 240),description text not null default '' check(length(description)<=20000),
 due_date date, due_time time, timezone text not null default 'UTC',priority text not null default 'medium' check(priority in ('low','medium','high')),
 completed boolean not null default false,revision bigint not null default 1,updated_at timestamptz not null default now()
);
create index planner_owner on public.planner_tasks(owner_id,due_date);
create index planner_assignee on public.planner_tasks(assignee_id,due_date);
create table public.email_outbox (
 id uuid primary key default gen_random_uuid(), owner_id uuid references auth.users(id) on delete cascade,
 recipient text not null, subject text not null, body text not null,
 status text not null default 'pending' check(status in ('pending','sending','sent','failed')),
 attempts int not null default 0, next_attempt timestamptz not null default now(),locked_until timestamptz,
 provider_id text,last_error text,created_at timestamptz not null default now(),sent_at timestamptz
);
create index email_pending on public.email_outbox(status,next_attempt);
create index email_owner on public.email_outbox(owner_id);
create table public.google_connections (
 owner_id uuid primary key references auth.users(id) on delete cascade,payload text not null,
 calendar_id text not null default 'primary',updated_at timestamptz not null default now()
);
create table public.google_oauth_states (
 state_hash text primary key,owner_id uuid not null references auth.users(id) on delete cascade,
 payload text not null,expires_at timestamptz not null
);
create index google_states_owner on public.google_oauth_states(owner_id);
do $$ declare t text; begin
 foreach t in array array['collaboration_invitations','planner_connections','planner_tasks','email_outbox','google_connections','google_oauth_states'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;
create function public.planner_connected(a uuid,b uuid) returns boolean language sql stable security definer set search_path='' as $$
 select a<>b and not public.community_blocked(a,b) and exists(select 1 from public.planner_connections where (owner_id=a and collaborator_id=b) or (owner_id=b and collaborator_id=a))
$$;
revoke all on function public.planner_connected(uuid,uuid) from public,anon,authenticated;

create function public.workspace_services(p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
<<service>>
declare a uuid:=auth.uid(); email text; target uuid; id uuid; cid uuid; inv public.collaboration_invitations; task public.planner_tasks; result jsonb; existing public.planner_tasks;
begin
 if not public.community_live() or not public.community_feature('shared') then raise exception 'AUTH_REQUIRED' using errcode='42501';end if;
 select lower(u.email) into email from auth.users u where u.id=a and u.email_confirmed_at is not null;
 if email is null then raise exception 'EMAIL_VERIFICATION_REQUIRED';end if;
 if p_action='list' then
  return jsonb_build_object(
   'invitations',(select coalesce(jsonb_agg(x),'[]') from(select i.*,c.title collection_title from public.collaboration_invitations i left join public.shared_collections c on c.id=i.collection_id where (i.sender_id=a or lower(i.recipient_email)=service.email) and i.status='pending' and i.expires_at>now() and not public.community_blocked(i.sender_id,a) order by i.created_at desc limit 100)x),
   'connections',(select coalesce(jsonb_agg(x),'[]') from(select distinct u.id,coalesce(p.username,pr.display_name,'Collaborator') name from public.planner_connections c join auth.users u on u.id=case when c.owner_id=a then c.collaborator_id else c.owner_id end left join public.community_profiles p on p.id=u.id left join public.profiles pr on pr.id=u.id where (c.owner_id=a or c.collaborator_id=a) and not public.community_blocked(a,u.id))x),
   'tasks',(select coalesce(jsonb_agg(t order by t.due_date nulls last),'[]') from public.planner_tasks t where (t.owner_id=a or t.assignee_id=a) and public.planner_connected(t.owner_id,t.assignee_id)),
   'viewer',a);
 end if;
 if not public.consume_quota(a,'services:'||p_action,case when p_action='invite' then 20 else 500 end) then raise exception 'RATE_LIMIT';end if;
 id:=(p_data->>'id')::uuid;cid:=nullif(p_data->>'collection','')::uuid;
 if p_action='invite' then
  if p_data->>'kind' not in ('collection','planner') or length(p_data->>'email')>254 or p_data->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'INVALID_EMAIL';end if;
  if lower(trim(p_data->>'email'))=email then raise exception 'INVITE_SELF';end if;
  if p_data->>'kind'='collection' and not exists(select 1 from public.shared_collections where shared_collections.id=cid and owner_id=a) then raise exception 'ACCESS_DENIED' using errcode='42501';end if;
  select u.id into target from auth.users u where lower(u.email)=lower(trim(p_data->>'email'));
  if target is not null and public.community_blocked(a,target) then return jsonb_build_object('queued',true);end if;
  select * into inv from public.collaboration_invitations i where i.id=service.id;
  if found then
   if inv.sender_id<>a or inv.recipient_email<>lower(trim(p_data->>'email')) or inv.kind<>p_data->>'kind' or inv.collection_id is distinct from cid or inv.role<>coalesce(p_data->>'role','editor') then raise exception 'IDEMPOTENCY_MISMATCH';end if;
   return jsonb_build_object('id',inv.id,'queued',true);
  end if;
  update public.collaboration_invitations i set status='revoked' where i.sender_id=a and lower(i.recipient_email)=lower(trim(p_data->>'email')) and i.kind=p_data->>'kind' and i.collection_id is not distinct from cid and i.expires_at<=now();
  insert into public.collaboration_invitations(id,sender_id,recipient_email,kind,collection_id,role) values(service.id,a,lower(trim(p_data->>'email')),p_data->>'kind',cid,coalesce(p_data->>'role','editor'));
  insert into public.email_outbox(id,owner_id,recipient,subject,body) values(service.id,a,lower(trim(p_data->>'email')),'Studyspace collaboration invitation','You have been invited to collaborate in Studyspace. Sign in with this email address, then open '||case when p_data->>'kind'='planner' then 'Planner' else 'Shared collections' end||' to review and accept or decline. This invitation expires in 30 days.');
  return jsonb_build_object('id',id,'queued',true);
 elsif p_action='invitation' then
  select * into inv from public.collaboration_invitations i where i.id=service.id for update;
  if not found then raise exception 'ACCESS_DENIED' using errcode='42501';end if;
  if p_data->>'status'='revoked' then
   if inv.sender_id<>a then raise exception 'ACCESS_DENIED' using errcode='42501';end if;
  else
   if inv.recipient_email<>email or inv.status<>'pending' or inv.expires_at<=now() or public.community_blocked(a,inv.sender_id) then raise exception 'INVITATION_REVOKED';end if;
   if p_data->>'status' not in ('accepted','declined') then raise exception 'INVALID_INPUT';end if;
   if p_data->>'status'='accepted' then
    if inv.kind='planner' then insert into public.planner_connections values(inv.sender_id,a,now()) on conflict do nothing;
    else
     perform 1 from public.shared_collections where shared_collections.id=inv.collection_id and owner_id=inv.sender_id for update;
     if not found then raise exception 'INVITATION_REVOKED';end if;
     insert into public.shared_members values(inv.collection_id,a,inv.role) on conflict(collection_id,user_id) do update set role=excluded.role;
     update public.shared_collections set revision=revision+1 where shared_collections.id=inv.collection_id;
    end if;
   end if;
  end if;
  update public.collaboration_invitations i set status=p_data->>'status' where i.id=service.id;
  if p_data->>'status'<>'accepted' then update public.email_outbox o set status='failed',last_error='Invitation is no longer pending' where o.id=service.id and o.status='pending';end if;
 elsif p_action='disconnect' then
  target:=(p_data->>'target')::uuid;
  delete from public.planner_connections where (owner_id=a and collaborator_id=target) or (owner_id=target and collaborator_id=a);
 elsif p_action in ('task-save','task-delete') then
  select * into existing from public.planner_tasks t where t.id=service.id for update;
  if found then
   if a not in (existing.owner_id,existing.assignee_id) or not public.planner_connected(existing.owner_id,existing.assignee_id) then raise exception 'ACCESS_DENIED' using errcode='42501';end if;
   if existing.revision is distinct from (p_data->>'revision')::bigint then raise exception 'REVISION_CONFLICT' using errcode='PT409';end if;
   if p_action='task-delete' then
    if existing.owner_id<>a then raise exception 'ACCESS_DENIED' using errcode='42501';end if;
    delete from public.planner_tasks t where t.id=service.id;return '{}';
   end if;
   target:=existing.assignee_id;
  else
   if p_action='task-delete' then raise exception 'ACCESS_DENIED' using errcode='42501';end if;
   target:=(p_data->>'assignee')::uuid;
   if not public.planner_connected(a,target) then raise exception 'PLANNER_ACCEPTANCE_REQUIRED';end if;
  end if;
  -- A concurrent first insert must fail on its unique key, never turn into an
  -- update of a task whose owner and revision this transaction did not check.
  if existing.id is null then
   insert into public.planner_tasks(id,owner_id,assignee_id,title,description,due_date,due_time,timezone,priority,completed)
    values(service.id,a,target,p_data->>'title',coalesce(p_data->>'description',''),nullif(p_data->>'due_date','')::date,nullif(p_data->>'due_time','')::time,coalesce(p_data->>'timezone','UTC'),coalesce(p_data->>'priority','medium'),coalesce((p_data->>'completed')::boolean,false)) returning * into task;
  else
   update public.planner_tasks t set title=p_data->>'title',description=coalesce(p_data->>'description',''),due_date=nullif(p_data->>'due_date','')::date,due_time=nullif(p_data->>'due_time','')::time,timezone=coalesce(p_data->>'timezone','UTC'),priority=coalesce(p_data->>'priority','medium'),completed=coalesce((p_data->>'completed')::boolean,false),revision=t.revision+1,updated_at=now()
    where t.id=service.id returning * into task;
  end if;
  target:=case when task.owner_id=a then task.assignee_id else task.owner_id end;
  if not exists(select 1 from public.community_profiles where community_profiles.id=target and preferences->>'invitations'='false') then
   insert into public.email_outbox(owner_id,recipient,subject,body) select a,u.email,'Studyspace shared task',task.title||E'\n'||coalesce(task.description,'')||E'\nDue: '||coalesce(task.due_date::text,'No due date')||E'\nOpen Planner in Studyspace to view or update this task.' from auth.users u where u.id=target;
  end if;
  return to_jsonb(task);
 else raise exception 'INVALID_ACTION';end if;
 return '{}';
end $$;
revoke all on function public.workspace_services(text,jsonb) from public,anon;
grant execute on function public.workspace_services(text,jsonb) to authenticated;

create function public.claim_email_batch(p_owner uuid default null) returns setof public.email_outbox
language sql security definer set search_path='' as $$
 update public.email_outbox set status='sending',attempts=attempts+1,locked_until=now()+interval '2 minutes'
 where id in (select id from public.email_outbox where (p_owner is null or owner_id=p_owner) and attempts<8 and created_at>now()-interval '20 hours' and ((status='pending' and next_attempt<=now()) or (status='sending' and locked_until<now())) order by created_at limit 2 for update skip locked) returning *
$$;
revoke all on function public.claim_email_batch(uuid) from public,anon,authenticated;
grant execute on function public.claim_email_batch(uuid) to service_role;
