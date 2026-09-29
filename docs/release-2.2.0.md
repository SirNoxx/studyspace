# Studyspace 2.2.0

## What's new

- Editable spreadsheet modules with formulas, Excel/CSV import and export, grouped toolbar controls, dropdown menus, direct cell editing, and undo/redo. Font-size changes apply immediately; clearing cells also removes formatting and background colors. Clicks keep rows in place, with Ctrl + mouse wheel for grid scrolling.
- Rich-text paste preserves headings, bold text, and editable tables, including paragraphs within table cells. Table conversion is available in the module options menu.
- Attachments paste at the writing cursor. Click an image to select it and drag it to reposition it within a note, with an insertion marker and undo support.
- Distinct heading styles in Live Preview and Reading, a full-width Heading 1 divider, collapsible sections, and circular task checkboxes. Type `[]`, `[ ]`, `-[]`, `- []`, or `- [ ]` followed by Space to start a task.
- Improvements to definition linking, formatted lists, picture menus, and whiteboards, including portrait 9:16 framing.
- Bundled local note editing, spelling resources, and code runtimes. Desktop account and community connections continue to use the configured hosted Studyspace service.

## Install on Windows

Download and run **Studyspace-Setup-2.2.0-x64.exe**. Close Studyspace before installing. The installer retains the existing application identity and `%APPDATA%\Studyspace` data directory. Existing desktop installations can also discover this stable release through their updater.

The browser's workspace and the desktop workspace use separate storage. To move notes from the browser, export a full workspace backup there and import it in the desktop app. Keep the backup until you have confirmed your notes and attachments are present.

The Windows installer is unsigned, as with previous releases; Windows may display an unknown-publisher/SmartScreen prompt. `SHA256SUMS.txt` contains checksums for the installer and matching updater files.

## Hosted features

This release publishes the desktop installer and source code. It does not deploy the hosted website, apply hosted database migrations, configure Google OAuth or email delivery, or fund the AI provider account. Local writing and spreadsheet editing work without those services.

Shared spreadsheets require the matching hosted API and `20260922010000_shared_spreadsheets.sql`. Guest AI quotas require the updated hosted API and `20260929010000_free_ai_usage.sql`, plus a funded server-side AI provider configuration. Earlier shared-workspace/planner integrations retain their existing hosted setup requirements. See `docs/operator-setup-checklist.md`, `docs/free-ai-chat.md`, and `docs/spreadsheet-module-implementation.md` for configuration and known limits. The optional visual spreadsheet engine has accessibility limits; Studyspace's accessible cell editor is the default.

Google Sign-In, Google Calendar, email invitations, and cloud collaboration require separate live service verification. Local and mocked transport checks do not establish hosted service readiness. Learning remains hidden, and Study Music remains removed.

## Release verification

- Production build and TypeScript checks passed; 217 tests across 41 unit/database test files and 17 desktop tests passed.
- The packaged Windows executable passed startup, loading-screen/error handling, immediate-close saving, reopening, and fresh/legacy connection checks using isolated profiles.
- Packaged spreadsheet editing, formulas, immediate font sizing, clearing styles, undo, and persistence passed with external network access blocked.
- The account bridge passed mocked hosted-service checks, including incremental AI streaming and sign-out credential removal.
- The updater downloaded and verified the actual installer and rejected a deliberately corrupted checksum. The installer was not executed; an in-place installation upgrade was not tested.
- Installer and updater checksums are recorded in `SHA256SUMS.txt`; verification details are in `docs/evidence/release-2.2.0.json`. No environment files were included in the bundled web server.
