# Studyspace

A private Markdown workspace for writing, research, personal dictionaries, evidence, journals, review, and selectively published study collections. Built from [the supplied master prompt](docs/master-build-prompt.md). The original prompt outside this repository is unchanged.

**Windows 11 desktop — [Download 2.0.1](https://github.com/SirNoxx/studyspace/releases/tag/v2.0.1).** The x64 installer bundles the local workspace and code runtimes, with automatic update checks/downloads from GitHub and a save-protected restart to install. See [what’s new in 2.0](docs/studyspace-2.0.0.md). Read the [Windows and Supabase setup guide](docs/windows-supabase-setup.md) for installation, transferring browser notes, connecting your hosted app, and managing profiles/public research. [Build and release instructions](docs/windows-release.md) cover future desktop versions. Windows installers are currently unsigned.

The September 8 enhancement adds labeled navigation, study-card collections, selection actions, method previews, ZIP progress, inline folders, stable hyperlinks, attachment browsing, onboarding, AI Chat, eight optional themes, journal calendars, and Discover categories/popularity. See [delivery and preservation details](docs/enhancements.md) and [how to connect and manage Supabase public research](docs/supabase-management.md). The original app is retained on `master`, tagged `before-enhancements-20260908`, with a verified bundle and source ZIP outside the repository.

Database update (September 9): all twelve SQL migrations are installed in the connected Supabase project, including public-access hardening and data-integrity checks. [Database setup, verification, and remaining app configuration](docs/public-database-setup.md).

Latest UI refinement: [dismissible introductions, collection navigation, right-click study actions, and selected default names](docs/workspace-ui-refinements.md).

Earlier refinement: [writing fixes, linked study groups, and dropdown styling](docs/review-and-writing-update.md). Verified with 55 automated tests and 20 production Chromium journeys; [current evidence](docs/evidence/review-writing-verification.json).

**Status: runnable development application, not a production-certified release.** The local workspace works without credentials. Supabase authentication/storage, hosted background workers, live AI, and a full hosted restore require external configuration and verification. The [64-item acceptance checklist](docs/acceptance.md) records implementation, evidence, and remaining gaps without treating fixtures as live services.

## Start immediately

Prerequisites: Node **24.11.1 or newer in the 24.x line**, npm 11, a current desktop browser. Development was verified on Windows with PowerShell; commands also work in a POSIX terminal.

```sh
npm ci
npm run dev
```

Open [the local workspace](http://127.0.0.1:3000/demo). It starts empty with exactly one General collection. The optional **Explore an editable sample collection** action creates clearly labeled sample notes; it never publishes or calls AI. Demo data stays in this browser's IndexedDB. Export a backup before clearing browser data.

## Configure an authenticated workspace

Copy `.env.example` to `.env.local`. Keep it private; it is excluded from Git. Required values:

- `NEXT_PUBLIC_SUPABASE_URL`: your Supabase project's API URL.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: its browser/publishable legacy anon key.
- `SUPABASE_SERVICE_ROLE_KEY`: server-only service key. Never use a `NEXT_PUBLIC_` prefix for it.
- `NEXT_PUBLIC_APP_URL`: the exact app origin, for example `http://127.0.0.1:3000` locally. Use the same origin in Auth redirect configuration.

For local Supabase, install Docker Desktop and start its engine, then:

```sh
npx supabase@2.117.0 start
npx supabase@2.117.0 db reset
npx supabase@2.117.0 status
```

`db reset` deletes and recreates **the local development database**. Do not point destructive test/reset commands at a production project. Copy the local API URL, anon key, and service-role key from `status` into `.env.local`. All migrations in `supabase/migrations` must be applied. No personal/sample accounts are inserted by migrations.

For an existing isolated hosted project, authenticate the Supabase CLI, link its project reference, and run `npx supabase@2.117.0 db push`. Review pending migrations before applying them to a live environment. Add `/auth/callback` on your exact app origin to Supabase's redirect allowlist. Configure real email delivery and email confirmation before inviting users. The local Supabase config disables confirmation for development only.

Restart `npm run dev`, open `/auth`, and create an account. First workspace access transactionally initializes General. `/w` requires a verified session; `/discover`, `/p/...`, and public author pages expose published snapshots only.

## Worker and optional integrations

Run this in a **second terminal**, with the same private `.env.local`:

```sh
npm run worker
```

The durable worker handles metadata, staged imports, exports, copy jobs, and publication assembly involving attachments or more than 50 notes. It polls PostgreSQL, leases work, and retries bounded failures. See Settings → Data → Background jobs, or `/w/jobs`. Queued work requires a running consumer; closing a browser is safe.

Identifier metadata uses Crossref, arXiv, and Open Library. `CROSSREF_CONTACT_EMAIL` is optional polite-pool contact information. Live smoke results are in `docs/evidence/metadata-smoke.json`.

AI additionally requires server-only `AI_API_KEY`, `AI_MODEL`, and optionally `AI_BASE_URL` (defaults to the OpenAI API). Choose a Responses API model supporting streaming and JSON-schema output. No model is silently selected and no AI requests run automatically. Users must enable selected-context consent and choose an action. Never paste keys into a note or commit them.

## Tests and verification

The original build had 45 automated tests and 9 browser journeys. The enhanced suite adds coverage for preservation, grouping, links, attachments, calendars, publication browsing, keyboard shortcuts, and onboarding. Current command results are recorded in [enhancement verification](docs/evidence/enhancement-verification.json). Dependencies are unchanged from the original clean install with zero audit findings. Live service and broader manual checks remain documented below.

```sh
npm run typecheck
npm test
npx playwright install chromium
npm run test:e2e
npm run build
npm start
```

`npm test` uses real PostgreSQL via PGlite for migrations, transaction semantics, RLS/grants, storage-policy SQL, job leases, and a database dump/reload rehearsal. Its minimal auth/storage scaffolding is **not Supabase Auth or the Storage service**. Domain tests cover privacy, source adapters, recovery, import/export, copying, and scheduling.

`npm run test:e2e` uses isolated Chromium contexts with a local browser workspace. AI fixture tests, where present, intercept the provider route and are labeled as fixtures. Large-workspace timings and screenshots are written under `docs/evidence` and `docs/screenshots`.

To run the separate real Supabase checks, use a migrated **isolated test project**, set `TEST_SUPABASE_URL` to the exact API URL and `TEST_ALLOW_MUTATIONS=yes`, then run `npm run db:test`. It creates owner A/B, reader C, moderator and anonymous test clients; all created accounts use `studyspace-test-...@example.invalid`, and cleanup runs in `finally`.

Optional seed: create an empty test account, set `SEED_OWNER_ID` and `SEED_CONFIRM_PROJECT` (exact project URL), and run `npm run seed`. The seed refuses to overwrite notes. No seed is needed to use the app.

## Deploy

Vercel is the intended web target; `vercel.json` specifies the build and function durations. Configure server secrets and browser build-time variables there. Run a persistent worker on a separate managed container service from the `worker` Docker target. `compose.yaml` supplies an alternative web-plus-worker topology against your configured Supabase project:

```sh
docker compose --env-file .env.local up --build -d
```

Docker and a hosted web deployment were **not run in this environment**. The connected Supabase database has been migrated and SQL-verified; the web app and worker still need configuration and hosting. Before launch, complete the external checks and remaining acceptance gaps in the runbook. HTTPS, Auth email, allowed origins, quotas, backup retention, moderation staffing, and a monitored worker are operator responsibilities. No code has been pushed to an external repository by this database update.

Further documentation: [user guide](docs/user-guide.md), [architecture](docs/architecture.md), [import/export compatibility](docs/compatibility.md), [shortcuts](docs/shortcuts.md), [operator runbook](docs/operator-runbook.md), [acceptance evidence](docs/acceptance.md).
