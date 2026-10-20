# Studyspace 2.1.0

## What's new

- Context-aware sidebars: Journal entries grouped by month, collapsible Review study groups, and a dedicated Quick notes list that remains visible while editing.
- Planner checklist with To do, Overdue and collapsible Completed sections, two add-task buttons, and a navigable week calendar.
- More than 2,000 searchable collection icons and a labeled custom color picker.
- One **Insert or edit link / definition** dialog for web links, notes and existing definitions, including links whose selected text differs from the definition's term.
- Local English spelling and grammar corrections, plus a separate personal spelling dictionary with removable accepted words.
- Expanded whiteboard text editing and navigation, document import/export improvements, and definition/use-case modules.
- A unified desktop workspace: local notes remain available while account, AI and community requests use the configured hosted connection.
- Shared-workspace support reuses the regular editor and explorer, with collaborative text synchronization and history APIs.

## Windows download

Install `Studyspace-Setup-2.1.0-x64.exe`. Existing installations can discover this version through Studyspace's updater. The installer preserves the existing app identity and user-data directory. `SHA256SUMS.txt` lists the installer and updater-asset checksums.

## Hosted integration requirements

The installer includes no deployment credentials. This release packages the desktop application and source; it does not apply Supabase migrations or deploy the hosted website.

The updated shared workspace and planner/account integrations require the matching hosted APIs and the migrations `20260910210612_unified_workspace_services.sql` and `20260912010000_shared_live_workspace.sql`. Google Sign-In, Google Calendar, transactional email and hosted AI also require the operator configuration described in `docs/operator-setup-checklist.md` and `docs/google-and-email-setup.md`. Real multi-account hosted verification remains an operator release task; local/mock integration checks do not establish production service readiness.

Learning remains hidden, and Study Music remains removed as requested.
