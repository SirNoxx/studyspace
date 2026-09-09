# Studyspace · Windows & Supabase setup

## Install Studyspace 1.0.1

Download **Studyspace-Setup-1.0.1-x64.exe** from [Version 1.0.1](https://github.com/SirNoxx/studyspace/releases/tag/v1.0.1), run the installer, and open Studyspace from Start. This is a complete Windows 11 x64 application: Electron, the local server, and the workspace are bundled. You do not need Node.js or a separate browser/server installation. The first release is unsigned; Windows may show an unknown-publisher/SmartScreen prompt. Verify the release source and compare `Get-FileHash .\Studyspace-Setup-1.0.1-x64.exe -Algorithm SHA256` with the release's SHA256SUMS.txt.

The local workspace works without a Supabase account. Its private notes and attachments live in the desktop app's IndexedDB under `%APPDATA%\Studyspace`. The embedded server listens only on `127.0.0.1:47831`. Keep this app data directory when upgrading or reinstalling. The installer preserves it, including on uninstall; removing it manually removes local data. Use **Settings → Data → full workspace backup** regularly.

Your earlier browser workspace at `http://127.0.0.1:3000/demo` has separate storage and remains intact. To bring those notes into the desktop app, export a full workspace backup ZIP from the browser's **Settings → Data**, then import it from the desktop workspace's **Settings → Data**. Review the import preview and keep the original ZIP. Signing in or installing the desktop app does not automatically migrate or upload local notes.

## How the Supabase connection works

The desktop app has two workspaces. **Local workspace** saves on the device. **Connected cloud workspace** opens your own HTTPS deployment of this same Studyspace code. That deployed app connects to Supabase Auth, PostgreSQL, and private Storage. Its API checks the signed-in user and ownership before performing privileged operations.

The Windows installer intentionally contains no project credentials. The desktop connection field takes your **hosted Studyspace URL**, such as `https://studyspace.example.com`, not a `supabase.co` dashboard/API URL. The Supabase service-role key and optional AI key stay exclusively on your web server and worker. Public/anon keys are intended for the browser, with row-level security enabled. Never put service-role keys in `NEXT_PUBLIC_` variables or commit `.env.local`.

### 1. Configure a Supabase project and the hosted app

Clone [SirNoxx/studyspace](https://github.com/SirNoxx/studyspace). Use Node 24 and run `npm ci`. Copy `.env.example` to `.env.local` for local server work, or set these variables in your hosting provider's environment settings:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REFERENCE.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_BROWSER_PUBLISHABLE_OR_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVER_ONLY_SERVICE_ROLE_KEY
NEXT_PUBLIC_APP_URL=https://studyspace.example.com
```

Use the actual project values from Supabase's project settings. Configure them **before** `npm run build`: Next.js compiles public variables into browser assets. Deploy the web server over HTTPS, using the included Dockerfile/compose files or another compatible Node hosting platform. See the [operator runbook](operator-runbook.md) for the deployment and restore procedures. Do not expose the local desktop server as your public website.

### 2. Apply database migrations

Run the following from the repository, substituting your project reference:

```powershell
npx supabase@2.117.0 login
npx supabase@2.117.0 link --project-ref YOUR_PROJECT_REFERENCE
npx supabase@2.117.0 db push --dry-run
npx supabase@2.117.0 db push
```

A fresh project needs all nine checked-in migrations. Existing projects receive only pending migrations. Inspect the dry run and back up a populated project first. **Do not run `db reset` on existing user data.** The migrations configure tables, ownership rules, database functions, and private attachment/publication buckets. Keep row-level security enabled. See [Supabase migrations](https://supabase.com/docs/guides/local-development/database-migrations).

### 3. Configure authentication and the worker

In **Supabase → Authentication → URL Configuration**, set Site URL to `https://studyspace.example.com` and allow `https://studyspace.example.com/auth/callback`. Configure your real domain, email confirmation, and production email delivery. For local web testing also allow `http://127.0.0.1:3000/auth/callback`. Create an account through the hosted app's `/auth` page.

Run a persistent **worker** alongside the web app, with the same server environment. Locally, `npm run worker` reads `.env.local`. The included Docker Compose worker is suitable for a continuously running deployment. The worker processes exports, imports, study copies, source metadata, and publications that contain attachments or exceed 50 notes. Inspect **Settings → Data → Background jobs** and worker logs for failures. A web-only/serverless deployment still needs a separate durable worker.

### 4. Connect the desktop app

Open **Studyspace menu → Desktop settings**, enter `https://studyspace.example.com` in **Studyspace app address**, and save. Choose **Open cloud workspace** and sign in. Use the Studyspace menu to switch between local and cloud workspaces. Export/import a full backup when you deliberately want to transfer local content; no automatic upload occurs.

## Manage users, profiles, and public research

- **Accounts:** Supabase **Authentication → Users** manages sign-ins and account access. The `profiles` table holds display identity and the moderator flag. Users manage their profile in Studyspace's account settings. Auth user IDs link these records; avoid creating unrelated profile rows manually. See [Supabase user management](https://supabase.com/docs/guides/auth/managing-user-data).
- **Private work:** `workspaces`, `containers`, `notes`, `note_revisions`, and `personal_records` hold private notes and learning records. The private `attachments` Storage bucket holds uploaded source files.
- **Public research:** publish a selected collection or folder through **Discover → Publish a collection or folder**, review the privacy preview, and explicitly include any files or personal records you want to share. `publications` stores publication status and the current version; `publication_versions` contains immutable public snapshots. Later private edits do not automatically change public snapshots.
- **Publication files:** approved files are copied into the separate private `publication-assets` bucket. App routes check publication visibility before serving them. Keep both Storage buckets private.
- **Routine management:** use **Settings → Privacy → Your publications** to manage/unpublish research, and publish a new version from the original collection/folder to update it. Unpublishing stops new access; already downloaded copies remain with their recipients.
- **Moderation:** as the project administrator, set `profiles.moderator=true` only for a trusted account's correct Auth user ID. That account can use `/moderation` to review reports and hide or restore content. `reports` and `moderation_actions` retain the moderation record.
- **Backups:** back up both the database and Storage objects; [database backups do not contain Storage file bytes](https://supabase.com/docs/guides/platform/backups). Test restores into a separate project. Use app flows for routine edits so publication references and permissions stay consistent.

See [the detailed public research management guide](supabase-management.md) for table semantics, publication privacy, discovery ordering, and backup details.

## Automatic updates

Version 1 checks the public GitHub release feed shortly after opening and every six hours, downloads newer stable versions, and offers **Restart & install** under **Help → Check for updates**. It saves the workspace before restarting. You can disable automatic checks/downloads in Desktop settings; manual checks still work. No GitHub token is needed by users. Updates preserve the app's data directory and local storage origin.

To distribute a later update, publish a higher semantic version with its matching installer, blockmap, and `latest.yml`. Follow the [Windows release guide](windows-release.md). Hosting the cloud workspace lets you deploy cloud changes independently; bundled local changes require a desktop release.

## Version 1 deployment status

This release supplies the local application and cloud integration code. A live Supabase project, hosted HTTPS app, production Auth/email configuration, and durable worker still need your project configuration. No Supabase credentials were available during packaging, so no hosted database was modified and no live Auth/Storage integration was claimed as verified. Local demo publications are previews, not internet-public research.
