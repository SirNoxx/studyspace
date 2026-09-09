create extension if not exists pgcrypto;
create table public.profiles(id uuid primary key references auth.users on delete cascade, display_name text not null default 'Researcher', bio text not null default '', moderator boolean not null default false, suspended boolean not null default false);
create table public.workspaces(owner_id uuid primary key references auth.users on delete cascade, revision bigint not null default 0, state jsonb not null, updated_at timestamptz not null default now());
create table public.containers(id uuid primary key, owner_id uuid not null references public.workspaces on delete cascade, parent_id uuid, system_key text, title text not null check(length(title) between 1 and 240), data jsonb not null, unique(id,owner_id), unique(owner_id,system_key), foreign key(parent_id,owner_id) references public.containers(id,owner_id) deferrable initially deferred);
create table public.notes(id uuid primary key,owner_id uuid not null references public.workspaces on delete cascade,container_id uuid not null,revision bigint not null, title text not null,body text not null check(octet_length(body)<=5242880),data jsonb not null,search tsvector generated always as (to_tsvector('english',title || ' ' || body)) stored,unique(id,owner_id),foreign key(container_id,owner_id) references public.containers(id,owner_id) deferrable initially deferred);
create index notes_search on public.notes using gin(search);
create index notes_owner_container on public.notes(owner_id,container_id);
create index containers_owner_parent on public.containers(owner_id,parent_id);
create table public.note_revisions(id bigint generated always as identity primary key,owner_id uuid not null references auth.users on delete cascade,note_id uuid not null,revision bigint not null,data jsonb not null,unique(note_id,revision),foreign key(note_id,owner_id) references public.notes(id,owner_id) on delete cascade deferrable initially deferred);
create table public.personal_records(id uuid primary key,owner_id uuid not null references public.workspaces on delete cascade,kind text not null check(kind in ('definitions','sources','anchors','attachments','annotations','review','copies','notifications','ai')),data jsonb not null);
create index personal_owner_kind on public.personal_records(owner_id,kind);
create table public.publications(id uuid primary key,owner_id uuid not null references auth.users on delete cascade,container_id uuid,status text not null default 'published' check(status in ('published','unpublished')),hidden boolean not null default false,current_version uuid,created_at timestamptz not null default now());
create table public.publication_versions(id uuid primary key,publication_id uuid not null references public.publications on delete cascade,version integer not null,payload jsonb not null,created_at timestamptz not null default now(),unique(publication_id,version));
alter table public.publications add constraint current_version_fk foreign key(current_version) references public.publication_versions(id) deferrable initially deferred;
create table public.public_threads(id uuid primary key default gen_random_uuid(),publication_id uuid not null references public.publications on delete cascade,version_id uuid not null references public.publication_versions on delete cascade,owner_id uuid not null references auth.users on delete cascade,note_id uuid not null,anchor jsonb not null,body text not null check(length(body) between 1 and 10000),resolved boolean not null default false,hidden boolean not null default false,created_at timestamptz not null default now());
create table public.thread_replies(id uuid primary key default gen_random_uuid(),thread_id uuid not null references public.public_threads on delete cascade,owner_id uuid not null references auth.users on delete cascade,body text not null check(length(body) between 1 and 10000),created_at timestamptz not null default now());
create table public.clarification_requests(id uuid primary key default gen_random_uuid(),publication_id uuid not null references public.publications on delete cascade,sender_id uuid not null references auth.users on delete cascade,recipient_id uuid not null references auth.users on delete cascade,category text not null,body text not null check(length(body) between 1 and 10000),status text not null default 'Open',replies jsonb not null default '[]',created_at timestamptz not null default now());
create table public.notifications(id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users on delete cascade,event_key text not null,title text not null,body text not null default '',href text,read boolean not null default false,created_at timestamptz not null default now(),unique(owner_id,event_key));
create table public.reports(id uuid primary key default gen_random_uuid(),reporter_id uuid not null references auth.users on delete cascade,publication_id uuid not null references public.publications on delete cascade,category text not null,body text not null default '',status text not null default 'open',created_at timestamptz not null default now());
create table public.moderation_actions(id uuid primary key default gen_random_uuid(),actor_id uuid references auth.users on delete set null,publication_id uuid references public.publications on delete set null,action text not null,created_at timestamptz not null default now());
create table public.jobs(id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users on delete cascade,kind text not null,payload jsonb not null,status text not null default 'queued' check(status in ('queued','running','succeeded','partially-failed','failed','cancelled')),progress integer not null default 0,attempts integer not null default 0,max_attempts integer not null default 4,available_at timestamptz not null default now(),lease_until timestamptz,worker_id text,cancel_requested boolean not null default false,idempotency_key text not null,error text,result jsonb,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(owner_id,idempotency_key));
create index jobs_claim on public.jobs(status,available_at,lease_until);
create table public.rate_limits(owner_id uuid not null references auth.users on delete cascade,bucket text not null,window_start timestamptz not null,used integer not null default 0,primary key(owner_id,bucket,window_start));

