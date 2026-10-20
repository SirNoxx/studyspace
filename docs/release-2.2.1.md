# Studyspace 2.2.1

## Fixes and improvements

- Pasting checklist lines beginning with `[ ]`, `[]`, `-[]`, `- []` or `- [ ]` creates circular checkboxes in Live Preview. Rich-text paste no longer leaves escaped bracket characters in front of checklist items.
- Existing notes containing bare checklist lines or escaped spaced brackets also display as checkboxes; no reimport is needed. Checking an item saves a standard Markdown task marker. Reading mode reflects its checked state.
- Code examples, ordinary links, inline bracket text and frontmatter remain unchanged.
- Notes now fill 90% of their available writing pane with equal margins, including narrow windows and split panes. Sidebars remain accessible.

## Install

Close Studyspace and run **Studyspace-Setup-2.2.1-x64.exe**. The application identity and existing desktop data directory are unchanged. Keep a workspace backup when upgrading. Browser workspaces remain separate from desktop storage.

This Windows x64 installer is unsigned, so Windows may show an unknown-publisher warning. `SHA256SUMS.txt` contains the installer and updater checksums. This patch does not deploy or configure hosted services.

## Verification

- Production build and TypeScript checks passed, along with 220 unit/database tests and 17 desktop tests.
- Five browser tests passed, covering checklist shortcuts, rich-text paste, saved bracket lines, undo/redo, persistence, and 90% note widths at 390–1920 pixels.
- The packaged Windows app passed the reported checklist scenario, Reading mode, saving/reloading, and note-width checks. Packaged startup and immediate-close save/reopen checks also passed using isolated profiles.
- The installer is not executed by these checks; an in-place upgrade is not certified. This patch does not change the application identity, storage path or workspace data schema.
- The updater verified the actual installer and rejected a corrupt checksum. Checksums and verification details are recorded in `SHA256SUMS.txt` and `docs/evidence/release-2.2.1.json`.
