# Shared workspace and writing corrections

Implemented September 12, 2026. This work is local; the hosted migration and desktop release have not been published.

## Behavior

Shared collections open the same WorkspaceApp and CodeMirror editor as regular collections. Inline folder creation, nested files, drag and drop, context menus, modules, split notes, history, dictionary, source capture, printing, export, and import use the regular implementations. The shared workspace has its own navigation state and a people/permissions button. Returning to the collection list preserves personal workspace state. A focused shared workspace makes the underlying personal workspace inert for keyboard and assistive-technology navigation.

Yjs represents each note as a collaborative text document and other workspace entities as shared maps. The CodeMirror binding merges text edits and provides local undo. The provider sends edits after a short debounce and checks for remote changes every 400 ms while connected (2 seconds offline). This is authenticated HTTP synchronization, not a WebSocket service. State vectors reduce catch-up payloads. Initial downloads use revision-checked chunks; retries cannot combine chunks from different revisions. Concurrent folder moves that form a cycle restore a valid location and notify the user without deleting notes.

Preferences, AI chats, bookmarks, publication ownership records, and personal progress are excluded from the shared document. Selected shared content can be sent to AI only through the existing consent flow. Publishing remains an explicit reviewed snapshot. Shared uploads and downloads use collection access checks; ordinary private note storage remains separate. The desktop bridge forwards the shared API and attachment requests using the signed-in account.

Unacknowledged edits are retained under account/collection-specific browser recovery keys and replayed idempotently on reopening. Revocation removes the shared editor and retains unsent deltas locally; the current session can download note text for recovery. Clearing site storage deletes those local recovery copies. Opening a shared workspace initially requires a connection.

Grammar checks run locally in the existing spelling worker using retext contractions, article and repeated-word plugins, with first-person capitalization support. `im` offers `I'm`, `dont` offers `don't`, `a apple` offers `an`, and `the the` offers `the`. Context grammar suggestions have blue wavy underlines; dictionary spelling suggestions retain red underlines. Correcting one range leaves other underlines mapped in place and supports undo. Code and link destinations are excluded. This is a bounded English grammar checker, not a complete sentence rewriting service.

## Database and API

Apply `supabase/migrations/20260912010000_shared_live_workspace.sql` after the earlier project migrations. It adds RLS-protected document, checkpoint and asset metadata tables; authenticated read/history functions; and server-only initialization, compare-and-swap commit, and upload reservation functions. It creates a private `shared-workspace-assets` storage bucket.

The first open atomically initializes from legacy shared folders, notes, versions and attachment metadata. A revision check rejects a stale seed. Legacy rows are preserved. Old editors cannot mutate legacy nodes after migration to a live document, preventing invisible writes to two different sources of truth.

- `GET /api/shared/live?id=…&offset=…`: authenticated, revision-consistent chunks for initial/recovery downloads.
- `GET /api/shared/live?id=…&revision=…&vector=…`: unchanged response or a Yjs update; large catch-ups request a chunked download.
- `POST /api/shared/live`: authenticated same-origin `{id, update, vector?}`; decode, merge, validate, recheck permission under lock, and commit with revision compare-and-swap. Retries merge against the latest state.
- `POST /api/shared/assets`: authenticated editor upload reservation and signed private upload URL.
- `GET /api/attachments/:id`: membership-protected shared attachment reads, with private-workspace and legacy attachment compatibility.
- `GET /api/shared/history?collection=…&note=…`: membership-protected checkpoints; restoration uses a new normal shared edit.

Document limits are 28 million encoded state characters, a 20 MB snapshot, 1 million characters per note, and the normal workspace entity limits. Hosting providers may impose lower request limits for large imports; split large imports accordingly. Initial downloads are chunked to avoid large response bodies. Uploads allow 50 MB per file, 250 MB reserved per collection, and 100 reservations per hour. Failed reservations count toward those limits until cleaned up. Checkpoints retain the latest 100 collection snapshots, at most one new checkpoint every 30 seconds of commits.

## Verification and release gates

TypeScript and the production Next build passed. Focused unit/integration coverage includes grammar ranges, dictionary suggestions, shared CRDT merging/replay, opposing folder moves, initialization races, server-only RPC grants, owner/editor/viewer/outsider access, revocation, attachment RLS, checkpoints and collection deletion. Browser fixtures exercise real workspace/editor components with three isolated sessions and an in-process Yjs transport: inline nested folders, normal modules, simultaneous typing, viewers, durable recovery, reload navigation, revocation, and spelling/grammar corrections. Desktop bridge tests cover authenticated forwarding and session isolation.

These browser fixtures do not prove hosted Supabase configuration, upload delivery, real AI-provider responses, or network latency. Before public distribution:

1. Apply the migration to staging, with the existing server-only Supabase service credential configured.
2. Deploy this web build. Use designated owner, editor, viewer and unrelated accounts to repeat the browser scenarios against actual Supabase. Check invitation acceptance/revocation, shared images/PDFs, history restoration, import/export and explicit publishing.
3. Exercise offline reconnection and denied writes directly against the hosted endpoints. Verify private notes and personal chats never appear in another user's shared data.
4. Test simultaneous changes inside the same structured module before advertising collaborative whiteboard/module editing. The shared transport merges serialized Markdown; independent code/whiteboard module widgets are not a structured drawing CRDT with shared cursors.
5. Monitor API failure/permission-denial rates, sync latency, CAS contention, document size, checkpoint growth and upload reservations. Log status/codes, never note text or credentials. Load-test the HTTP polling workload before increasing the rollout size.
6. Run a scheduled storage reconciliation job for expired unused upload reservations and orphaned private bucket objects after collection/account deletion; metadata deletion alone does not remove storage objects. Until that operations job is configured, do not claim immediate physical deletion of those objects.
7. Build and distribute the desktop installer after the deployed APIs pass the multi-account checks. The existing installed release does not acquire main-process routing or menu changes through dev-server refresh.

## Rollback

Use the existing `community_release` shared-feature control to disable shared access in an incident. Retain document state, snapshots, and legacy rows. Do not drop the new tables or re-enable old node writes against migrated collections: that would hide live edits from older clients. Re-enable a fixed compatible web build and desktop client after validating access, recovery, and export. Export current document snapshots before any deliberate conversion back to the legacy storage format.

No new grammar API key or paid collaboration service is required. Existing Google, calendar, email and AI operator tasks are listed separately in `operator-setup-checklist.md`.
