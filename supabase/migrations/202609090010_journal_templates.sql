-- Journal templates are an explicit public resource, separate from private notes.
create table public.journal_templates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 100),
  body text not null check (char_length(trim(body)) between 1 and 50000),
  kind text not null check (kind in ('journal', 'dream')),
  author text not null check (char_length(author) between 1 and 100),
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index journal_templates_browse on public.journal_templates(kind, created_at desc) where not hidden;
alter table public.journal_templates enable row level security;
grant select on public.journal_templates to anon, authenticated;
grant delete on public.journal_templates to authenticated;
grant all on public.journal_templates to service_role;
create policy journal_templates_public_read on public.journal_templates for select to anon, authenticated using (not hidden);
create policy journal_templates_owner_read on public.journal_templates for select to authenticated using (owner_id = auth.uid());
create policy journal_templates_owner_delete on public.journal_templates for delete to authenticated using (owner_id = auth.uid());
-- Publishing uses the authenticated API and its quota; clients cannot bypass it.
