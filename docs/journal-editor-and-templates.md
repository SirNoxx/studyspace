# Journal editor and templates

Opening a daily entry, a separate entry, or a recent journal entry now opens an editor inside the Journal page. The selected date, calendar, and recent entries stay in the same view. Journal dates appear as **September 9th, 2026**; stored calendar keys remain ISO dates so sorting and time zones are unchanged. Legacy automatic titles receive the same display format, while custom titles remain intact.

The editor supports Live, Source, Reading, attachments, automatic saving, and version history. Enter in the title focuses the writing area.

## Using templates

- **My templates → Create template** saves a named Markdown template in the current workspace. Journal and dream templates are separate.
- Select a template and choose **Apply template**. For an entry with existing text, preview the template and choose **Append to entry** or **Replace entry**. Replacement preserves the previous text in version history.
- **Use for new entries** sets the selected template as that workspace's default. Existing entries are unchanged.
- **Public templates** searches uploaded templates, previews their content, and saves a local copy when used. No journal entry is uploaded by this action.
- From a signed-in cloud workspace, **Publish publicly** previews the saved template before the explicit **Publish template** action. **Unpublish** removes the owner's public upload. Device workspaces retain their templates locally.

## Enabling the public library

The development environment currently has no Supabase credentials. Local templates work immediately; the live public catalog requires a configured Supabase backend and the new migration:

`supabase/migrations/202609090010_journal_templates.sql`

Apply it after the existing migrations using your project's normal Supabase migration process or the dashboard SQL Editor. Keep `SUPABASE_SERVICE_ROLE_KEY` on the server; configure the existing public Supabase URL and anon key as described in the project's setup documentation. Restart the configured server afterward.

Public templates are in `public.journal_templates`. The authenticated API derives ownership and author attribution, validates sizes and kinds, and limits publishing to 20 templates per day. The anonymous catalog exposes only rows where `hidden = false`; owners may unpublish their own rows. Administrators can hide inappropriate uploads by setting `hidden = true` in Supabase. Private journal entries remain in the existing private workspace data.

Validation covers ordinal suffixes and leap dates, existing journal workflows, template persistence and replacement history, public browsing with simulated service responses, and the migration's actual PostgreSQL permissions/RLS in PGlite. No live public templates were uploaded and no desktop release was built.
