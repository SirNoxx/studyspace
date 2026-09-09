# Studyspace enhancement delivery — September 8, 2026

This update implements the [17-section enhancement request](enhancement-request.md) on the original application described in [the master build prompt](master-build-prompt.md). Existing components, routes, themes, account boundaries, and workspace records remain in use. This is a locally verified update; hosted Supabase, worker deployment, email, and live AI still need configuration and service-level verification.

## Original version and data preservation

Before editing, the original application was committed as `36514d7e333731ff8b96566c84408e205a3b1d68`, tagged `before-enhancements-20260908`, and exported to a verified complete Git bundle and a source ZIP. The `master` branch remains at the original version; enhancements are on `feature/studyspace-enhancements`.

The preservation directory is `D:\Coding Projects\Note Taking App\backups\studyspace-before-enhancements-20260908`, containing `studyspace.bundle` and `studyspace-source.zip`. To inspect the original independently, clone the bundle to a **new** directory, then check out the tag there. There is no need to overwrite the current project:

```powershell
git clone "D:\Coding Projects\Note Taking App\backups\studyspace-before-enhancements-20260908\studyspace.bundle" "D:\Coding Projects\Note Taking App\studyspace-original-review"
git -C "D:\Coding Projects\Note Taking App\studyspace-original-review" checkout before-enhancements-20260908
```

No browser storage was cleared. The updated application uses the original `http://127.0.0.1:3000` origin and IndexedDB schema. On first enhanced load, it retains the previous local workspace record at `workspaces` → `before-enhancements:demo`, before adding optional settings defaults. Attachments remain in their existing object store. This is a local recovery checkpoint, not an off-device backup; full workspace export remains the portable backup mechanism. Browser tests use isolated contexts and never edit the user's browser workspace.

No hosted database was modified. The new SQL migration adds an index and a discovery function without destructive schema changes. New theme, navigation, onboarding, chat, and card-group preferences extend existing settings JSON; existing values are retained. Card and dictionary origin references and publication metadata are optional additions, compatible with older records.

## Delivered behavior

