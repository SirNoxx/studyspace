# Studyspace 2.0

Version 2.0.0 brings richer notes, better workspace navigation, and a connected study community.

## Writing and organization

- Add calendar, Cornell notes, paper, table, chart, Venn diagram, formatted list, and to-do modules from the note toolbar or right-click menu. Charts include editable values, labels, and candlesticks.
- Draw with a whiteboard, including pen, brush, highlighter, eraser, colors, and navigation controls. Title, collapse, save, and manage code blocks and whiteboards.
- Run JavaScript, TypeScript, Python, C, C++, and SQLite locally in isolated browser runtimes. Preview HTML/CSS and validate JSON. Each run gets a fresh execution environment; no host operating-system access is provided.
- Open notes side by side, select which pane new files replace, navigate backward and forward, and scroll overflowing open-file tabs.
- Keep quick notes separate from collections, move regular notes into Quick Notes, and pin notes at the top of the sidebar.
- Reorder collections, folders, and files with visible drop indicators and nested folders. Focus collections with clearer navigation and collection-specific content counters.
- Browse ten original public journal templates. The guided introduction follows the interface with a dimmed background.

## Study assistant

- Persistent chat history, note/folder study context, summaries, and study cards with easy, medium, and hard difficulty.
- A Study Tools menu, sidebar-based material selection, optional personality instructions, and Add to Chat for selected text and code.
- Read generated answers at your own pace, with an explicit jump-to-bottom button. Failed requests preserve recoverable messages.
- YouTube transcript links and transcript reuse when the configured transcript service can retrieve captions.

## Connected community

- Editable profiles with biography, interests, social links, public/private visibility, and separate message-request preferences.
- Discover feeds, people/topics, publications, saves, comments, and private owner statistics.
- Shared collection invitations, Owner/Editor/Viewer permissions, version recovery, conflict detection, and attachment access enforcement.
- Private conversation requests, accept/decline/ignore controls, blocking/reporting, unread counts, and retry-safe delivery.
- Publishing now uses an expandable collection/folder/file picker with nested branches, search, file counts, and a separate privacy review before publication.

Community and AI features require a configured hosted Studyspace deployment and sign-in. The bundled local workspace remains local; installing this desktop release does not deploy a hosted server or automatically publish private work. Configure the hosted app address in desktop Settings. See [community operations and release controls](community-release.md) and [database setup](public-database-setup.md).

## Windows installation and updates

Download `Studyspace-Setup-2.0.0-x64.exe` from the GitHub release. The installer includes the local web application and language runtimes. Existing installations use the same app identity and data location; wait for notes to finish saving and close Studyspace before installing. Workspace exports remain useful backups.

The release includes the installer, its differential-update blockmap, `latest.yml`, and `SHA256SUMS.txt`. Automatic updates require the complete matching artifact set. Windows signing is not configured, so this installer is unsigned.

The native window shows a bundled loading screen while the workspace starts. Startup failures remain visible and closable.

## Release validation

TypeScript, 114 unit tests, 9 desktop tests, and 19 production browser checks passed. Packaged startup, save-before-close, restart persistence, renderer isolation, settings, and updater checks passed. The updater test downloaded the actual installer and rejected a corrupt checksum without installing it. One initial browser request exhausted Windows buffers during concurrent packaging; its isolated rerun passed. See [release evidence](evidence/studyspace-2.0.0.json).