create function public.is_moderator() returns boolean language sql stable security definer set search_path=public as $$select coalesce((select moderator from profiles where id=auth.uid()),false)$$;
create function public.public_available(pid uuid) returns boolean language sql stable security definer set search_path=public as $$select exists(select 1 from publications where id=pid and status='published' and not hidden)$$;
do $$declare t text;begin foreach t in array array['profiles','workspaces','containers','notes','note_revisions','personal_records','publications','publication_versions','public_threads','thread_replies','clarification_requests','notifications','reports','moderation_actions','jobs','rate_limits'] loop execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from anon, authenticated',t);execute format('grant all on public.%I to service_role',t);end loop;
foreach t in array array['workspaces','containers','notes','note_revisions','personal_records','notifications','jobs'] loop execute format('create policy owner_read on public.%I for select to authenticated using (owner_id=auth.uid())',t);execute format('grant select on public.%I to authenticated',t);end loop;end$$;
grant usage,select on all sequences in schema public to service_role;
create policy profile_read on public.profiles for select using(id=auth.uid() or exists(select 1 from public.publications p where p.owner_id=id and public.public_available(p.id)));
grant select(id,display_name,bio) on public.profiles to anon,authenticated;
create policy publication_read on public.publications for select using(owner_id=auth.uid() or public.public_available(id) or public.is_moderator());
create policy version_read on public.publication_versions for select using(public.public_available(publication_id) or exists(select 1 from public.publications p where p.id=publication_id and p.owner_id=auth.uid()));
grant select on public.publications,public.publication_versions to anon,authenticated;
create policy question_read on public.public_threads for select using(public.public_available(publication_id) and not hidden);
create policy replies_read on public.thread_replies for select using(exists(select 1 from public.public_threads t where t.id=thread_id));
grant select on public.public_threads,public.thread_replies to anon,authenticated;
create policy request_read on public.clarification_requests for select to authenticated using(sender_id=auth.uid() or recipient_id=auth.uid() or public.is_moderator());
create policy report_read on public.reports for select to authenticated using(reporter_id=auth.uid() or public.is_moderator());
create policy moderation_read on public.moderation_actions for select to authenticated using(public.is_moderator());
grant select on public.clarification_requests,public.reports,public.moderation_actions to authenticated;

