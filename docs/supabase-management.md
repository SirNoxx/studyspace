# Connecting and managing Studyspace public research

## Current state

The `http://127.0.0.1:3000/demo` workspace stores notes and files in this browser's IndexedDB. On September 9, 2026, all twelve SQL migrations were installed and verified in project `nnlhqstucyjoioyraxpf`; see the [database setup and verification guide](public-database-setup.md). Application credentials are still absent from `.env.local`, and no web deployment or live AI request was made. A publication saved in demo mode is a local preview; it is not internet-public.

The application already contains the Supabase integration. The browser client in `src/lib/supabase/browser.ts` handles sign-in. The server client in `src/lib/supabase/server.ts` verifies sessions with Supabase Auth. Authenticated API routes validate ownership and use a server-only service credential for transactional PostgreSQL operations and private Storage. Service credentials bypass RLS, so route-level ownership checks and restricted SQL functions are essential; they must never be exposed to the browser.

## Connect your project

1. Create or select your Supabase project. Copy `.env.example` to `.env.local` in the Studyspace repository. Enter the project's API URL as `NEXT_PUBLIC_SUPABASE_URL`, its browser publishable/anon key as `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and its server service-role key as `SUPABASE_SERVICE_ROLE_KEY`. Keep these in local/deployment environment configuration. Set `NEXT_PUBLIC_APP_URL` to the exact Studyspace origin.
2. Apply the SQL migrations in order using the Supabase CLI. A new database requires all twelve migrations. The connected project `nnlhqstucyjoioyraxpf` already has them; existing installations apply only pending files. The [database guide](public-database-setup.md) lists each migration and the validation checks. Use your actual project reference below:

   ```powershell
   npx supabase@2.117.0 login
   npx supabase@2.117.0 link --project-ref YOUR_PROJECT_REFERENCE
   npx supabase@2.117.0 db push --dry-run
   npx supabase@2.117.0 db push
   ```

   Inspect pending migrations and use a database backup before upgrading a populated hosted project. Do not run `db reset` on existing user data. See [Supabase's migration workflow](https://supabase.com/docs/guides/local-development/database-migrations).
3. In Supabase Authentication's URL configuration, set the Site URL and allow the exact callback URL, locally `http://127.0.0.1:3000/auth/callback`. Configure your deployed HTTPS origin and callback before public launch. Configure email delivery and account confirmation for real users.
4. Restart development, or rebuild and restart production (`npm run build`, then `npm start`). The `NEXT_PUBLIC_` variables are compiled into browser assets, so setting them after a production build is insufficient. Open `/auth`, create an account, and enter `/w`.
5. Start `npm run worker` in a separate terminal using the same `.env.local`. Keep a persistent worker running in production. It processes exports, imports, study copies, source metadata, and publications containing attachments or more than 50 notes. Check Settings → Data → Background jobs or `/w/jobs` for progress and failures.

Local demo and signed-in workspaces are separate. Signing in does not upload existing demo notes automatically. To transfer them deliberately, export a **full workspace backup** from demo Settings → Data, then import that ZIP into the signed-in workspace. Import previews and remaps IDs, internal links, attachment references, study-card groups, and learning records while retaining target account preferences. A full backup is preferable to Markdown-only export for this transfer. Keep the original backup afterward.

## How public research works

- Use Discover → **Publish a collection or folder**, or the file manager's existing publication action. Choose the scope, title, description, category, tags, study method, and reuse permissions. Review individual notes, definitions, sources, author annotations, and attachment selections in the privacy preview before confirming.
- Original notes remain in the private workspace. Publication creates a separate immutable `publication_versions.payload`. `publications.current_version` selects the public version, and `status`/`hidden` control access. Later private edits do not silently modify the published snapshot; explicitly publish an updated version.
- Counts come from selected content. A source is a structured source record, deduplicated by canonical identifier. An author annotation is an explicitly included author annotation ID. Folder counts use the selected notes' actual folder ancestry. These counts are not estimates of every possible citation or comment in prose.
- The **Popular** order uses the count of currently stored independent study-copy records referring to each publication. Ties use publication version creation time and publication ID. It is not an invented view count, historical download count, or unique-person count. Discover returns only active, non-hidden publications and aggregate popularity, never the people or private content behind those copies.
- Private uploaded bytes live in the private `attachments` bucket. Explicitly approved publication files are copied to the separate private `publication-assets` bucket, addressed by publication/version/file IDs. Public files stream through an application route that checks visibility; neither bucket needs to be made public.
- Manage your publications under **Settings → Privacy → Your publications**. Unpublish stops new public page, payload, history, and file access. Copies and downloads already received by others remain theirs. Publish an updated version from the originating collection/folder when ready.

## Where you manage it

**Inside Studyspace:** edit and publish research, inspect previews, manage reuse permissions, unpublish, and monitor background jobs. Use these flows for routine changes because they maintain version and ownership invariants.

**In the Supabase dashboard:** Authentication → Users manages accounts; the Table Editor exposes database records; Storage shows bucket objects. See [Supabase's user management documentation](https://supabase.com/docs/guides/auth/managing-user-data) and [database overview](https://supabase.com/docs/guides/database/overview). Relevant tables are:

- `workspaces`, `containers`, `notes`, `note_revisions`: private organization and writing.
- `personal_records`: private dictionary, sources, annotations, cards, copies, and related records; `kind` identifies their type.
- `publications`, `publication_versions`: publication status, version pointers, and immutable public payloads.
- `profiles`: author identity and administrator-assigned moderation status.
- `jobs`: queued work, progress, result, and error state.
- `reports`, `moderation_actions`, `public_threads`, `thread_replies`: reports, moderation audit, and published discussions.

For trusted moderators, an administrator can set `profiles.moderator=true` for the correct authenticated user ID. That account can then use Studyspace `/moderation` to review reports and hide or restore public material. Do not assign this flag to ordinary researchers. Keep RLS enabled and private buckets private; avoid manually editing publication version payloads or deleting Storage objects referenced by notes.

Database backups do not include Storage file bytes. Back up both, and rehearse restores into a separate project using the supplied [operator runbook](operator-runbook.md). Retain the pre-enhancement Git bundle separately from database and file backups: it preserves application code, not hosted user data.

## Remaining external setup

The Supabase database is installed and SQL-verified. Application credentials, Auth email delivery, a persistent worker, a hosted application, and live Auth/Storage integration and restore checks are still required for internet-public research. The local production server is only reachable on this computer. AI suggestions additionally require server-only `AI_API_KEY` and `AI_MODEL`; manual cards, dictionary entries, and the writing workspace remain usable without AI. Local PGlite tests and hosted SQL role tests do not substitute for verification against real Supabase Auth and Storage HTTP services.
