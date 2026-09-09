# Architecture and trust boundaries

Studyspace uses Next.js App Router, React, TypeScript, CodeMirror 6, Supabase Auth/Postgres/Storage, and a separate TypeScript worker. The original design is an olive/teal writing workspace with Light, Dark, System, and Paper themes; General is the protected default capture collection.

## Private workspaces

The browser owns an immutable working state, an account-scoped recovery draft, and navigation state. CodeMirror retains per-tab editor states, selection, and undo. Edits update the in-memory draft immediately; surrounding UI redraws are deferred briefly during typing. Recovery writes debounce 250 ms and saves debounce 700 ms. A successful save alone produces “Saved”. Failed/conflicting writes retain the draft.

Authenticated saves send changed records and explicit deletions, not every unchanged note. The server authenticates with `getUser`, loads current state through one `read_workspace` SQL snapshot, validates ownership and references, then calls a compare-and-swap transaction. `commit_workspace` locks the workspace revision; stale saves get a conflict rather than last-writer overwrite. Explicit recovery adds differing versions as recovered notes and keeps the saved originals.

Containers and notes are normalized tables with composite owner/parent foreign keys. Authenticated search uses the PostgreSQL full-text index with owner, descendant-container, tag, kind, and date filters; device-only search uses its loaded workspace. Other typed personal objects live in owner-scoped `personal_records`; review events, evidence hashes, and copy baselines are retained there. Direct browser writes to private tables and service RPCs are revoked. The server derives the owner from the session, never from the request body.

The local demo uses an IndexedDB compare-and-swap transaction and no account fiction. It is device storage, not an offline replica of a configured cloud account. Cloud drafts are account-scoped and cleared after successful logout; logout refuses to discard unsaved work silently. No service worker caches private responses.

## Context and evidence

Definitions have stable IDs and subject scopes. Nearest-subject meanings take precedence. A cached trie recognizes the longest phrase with Unicode boundaries; Markdown parsing excludes code, math, and links. The inspector paginates large dictionaries while search still covers all entries. Dictionary and Sources exports are derived from structured records.

Source identities normalize DOI, versioned arXiv IDs, checksum-valid ISBNs, and URLs. Metadata adapters send identifiers, not note bodies. Manual field overrides survive enrichment. Fetching web evidence is explicit and uses DNS-pinned HTTP with public-IP validation at every redirect, byte/time limits, and inert Readability extraction. PDF evidence stores the file checksum, page index, exact quote, and normalized rectangles; coordinates are transformed on rotation and zoom.

## Publication and public files

Publication is a whitelist projection, not a flag on a private note. The preview selects notes plus definitions/sources and optional whole attachments, author annotations, and evidence excerpts. Frontmatter, hidden comments, excluded links, and private reader annotations are removed. Every selected whole file is disclosed explicitly; arbitrary PDFs can contain metadata and should be inspected by the author.

The server recomputes the projection from owner-authorized records and checks the preview fingerprint/revision. Files are copied into a separate private `publication-assets` bucket before the SQL transaction switches the publication pointer. A failed assembly leaves the previous complete version active. Immutable IDs cannot be rebound to another publication. Retries return an already committed snapshot.

Public routes check both publication status and moderator visibility. Public asset delivery checks an explicitly published manifest and streams bytes through the application with `no-store` caching. Unpublish/hide blocks new page/API/asset requests immediately. Already downloaded bytes and an in-progress response cannot be recalled. No public signed URL is issued. Downloads and independent study copies cannot be recalled. Public history contains only published versions, never private autosaves.

## Copies, learning, and AI

A study copy materializes independent note, definition, source, citation, annotation, and permitted file identities. Server-owned lineage records the actual publication/version chain. Generic workspace writes cannot forge or replace that lineage. Text merges use the accepted per-note baseline; metadata merges track per-item baselines for definitions, sources, and evidence. Skipped items retain their older baseline. Note replacements create history checkpoints and changed learning sources mark review content for attention. Chosen file updates are checksum-verified into new private objects, remap references, and flag changed evidence. Accepted upstream paths are rebuilt inside the copy. A full record checkpoint supports undo of the most recent merge while retaining note history.

Review uses a deterministic, versioned `studyspace-1` algorithm, explicit answer reveal, idempotent grade IDs, undo, caps, and timezone-aware views. It is a practical app scheduler, not a claim to implement FSRS/SM-2 or a validated memory model.

AI context is assembled server-side from authorized selected passages, definitions, and evidence. Broad subject scope excludes journals/dreams. The adapter has no tools or mutation privileges. References are validated against supplied IDs. The browser treats partial streams as incomplete, persists completed sessions privately, supports resumable structured quizzes, and requires explicit acceptance of a fresh rewrite. No API key is bundled into the browser and routine logs exclude note/prompt text.

## Background work

`jobs` uses leased claims with `FOR UPDATE SKIP LOCKED`, a 90-second lease, 20-second heartbeats, four attempts, bounded backoff, and cancellation checks at safe boundaries. The worker and web app use the same authorization/validation functions. Job results/status are owner-only. The worker runs outside Vercel request lifetimes; the repository provides its actual entry point and container target. A hosted worker and its restart behavior still need live deployment verification. Idle workers perform a daily storage sweep after at least 72 hours of staging grace. SQL lifecycle locks protect committed references, live jobs, immutable publication versions, and merge undo assets; tombstones prevent new references to objects already claimed for removal. Completed exports expire after seven days by default.