create function public.commit_workspace(p_owner uuid,p_expected bigint,p_state jsonb) returns bigint language plpgsql security definer set search_path=public as $$
declare current_revision bigint; item jsonb; rev jsonb; k text; new_revision bigint;
begin
 insert into workspaces(owner_id,revision,state) values(p_owner,0,'{}') on conflict do nothing;
 select revision into current_revision from workspaces where owner_id=p_owner for update;
 if current_revision<>p_expected then raise exception 'REVISION_CONFLICT' using errcode='40001';end if;
 if jsonb_array_length(p_state->'notes')>10000 then raise exception 'NOTE_LIMIT';end if;
 if (select count(*) from jsonb_array_elements(p_state->'containers') c where c->>'system'='general' and not coalesce((c->>'trashed')::boolean,false))<>1 then raise exception 'GENERAL_REQUIRED';end if;
 new_revision:=current_revision+1;
 update workspaces set state=p_state - array['notes','containers','definitions','sources','anchors','attachments','annotations','review','copies','notifications','ai','publications'],revision=new_revision,updated_at=now() where owner_id=p_owner;
 for item in select * from jsonb_array_elements(p_state->'containers') loop
 insert into containers(id,owner_id,parent_id,system_key,title,data) values((item->>'id')::uuid,p_owner,(item->>'parentId')::uuid,item->>'system',item->>'title',item)
 on conflict(id) do update set parent_id=excluded.parent_id,system_key=excluded.system_key,title=excluded.title,data=excluded.data where containers.owner_id=p_owner;
 if not found then raise exception 'OWNERSHIP';end if;end loop;
 for item in select * from jsonb_array_elements(p_state->'notes') loop
 insert into notes(id,owner_id,container_id,revision,title,body,data) values((item->>'id')::uuid,p_owner,(item->>'containerId')::uuid,(item->>'revision')::bigint,item->>'title',item->>'body',item)
 on conflict(id) do update set container_id=excluded.container_id,revision=excluded.revision,title=excluded.title,body=excluded.body,data=excluded.data where notes.owner_id=p_owner;
 if not found then raise exception 'OWNERSHIP';end if;
 for rev in select * from jsonb_array_elements(item->'history') loop insert into note_revisions(owner_id,note_id,revision,data) values(p_owner,(item->>'id')::uuid,(rev->>'revision')::bigint,rev) on conflict(note_id,revision) do nothing;end loop;end loop;
 delete from notes where owner_id=p_owner and id not in(select (x->>'id')::uuid from jsonb_array_elements(p_state->'notes') x);
 delete from containers where owner_id=p_owner and id not in(select (x->>'id')::uuid from jsonb_array_elements(p_state->'containers') x);
 foreach k in array array['definitions','sources','anchors','attachments','annotations','review','copies','notifications','ai'] loop
 for item in select * from jsonb_array_elements(coalesce(p_state->k,'[]')) loop
 insert into personal_records(id,owner_id,kind,data) values((item->>'id')::uuid,p_owner,k,item) on conflict(id) do update set data=excluded.data where personal_records.owner_id=p_owner and personal_records.kind=k;
 if not found then raise exception 'OWNERSHIP';end if;end loop;
 delete from personal_records where owner_id=p_owner and kind=k and id not in(select (x->>'id')::uuid from jsonb_array_elements(coalesce(p_state->k,'[]')) x);end loop;
 insert into profiles(id,display_name,bio) values(p_owner,coalesce(p_state#>>'{settings,displayName}','Researcher'),coalesce(p_state#>>'{settings,bio}','')) on conflict(id) do update set display_name=excluded.display_name,bio=excluded.bio;
 return new_revision;
end$$;
create function public.publish_snapshot(p_owner uuid,p_id uuid,p_container uuid,p_snapshot jsonb,p_expected bigint) returns void language plpgsql security definer set search_path=public as $$
declare v_revision bigint;begin
 select revision into v_revision from workspaces where owner_id=p_owner for update;
 if v_revision<>p_expected then raise exception 'REVISION_CONFLICT' using errcode='40001';end if;
 if exists(select 1 from publications where id=p_id and owner_id<>p_owner) then raise exception 'OWNERSHIP';end if;
 insert into publications(id,owner_id,container_id) values(p_id,p_owner,p_container) on conflict(id) do nothing;
 insert into publication_versions(id,publication_id,version,payload) values((p_snapshot->>'id')::uuid,p_id,(p_snapshot->>'version')::int,p_snapshot) on conflict(id) do nothing;
 update publications set current_version=(p_snapshot->>'id')::uuid,status='published' where id=p_id and owner_id=p_owner;
end$$;
create function public.claim_job(p_worker text) returns setof public.jobs language plpgsql security definer set search_path=public as $$begin
 update jobs set status='failed',error='Retry limit reached',lease_until=null where attempts>=max_attempts and status in ('running','queued') and coalesce(lease_until,now())<=now();
 return query with candidate as(select id from jobs where ((status='queued' and available_at<=now()) or(status='running' and lease_until<now())) and attempts<max_attempts and not cancel_requested order by available_at for update skip locked limit 1)
 update jobs j set status='running',attempts=attempts+1,worker_id=p_worker,lease_until=now()+interval '90 seconds',updated_at=now() from candidate c where j.id=c.id returning j.*;
end$$;
create function public.consume_quota(p_owner uuid,p_bucket text,p_limit int) returns boolean language plpgsql security definer set search_path=public as $$declare n int;begin insert into rate_limits(owner_id,bucket,window_start,used) values(p_owner,p_bucket,date_trunc('day',now()),1) on conflict(owner_id,bucket,window_start) do update set used=rate_limits.used+1 returning used into n;return n<=p_limit;end$$;
revoke all on function public.commit_workspace(uuid,bigint,jsonb),public.publish_snapshot(uuid,uuid,uuid,jsonb,bigint),public.claim_job(text),public.consume_quota(uuid,text,int) from public,anon,authenticated;
grant execute on function public.commit_workspace(uuid,bigint,jsonb),public.publish_snapshot(uuid,uuid,uuid,jsonb,bigint),public.claim_job(text),public.consume_quota(uuid,text,int) to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('attachments','attachments',false,52428800,array['application/pdf','image/png','image/jpeg','image/webp','image/gif','audio/mpeg','audio/wav','video/mp4','text/plain','text/markdown','application/zip']) on conflict(id) do nothing;
create policy own_assets_read on storage.objects for select to authenticated using(bucket_id='attachments' and (storage.foldername(name))[1]=auth.uid()::text);
create policy own_assets_insert on storage.objects for insert to authenticated with check(bucket_id='attachments' and (storage.foldername(name))[1]=auth.uid()::text);
create policy own_assets_delete on storage.objects for delete to authenticated using(bucket_id='attachments' and (storage.foldername(name))[1]=auth.uid()::text);
