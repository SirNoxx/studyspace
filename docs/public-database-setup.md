# Studyspace public database setup

On September 9, 2026, all twelve checked-in migrations were applied to Supabase project `nnlhqstucyjoioyraxpf`. The project was empty before installation. Hosted SQL verification and a transactional role smoke test passed; no test accounts, workspaces, or publications were left behind.

This completes the database installation for the current app. The web app, Auth email delivery, worker, and AI credentials still require configuration. There is no `.env.local` in this checkout, and no public web deployment or live AI request was made by this change.

## SQL files

The canonical source is [`supabase/migrations`](../supabase/migrations). Apply every file in filename order to a new project. Existing installations apply only pending migrations.

- `202609080001_workspace.sql`: profiles, private workspaces, folders, notes, revision history, personal study records, publication versions, community records, jobs, quotas, ownership policies, transactional RPCs, and private attachments.
- `202609080002_moderation.sql`: moderator actions and public profile visibility.
- `202609080003_consistent_reads.sql`: a consistent workspace read across normalized tables.
- `202609080004_public_assets.sql`: a separate private bucket for approved publication assets.
- `202609080005_snapshot_identity.sql`: publication/version identity and publication retries.
- `202609080006_clarification_events.sql`: private replies and idempotent notifications.
- `202609080007_indexed_search.sql`: private full-text search.
- `202609080008_storage_lifecycle.sql`: file cleanup coordination and tombstones.
- `202609080009_discover_browsing.sql`: public discovery and aggregate study-copy popularity.
- `202609090010_journal_templates.sql`: explicitly published journal/dream templates.
- `20260909220443_public_access_hardening.sql`: explicit client grants, removal of inherited destructive permissions, protected RPCs, statement-cached identity checks, Q&A visibility, and private bucket configuration.
- `20260909220447_public_data_integrity.sql`: immutable snapshots, discussion/version relationships, suspended-publication checks, attachment ownership, validated writes, bounded UTC quotas, cancelled-job recovery, and supporting indexes.

[`supabase/verify.sql`](../supabase/verify.sql) is a read-only verification script for the SQL Editor. It raises an error if required tables, RLS, privilege restrictions, integrity constraints, or private buckets are missing.

[`supabase/checks/public-smoke.sql`](../supabase/checks/public-smoke.sql) exercises workspace writes, actual Postgres roles, private reads, quotas, public publishing, unpublishing, and account cascades. It creates synthetic data inside a transaction and rolls everything back. Run the entire file together as the database owner; do not run selected fragments independently. It does not simulate HTTP authentication or serve uploaded bytes.

## Deployment and upgrades

The connected project is already migrated. Do not paste the initial migrations into it again. MCP assigns execution-time migration versions; the installed history was aligned with the exact version prefixes and names in this repository so future CLI migration pushes can recognize the applied files.

For a different new project, or a future upgrade, use the repository's pinned CLI workflow:

```powershell
npx supabase@2.117.0 login
npx supabase@2.117.0 link --project-ref YOUR_PROJECT_REFERENCE
npx supabase@2.117.0 db push --dry-run
npx supabase@2.117.0 db push
```

Review the dry run and back up populated installations before applying pending migrations. The new integrity constraints deliberately reject existing malformed publication payloads or mismatched discussion versions; resolve such data explicitly if an older installation fails validation. No migration resets the database or seeds user content. Do not use `db reset` against hosted user data.

Migrations should run as the same trusted owner (`postgres` on this hosted project). Default-privilege changes apply to objects subsequently created by the migration role. Every future migration must still declare its RLS and grants explicitly; creating objects as another administrative role can use different defaults.

## Access model

Authenticated clients can read their own private records through RLS. Workspace changes, jobs, publication creation, quotas, and moderation use server-only RPCs or authenticated HTTP routes. The service key bypasses RLS, so it must remain exclusively on the web server and worker, and their ownership checks remain essential.

Anonymous clients can read active, non-hidden publication snapshots, eligible author profiles, visible public templates, and enabled public discussions. Disabling Q&A hides existing discussions and replies from direct REST reads as well as the application route. Profile reads expose only `id`, `display_name`, and `bio`; browser clients cannot set moderator flags. Owners can delete their own templates.

The `attachments` and `publication-assets` buckets are private and have 50 MiB per-file limits. Private upload paths begin with the owner's Auth UUID. Public attachment bytes are served by the app only after it checks publication visibility. Making either bucket public defeats that access model.

Hosted advisor findings were reviewed after deployment:

- `is_moderator()` and `public_available(uuid)` are intentionally callable read-only RLS helpers. They return only the caller's moderator flag or whether a publication is publicly available. Their definer privileges avoid recursive policies; trusted search paths are fixed, and browser roles cannot create objects in `public`. All mutation RPCs are denied to browser roles.
- `rate_limits` and `storage_tombstones` intentionally have RLS with no client policies. Only the server accesses them.
- The three composite-FK index notices concern `(parent_id,owner_id)`, `(container_id,owner_id)`, and `(note_id,owner_id)`. Existing indexes put `owner_id` first and support the corresponding equality lookups. We retained those ownership-oriented indexes rather than creating a second index for each reversed column order.
- Unused-index notices are expected on this newly created database. Reassess against actual workload statistics after launch.

## Connect the application

1. Configure `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `NEXT_PUBLIC_APP_URL` from `.env.example` on the web server and worker. Use the project's browser publishable/anon key for the public variable and keep the service key private. Next.js needs the public variables at build time.
2. Configure the exact deployed HTTPS origin and `/auth/callback` in Supabase Auth. Enable email confirmation and production SMTP before inviting users. The local `supabase/config.toml` email settings are for development.
3. Build and deploy the web app. Run `npm run worker` as a persistent process with the same environment. The worker is required for imports, exports, study copies, metadata, and larger publications.
4. Verify real signup, login, a second account's isolation, file upload/download, publish/unpublish, and worker completion. The existing `npm run db:test` script can exercise Auth and Storage against an explicitly configured isolated test project; it was not run here because no application keys are configured.
5. Configure database and Storage backups and test a restore using the operator runbook. Database backups alone do not contain uploaded bytes.

For the optional assistant, the current route calls `/v1/responses` and requires streaming and structured quiz output. Keep `AI_API_KEY` and `AI_MODEL` on the server. The route already requires consent, limits requests per account, and caps output tokens. No provider key or model was silently configured in this change.

## Verification and ongoing development

Run `npm test` and `npm run typecheck`. Database tests use PGlite with the hosted project's historical default grants, including `TRUNCATE`, and automatically load all migration files. They also verify an upgrade preserves existing notes. Local tests do not replace the real Auth/Storage HTTP checks above.

The official Supabase and Postgres skills are installed under `.agents/skills`, with provenance in `skills-lock.json`, to guide future changes. See [Supabase's API security documentation](https://supabase.com/docs/guides/api/securing-your-api) and the [operator runbook](operator-runbook.md).
