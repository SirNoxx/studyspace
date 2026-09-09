# Using Studyspace

## Write and organize

Start Writing creates a note in General. The plus beside Collections opens the collection/subject dialog: choose name, parent, color, icon, learning approach, and optional dictionary. Folders organize files; subjects provide learning context. Click a collection name to focus it. All Collections returns to the wider tree.

Notes support Source, Live, and Reading modes. Live mode keeps editable Markdown with syntax styling; Reading renders tables, tasks, math, callouts, diagrams, links, and dictionary terms. Rename through the title or F2 in the tree. The action menu provides move, duplicate, archive, trash, restore, and export. Tabs retain editor state and can be pinned/reordered. Settings controls theme, writing typography, shortcuts, and study preferences. On small screens the explorer/inspector become dismissible panels. Zen restores the preceding panel state.

## Capture and recover

Quick Note defaults to General even while another collection is focused; its draft survives closing the popup. Journal Today creates one main entry for the selected local date. Extra journal entries are explicit; Dream Journal allows multiple dreams. Configure templates and timezone in Settings. Journals/dreams are excluded from broad automatic AI context and default publication selection.

Wait for Saved before assuming a save completed. Failure/conflict retains a draft. **Keep both versions & resume saving** preserves the saved original and adds differing recovered notes. Backup export and reload are also available. Device storage is not a cloud backup.

## Definitions, sources, and evidence

Select a phrase and Add definition without replacing the active note. Add aliases, choose its subject, and edit Markdown. Click an underlined phrase for its meaning. The global dictionary aggregates personal definitions; alphabetical/creation sorting and the dictionary palette support lookup.

Pasted URLs and bibliographic identifiers become Sources when auto-capture is enabled. Repeated identifiers deduplicate. Provider refresh preserves manually overridden fields. Metadata enrichment does not mean the linked article has been read.

Upload a PDF, select text or draw a region, then save its quote/description. Evidence retains file checksum, page, and normalized coordinates. Zoom/rotation transforms those coordinates; different file bytes do not silently reuse them. The citation dialog opens the original passage. Explicit web extraction lets you save selected excerpts; when retrieval fails, enter a manual excerpt. This is an extracted reader, not a live embedded website.

## Import and export

Import accepts individual/multiple Markdown files, folders, and ZIP vaults. Review files, warnings, exclusions, and destination. Original files remain untouched; executable/plugin configuration stays inert/excluded. Cloud imports run through the worker, local imports on the device. See [compatibility](compatibility.md).

Export a note, collection, or full backup from menus or Settings → Data. Cloud collection/backups are queued; `/w/jobs` provides the completed download. Archives contain Markdown, derived Dictionary/Sources files, the app manifest, and verified attachment bytes. Backups contain private material.

## Publish and study

Publish opens a selection manifest and rendered preview. Choose notes, definitions, and sources; whole attachments, evidence, and author annotations require explicit selection. Private annotations never become public. Inspect a chosen PDF in full: publication includes all its bytes and embedded metadata.

Choose copy/download/Q&A permissions. Publishing creates an immutable version; private edits do not change it. Publish Updates creates a new reviewed version. Larger assemblies use the worker and leave the previous complete version active until success. Unpublish blocks new public requests; it cannot recall downloaded material or independent copies.

Anonymous readers can use Discover and public pages. Sign in for bookmarks, progress, private study notes, public questions, clarification requests, and permitted copies. Questions retain their publication version and passage state. Clarification requests are visible to participants and authorized moderators; reports enter the moderator queue.

Library → Check updates compares independent study copies against accepted upstream baselines. Review notes, definitions, source records, and evidence; keep mine, accept upstream, keep both, or skip. Text conflicts also allow an edited resolution. Skipped items retain older baselines. Concurrent changes invalidate the preview. Selected new/replaced files copy independently with checksum verification; accepted path changes stay inside your collection. Undo last merge restores the previous note, metadata, file mappings, and accepted baselines.

## Review and AI

Need to Review opens an editable question/answer before enrollment. Reveal intentionally, then grade Again/Hard/Good/Easy. Daily/weekly views, caps, suspend, reschedule, undo, and removal are personal. Source edits flag changed content without resetting learning history.

The AI inspector offers summary, fuller explanation/rewrite, quiz, next-learning suggestions, and clarification. Choose a scope, consent to sharing, then start explicitly. Missing configuration is reported; no fake provider output is substituted. Partial output cannot be accepted. Completed rewrites can be rejected, saved separately, appended, or replace a fresh selected passage/note. Quizzes retain private responses and reveal answers on demand. Only a selected missed question becomes an editable review card. Evidence links open supplied context. Delete sessions in the inspector; full backups include AI history.
