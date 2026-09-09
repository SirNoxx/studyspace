# Operator runbook

## Launch gate and runtime

A passing local build is not launch approval. Complete [acceptance.md](acceptance.md). Configure migrated Supabase, Auth email/confirmation, exact origins/redirects, HTTPS, a persistent worker, monitoring, quotas, support identity, moderators, and concrete backup retention. No external deployment was performed.

Vercel is the intended web target; run the supplied worker Docker target on a managed container service. Both use the same Supabase project and server secrets. Browser variables are build-time values. A Vercel plan must support the configured AI duration. Direct Storage uploads, controlled streaming downloads, compressed record-delta saves, and durable jobs avoid routing entire imports through an ordinary function body. Verify the exact hosted arrangement against [Vercel's limits](https://vercel.com/docs/functions/limitations) and [streaming guidance](https://vercel.com/kb/guide/how-to-bypass-vercel-body-size-limit-serverless-functions). Docker/hosted deployment were not available for live verification here.

## Health, jobs, and costs

`/api/health` reports configuration/database state without keys or note content. Worker logs contain event, job ID/kind, attempts, and coarse codes. Never log request bodies, prompts, notes, extracted pages, sessions, or secrets. Configure content-safe monitoring for save failures, oldest queue age, exhausted retries, storage errors, provider latency/budget, and unauthorized access.

Workers use unique WORKER_IDs, 90-second leases, 20-second heartbeats, four attempts, and bounded backoff. A new consumer reclaims expired jobs. For stuck work, inspect connectivity/credentials and owner-visible errors before retrying. A stale publication preview requires fresh author review; never bypass the guard. Cancellation is cooperative and cannot undo a committed publication. When idle after 24 hours of worker uptime, the worker sweeps abandoned staging/candidate objects older than ORPHAN_GRACE_HOURS (minimum/default 72). SQL locks and permanent object-key tombstones prevent reference commits from racing deletion; committed files, retained publication versions, live jobs, and merge undo references remain protected. A draft referencing an expired staged key must upload the file again. STORAGE_CLEANUP_ENABLED=false disables the sweep. Completed export files expire after EXPORT_RETENTION_DAYS (default seven); create a fresh export afterward. Test cleanup on the isolated hosted project before launch.

AI defaults to 30 requests per UTC day/user through AI_DAILY_REQUEST_LIMIT. Other routes have separate quota buckets. Provider failures do not modify notes. The exact provider billing plan and hosted cost envelope remain unverified.

## Moderation and deletion

Assign `profiles.moderator=true` only in a trusted administrative session to a verified operator. `/moderation` checks that role and audits hide/restore transactions. Public status checks block new page, history, payload, and streamed-file requests after hide/unpublish; already delivered bytes and copies cannot be recalled. No public signed asset URL is issued, avoiding the independent signed-token/cache lifetimes documented in [Supabase's CDN guidance](https://supabase.com/docs/guides/storage/cdn/smart-cdn).

Account deletion revalidates the password and literal confirmation, unpublishes, cancels jobs, deletes owner/publication object prefixes, then deletes the Auth user and cascaded active records. Failures are reported. In-flight workers can leave unreachable staged objects; include reconciliation in the deletion follow-up. Backups and recipients' copies follow the actual operator retention/reuse policy. Live deletion and service-level revocation still require a configured test project.

## Database-plus-object backup and restore

Back up schema/migrations, roles, Auth/application data, and object bytes in the same paused-write maintenance window. Follow the [current Supabase backup/restore procedure](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore), including custom auth/storage policies. Keep connection strings out of logs/history. [Database backups omit Storage bytes](https://supabase.com/docs/guides/platform/backups).

The supplied checksum script covers both private object buckets:

```sh
node --import tsx --env-file=.env.local scripts/storage-backup.ts backup .backups/rehearsal
```

It writes bytes and storage-manifest.json. Encrypt and store backups off-host with restricted access; `.backups` is Git-ignored. This script is not a replacement for the database/Auth snapshot.

Restore the database/Auth backup and migrations to a different isolated project, configure `.env.restore`, and set RESTORE_CONFIRM_PROJECT to that exact target URL. Then:

```sh
node --import tsx --env-file=.env.restore scripts/storage-backup.ts restore .backups/rehearsal
```

The script refuses the original project, unsafe paths, unknown buckets, checksum mismatches, and overwrites. It re-downloads each restored object to verify bytes. Check representative notes, definition scopes, PDFs/anchors, published versions, lineage, and learning history with owner/unrelated/anonymous accounts. Run `npm run db:test` against the isolated target. Only a successful rehearsal supports choosing actual RPO/RTO and retention. No hosted restore was performed here.

PGlite tests really dump/reload PostgreSQL and check workspace/storage metadata. They do not test the real object service, Auth email, encrypted off-site backups, or disaster failover.

## Release and rollback

Run npm ci, typecheck, domain/database tests, browser tests, and a production build. Test migrations in staging and back up before deployment. Keep app/worker images compatible with the schema. Roll back to the last tested image only when schema compatibility permits; data rollback requires the rehearsed database-plus-object procedure. Do not improvise destructive table resets in production. A hosted monitoring destination, legal/operator identity, and retention schedule remain operator configuration tasks.
