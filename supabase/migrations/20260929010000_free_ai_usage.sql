-- Guest/device, account, network and global reservations are committed atomically.
-- Contains hashed quota identifiers and counters only; never prompts, notes or raw IPs.
create table public.ai_usage_buckets (
  bucket text not null,
  window_start timestamptz not null,
  requests integer not null default 0 check (requests >= 0),
  tokens bigint not null default 0 check (tokens >= 0),
  primary key (bucket, window_start)
);
create index ai_usage_buckets_expiry on public.ai_usage_buckets(window_start);
alter table public.ai_usage_buckets enable row level security;
revoke all on public.ai_usage_buckets from public, anon, authenticated;
grant all on public.ai_usage_buckets to service_role;

create function public.reserve_ai_usage(p_entries jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  e jsonb; bucket_key text; start_at timestamptz; reset_at timestamptz;
  used_requests int; used_tokens bigint; first_remaining int; first_reset timestamptz;
begin
  if jsonb_typeof(p_entries) <> 'array' or jsonb_array_length(p_entries) not between 1 and 10 then raise exception 'INVALID_QUOTA'; end if;
  if (select count(*) from jsonb_array_elements(p_entries)) <> (select count(distinct (v->>'key') || ':' || (v->>'window')) from jsonb_array_elements(p_entries) v) then raise exception 'DUPLICATE_QUOTA'; end if;
  -- All callers acquire locks in the same order, including the shared global budget.
  for e in select value from jsonb_array_elements(p_entries) order by value->>'key', value->>'window' loop
    if e->>'window' not in ('minute','day') or length(e->>'key') not between 1 and 120
      or (e->>'requests')::int not between 1 and 1000000
      or (e->>'tokens')::bigint not between 1 and 10000000000
      or (e->>'cost')::bigint not between 1 and 1000000000 then raise exception 'INVALID_QUOTA'; end if;
    perform pg_advisory_xact_lock(hashtextextended('ai:' || (e->>'key') || ':' || (e->>'window'), 0));
  end loop;
  for e in select value from jsonb_array_elements(p_entries) loop
    start_at := date_trunc(e->>'window', now() at time zone 'UTC') at time zone 'UTC';
    reset_at := start_at + case when e->>'window' = 'day' then interval '1 day' else interval '1 minute' end;
    bucket_key := (e->>'window') || ':' || (e->>'key');
    select requests, tokens into used_requests, used_tokens from public.ai_usage_buckets where bucket = bucket_key and window_start = start_at;
    if coalesce(used_requests, 0) + 1 > (e->>'requests')::int or coalesce(used_tokens, 0) + (e->>'cost')::bigint > (e->>'tokens')::bigint then
      return jsonb_build_object('allowed', false, 'reason', case when coalesce(used_tokens, 0) + (e->>'cost')::bigint > (e->>'tokens')::bigint and e->>'reason' <> 'global' then 'processing' else e->>'reason' end, 'reset', reset_at);
    end if;
  end loop;
  for e in select value from jsonb_array_elements(p_entries) loop
    start_at := date_trunc(e->>'window', now() at time zone 'UTC') at time zone 'UTC';
    insert into public.ai_usage_buckets(bucket, window_start, requests, tokens)
      values((e->>'window') || ':' || (e->>'key'), start_at, 1, (e->>'cost')::bigint)
      on conflict (bucket, window_start) do update set requests = ai_usage_buckets.requests + 1, tokens = ai_usage_buckets.tokens + excluded.tokens
      returning requests into used_requests;
    if first_remaining is null then first_remaining := (e->>'requests')::int - used_requests; first_reset := start_at + interval '1 day'; end if;
  end loop;
  delete from public.ai_usage_buckets where window_start < (date_trunc('day', now() at time zone 'UTC') at time zone 'UTC') - interval '2 days';
  return jsonb_build_object('allowed', true, 'remaining', first_remaining, 'reset', first_reset);
end $$;
revoke all on function public.reserve_ai_usage(jsonb) from public, anon, authenticated;
grant execute on function public.reserve_ai_usage(jsonb) to service_role;
