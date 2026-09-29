-- Workbook resources are independent of collaborative Markdown documents.
create table public.shared_spreadsheets (
 id uuid primary key, collection_id uuid not null references public.shared_collections(id) on delete cascade,
 note_id uuid not null, snapshot jsonb not null, revision bigint not null check(revision>0),
 updated_at timestamptz not null default now(), check(octet_length(snapshot::text)<=10000000)
);
create table public.shared_spreadsheet_versions (
 workbook_id uuid references public.shared_spreadsheets(id) on delete cascade,
 revision bigint not null, snapshot jsonb not null, author_id uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(), primary key(workbook_id,revision)
);
create table public.shared_spreadsheet_requests (
 workbook_id uuid references public.shared_spreadsheets(id) on delete cascade,
 request_id uuid not null, actor_id uuid references auth.users(id) on delete cascade,
 revision bigint not null, created_at timestamptz not null default now(), primary key(workbook_id,request_id)
);
create index shared_spreadsheet_request_actor_time on public.shared_spreadsheet_requests(actor_id,created_at desc);
create index shared_spreadsheet_collection on public.shared_spreadsheets(collection_id);
alter table public.shared_spreadsheets enable row level security;
alter table public.shared_spreadsheet_versions enable row level security;
alter table public.shared_spreadsheet_requests enable row level security;
revoke all on public.shared_spreadsheets,public.shared_spreadsheet_versions,public.shared_spreadsheet_requests from public,anon,authenticated;
grant select on public.shared_spreadsheets,public.shared_spreadsheet_versions to authenticated;
grant all on public.shared_spreadsheets,public.shared_spreadsheet_versions,public.shared_spreadsheet_requests to service_role;
create policy shared_sheet_read on public.shared_spreadsheets for select to authenticated using(public.shared_access(collection_id));
create policy shared_sheet_history_read on public.shared_spreadsheet_versions for select to authenticated using(exists(select 1 from public.shared_spreadsheets s where s.id=workbook_id and public.shared_access(s.collection_id)));
create function public.shared_spreadsheet_commit(p_id uuid,p_collection uuid,p_note uuid,p_actor uuid,p_expected bigint,p_request uuid,p_snapshot jsonb)
returns bigint language plpgsql security definer set search_path='' as $$
declare actual bigint; prior bigint; next_revision bigint;
begin
 perform set_config('request.jwt.claim.sub',p_actor::text,true);
 perform 1 from public.shared_collections where id=p_collection for update;
 if not public.shared_access(p_collection,true) then raise exception 'ACCESS_DENIED' using errcode='42501'; end if;
 if not exists(select 1 from public.shared_workspaces w, jsonb_array_elements(w.snapshot->'notes') n where w.collection_id=p_collection and n->>'id'=p_note::text and coalesce((n->>'trashed')::boolean,false)=false) then raise exception 'NOTE_NOT_FOUND'; end if;
 if exists(select 1 from public.shared_spreadsheets where id=p_id and (collection_id<>p_collection or note_id<>p_note)) then raise exception 'RESOURCE_SCOPE_MISMATCH' using errcode='42501'; end if;
 select revision into prior from public.shared_spreadsheet_requests where workbook_id=p_id and request_id=p_request and actor_id=p_actor;
 if prior is not null then return prior; end if;
 select revision into actual from public.shared_spreadsheets where id=p_id;
 if actual is null and (select count(*) from public.shared_spreadsheets where collection_id=p_collection)>=200 then raise exception 'COLLECTION_WORKBOOK_LIMIT'; end if;
 if coalesce(actual,0)<>p_expected then raise exception 'REVISION_CONFLICT' using errcode='40001'; end if;
 if octet_length(p_snapshot::text)>10000000 then raise exception 'WORKBOOK_STORAGE_LIMIT'; end if;
 if (select count(*) from public.shared_spreadsheet_requests where actor_id=p_actor and created_at>now()-interval '1 minute')>=240 then raise exception 'RATE_LIMIT'; end if;
 next_revision:=coalesce(actual,0)+1;
 if actual is not null then insert into public.shared_spreadsheet_versions(workbook_id,revision,snapshot,author_id) select id,revision,snapshot,p_actor from public.shared_spreadsheets where id=p_id; end if;
 insert into public.shared_spreadsheets(id,collection_id,note_id,snapshot,revision) values(p_id,p_collection,p_note,p_snapshot,next_revision)
 on conflict(id) do update set snapshot=excluded.snapshot,revision=excluded.revision,updated_at=now();
 insert into public.shared_spreadsheet_requests(workbook_id,request_id,actor_id,revision) values(p_id,p_request,p_actor,next_revision);
 delete from public.shared_spreadsheet_versions where workbook_id=p_id and revision < next_revision-100;
 return next_revision;
end $$;
revoke all on function public.shared_spreadsheet_commit(uuid,uuid,uuid,uuid,bigint,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.shared_spreadsheet_commit(uuid,uuid,uuid,uuid,bigint,uuid,jsonb) to service_role;