1. **Labeled navigation:** default icon-plus-label activity ribbon, smoothly collapsible with tooltips, focus states, and persistent preferences. Right tools have default labels, compact mode, and arrow-key navigation.
2. **Study-card collections:** create, rename, remove grouping without deleting cards, assign/move cards, and review All/Ungrouped/a chosen collection. Due cards, overview, and weekly counts follow the selected group; existing daily account caps remain global.
3. **Selection to study material:** selected note text exposes dictionary/card creation and link insertion. Existing forms retain the passage and note origin. Optional AI generates a draft through the existing consent-gated service; users edit and explicitly save it. Manual creation is always available.
4. **Study-method previews:** five supported methods have illustrations, explanations, use cases, and selected states in a modal grid. Collection setup displays the choice and actual icon previews.
5. **All-Markdown ZIP:** Settings → Data exports organized Markdown, readable collision-safe filenames, referenced assets, and a manifest. Progress follows measurable preparation and uses indeterminate asset/compression phases. Compression uses asynchronous fflate workers. Completion says the archive is ready and handed to the browser; it does not claim the download finished. Full backup still includes learning records and group mappings. Original Markdown remains authoritative in the manifest while portable files rewrite stable links to relative paths.
6. **Inline folders:** create immediately as Untitled in the chosen location, expand ancestry, select the rename text, Enter to commit. Escape keeps the newly created Untitled folder; blank input also retains Untitled. Duplicate names follow the existing file manager's permissive naming behavior.
7. **Markdown live context:** inactive heading/emphasis markers disappear while formatted text remains visible. Moving the cursor back reveals syntax. Source mode, reading mode, undo/redo, selection, and tab switching retain Markdown.
8. **Collection focus:** entering a collection scopes the tree; All Collections returns to the workspace. Separate per-collection new-file and new-folder controls work on hover, focus, and touch, with scoped header actions as well.
9. **Onboarding:** a concise three-step walkthrough introduces navigation and tools. Selecting a right-side tab reveals its purpose beneath the tabs. Skip/Finish persists; Settings → Appearance revisits it. Authenticated users without a completion flag see it on first enhanced access.
10. **Quick actions:** the existing command menu has a named action directly above Quick note, retaining its commands and keyboard entry point.
11. **AI Chat:** a quiet launcher on the writing screen opens the shared Study Guide with a short introduction. Hiding persists; Settings → Appearance restores it. No automatic opening or AI request.
12. **Folder attachments:** View attachments lists actual references in the folder and descendants, deduplicating assets. Images show real previews; other types show file indicators/open actions. Origins show current hierarchy and open the referencing note. Matching parses Markdown references and imported paths, excludes mere filename mentions/code examples, and avoids ambiguous filename matches.
13. **Hyperlinks:** select text or use Ctrl/Cmd+K to insert external links or choose a searchable note destination. Select an existing Markdown link to edit it. UUID references survive rename/move, remap on import/copy/merge, and show unavailable destinations clearly. Revision checks reject stale selection changes instead of overwriting newer text.
14. **Eight themes:** Winter, Spring, Summer, Fall, Tropical, Underwater, Space, Forest, with previews and persistent choices. Existing System/Light/Dark/Paper remain. Underwater adds peripheral depth, plants, and bubbles; Space uses quiet star points; Forest adds tiny floral accents. Decorations do not animate or intercept input.
15. **Journal calendar:** book-and-quill icon; default week, conventional month, and yearly dot grids with 365/366 days. Navigation and day selection use stable date keys and the user's configured local timezone. Today, selected day, and dates with entries differ; multiple entries remain accessible.
16. **Discover:** category filters, newest/popular ordering, prominent publishing action, and expanded metadata/privacy preview. Popularity counts actual currently saved study copies. File/folder/source/author-annotation counts derive from selected records. The server revalidates revision/ownership and publishes a distinct snapshot; original private writing remains private.
17. **Integration:** additive record normalization, local recovery checkpoint, shared UI/services, authentic export/job progress, error/empty states, responsive styles, and focused domain/database/browser checks.

## Verification evidence

The suite includes meaningful checks for old-data normalization, grouping preservation, leap-year/week boundaries, attachment scoping and ambiguity, stable links/private targets, ZIP collision handling and round trips, and SQL visibility/popularity/access grants. PostgreSQL tests execute every migration with PGlite and check anonymous denial for the service-only discovery function.

Browser journeys cover the original capture/import/PDF/review/publication/conflict workflows, selection editing and undo, scoped navigation, actual uploaded-image previews and ZIP bytes, all eight themes, onboarding/chat restoration, calendars, metadata preview, and keyboard shortcut preservation. Accessibility checks inspect existing themes and the eight new themes in the recorded views; they are not a claim that every possible state was exhaustively audited. Screenshots and JSON evidence are under `docs/screenshots` and `docs/evidence`.

**Final result:** 54 automated tests across 8 files, 17 Chromium journeys against production, TypeScript, and production build/start passed. Final command outcomes are recorded in `docs/evidence/enhancement-verification.json`. The performance fixture measures 10,000 notes against the production build, in an isolated browser context. AI fixture tests are labeled and intercepted; they are not live provider verification.

## External requirements

No Supabase credentials, real AI model credentials, or Docker-backed hosted environment were available. No deployment, real-user publication, email delivery, live AI call, or hosted disaster recovery was performed. Existing launch requirements in [acceptance.md](acceptance.md) and [operator-runbook.md](operator-runbook.md) remain applicable. The application can be used locally now; configure and verify external services before a public launch.

For the public research connection, exact setup, publication lifecycle, management screens, tables, buckets, and backups, see [Supabase management](supabase-management.md).
