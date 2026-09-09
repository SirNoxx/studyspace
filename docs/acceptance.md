# Master-prompt acceptance checklist

This checklist follows the supplied [master prompt](master-build-prompt.md). It is intentionally not a blanket production sign-off. **Implemented** means code exists; **local evidence** means the stated test actually ran locally; **external** means a configured service/deployment is still needed. **Partial** identifies remaining implementation or coverage gaps. No hosted Auth/Storage/AI result is inferred from a local fixture.

Evidence locations: [domain tests](../tests/domain.test.ts), [real PostgreSQL migration/RLS tests](../tests/database.test.ts), [round-trip tests](../tests/roundtrip.test.ts), [consistency tests](../tests/consistency.test.ts), [browser journeys](../e2e), [live identifier smoke results](evidence/metadata-smoke.json), [development timings](evidence/browser-performance.json), [production timings](evidence/browser-performance-production.json), [visual checks](evidence/visual-qa.json), and [screenshots](screenshots). AI screenshot/output fixtures explicitly say the provider was not called. The isolated live Supabase suite is [supplied](../scripts/database-test.ts) but was not run without credentials.

## Organization and writing

- **AC-01 — Implemented; local SQL/domain evidence.** Exactly one General, retry/CAS protection, Start Writing. Actual concurrent hosted first-sign-in still external.
- **AC-02 — Implemented; browser evidence.** Collection/subject dialog, nested hierarchy, colors/icons/approach/dictionary and persisted reload. [WorkspaceDialogs](../src/components/WorkspaceDialogs.tsx).
- **AC-03 — Implemented; browser evidence.** Collection focus filters descendants and All Collections restores the broader tree. [WorkspaceApp](../src/components/WorkspaceApp.tsx).
- **AC-04 — Implemented; partial journey coverage.** CRUD/move/duplicate/archive/trash/restore and cycle checks exist; every nested keyboard permutation has not been exercised. [domain](../src/lib/domain.ts).
- **AC-05 — Implemented; local evidence.** Active state, tabs, CodeMirror state, breadcrumbs and cross-context labels. Complete cursor/scroll behavior across all input methods remains a manual check.
- **AC-06 — Implemented; partial compatibility coverage.** Source/live/reading, Markdown/math/callouts/Unicode, and tested undo across modes/tabs. Physical IME and all nesting/plugin combinations are not verified. [Editor](../src/components/Editor.tsx), [Markdown](../src/components/Markdown.tsx).
- **AC-07 — Implemented; browser evidence.** Debounced acknowledged saves, recovery drafts and failure labels. Full offline-network interruption matrix remains external/browser follow-up. [store](../src/lib/store.ts).
- **AC-08 — Implemented; two-session browser and PostgreSQL evidence.** CAS rejects stale writes; additive recovery retains both edits. [recovery](../src/lib/recovery.ts), [conflict test](../e2e/conflict.spec.ts).
- **AC-09 — Partial.** Upload/view/export, attachment identities and trash/restore exist; interrupted real Storage uploads, live cleanup, and all reference-repair cases need more integration tests. SQL tests cover protected references and rejection of expired staged keys.
- **AC-10 — Implemented; partial manual coverage.** Shortcut settings/conflicts, tree keys, Radix dialogs, Zen/mobile. OS/browser-reserved combinations and physical assistive technology remain unverified.

## Dictionary and evidence

- **AC-11 — Implemented; local browser evidence.** Popup entry creation preserves the active note. Exact selection restoration is not exhaustively tested across editing/reading/IME modes.
- **AC-12 — Implemented.** Alphabetical/creation sorting, global personal aggregation, scope badges, edit/trash. [WorkspaceViews](../src/components/WorkspaceViews.tsx).
- **AC-13 — Implemented; domain evidence.** Longest phrase, subject precedence, Unicode boundaries, code/link/math exclusions. [markdown](../src/lib/markdown.ts).
- **AC-14 — Implemented; browser evidence.** Dictionary shortcut, scoped filtering, keyboard choice, remapping.
- **AC-15 — Implemented; round-trip evidence.** Structured definitions/sources drive managed views and exports; manifest reimport restores structured records. Arbitrary whole-document registry editing is not offered.
- **AC-16 — Implemented; domain/adapter coverage.** Deduplicated source identity, note associations and manual overrides. Full browser sequence for every association-removal case is not automated.
- **AC-17 — Implemented; deterministic adapters and three live identifiers passed.** Crossref/arXiv/Open Library include version/checksum handling. Exhaustive live timeout/429 and incomplete-record permutations remain unverified. [metadata](../src/lib/server/metadata.ts).
- **AC-18 — Implemented; PDF browser evidence.** Citation dialogs, checksum/page/rectangles, zoom/rotation and retained highlights. Replacement-byte behavior has domain guards; a full real Storage replacement journey is outstanding. [PdfViewer](../src/components/study/PdfViewer.tsx).
- **AC-19 — Partial.** Explicit guarded Readability extraction, saved quotes/hashes and manual fallback exist. Reopening changed web content and comprehensive automatic reattachment need more work/tests.

## Capture and migration

- **AC-20 — Implemented; browser/domain evidence.** General Quick Note, interrupted popup draft, stable ID movement.
- **AC-21 — Implemented; timezone/DST domain evidence.** Idempotent main journal, extra entries, selected dates and timezone.
- **AC-22 — Implemented.** Multiple dreams, Markdown/templates/metadata and default AI/publication exclusion. Optional dream-field UI is template-based.
- **AC-23 — Implemented; browser/domain evidence.** Markdown/multiple/directory/ZIP import and hierarchy.
- **AC-24 — Partial.** Wikilinks/aliases/relative assets, one-level embeds, heading/block markers, Unicode, duplicate-path diagnostics. Recursive transclusion and exhaustive heading/block navigation combinations are not supported/verified.
- **AC-25 — Implemented; fixture evidence.** Verbatim unknown frontmatter/plugin text, inert Dataview/code, excluded `.obsidian` configuration.
- **AC-26 — Implemented; partial attack coverage.** ZIP directory validation, traversal/symlink/encryption/ratio/size/encoding checks, collision/missing-asset reports. Expand malformed-archive fuzzing before launch. [transfer](../src/lib/transfer.ts).
- **AC-27 — Partial.** Reimport dedup, atomic local workspace mutation, durable cloud jobs and boundary cancellation exist. Interrupted staging is reconciled by the worker after a grace period; actual hosted interruption/cleanup rehearsal remains outstanding.
- **AC-28 — Local round-trip passed; external account/service restore outstanding.** Typed records, paths, sources/dictionary and active file checksums reconnect in a fresh domain workspace. Full backup includes trashed file bytes and preserves trash state.

## Publication and privacy

- **AC-29 — SQL isolation passed; real-service access tests external.** RLS/grants and owner path policies are tested in actual PostgreSQL with auth/storage scaffolding. Real Auth/Storage direct API checks require the isolated Supabase suite.
- **AC-30 — Implemented; privacy projection tests.** Frontmatter/comments/private links/private annotations excluded; files/evidence/author annotations are explicit opt-in. Full hosted HTML/search/export/AI adversarial matrix remains outstanding.
- **AC-31 — Implemented; domain/SQL evidence.** Immutable public versions, explicit updates and public-only version diffs. [VersionHistory](../src/components/study/VersionHistory.tsx).
- **AC-32 — Implemented; transaction evidence.** Reviewed fingerprint/revision, assembled candidates, atomic pointer, idempotent version identity; failure retains the previous version. Worker crash during a real upload remains external.
- **AC-33 — Implemented; SQL unpublish evidence.** No-store public routes and controlled file streaming recheck availability. Live edge-cache/revocation testing is external.
- **AC-34 — Implemented server gates and export test.** Copy/download/Q&A flags checked at dedicated routes. Public ZIP downloads stream permitted files with verified checksums and portable links; large/file-bearing copies use durable jobs. Cross-account live enforcement remains external.
- **AC-35 — Implemented.** Anonymous Discover/reader, chosen author display fields, public counts/snippets and sign-in routes. Public content visual journey requires a configured publication. [Discover](../src/components/Discover.tsx), [PublicReader](../src/components/PublicReader.tsx).

## Copies, conversation, and learning

- **AC-36 — Implemented; domain evidence.** Independent mapped notes/definitions/sources/anchors/author annotations/allowed bytes. Actual file-service copying is external. [study-copy](../src/lib/study-copy.ts).
- **AC-37 — Implemented server-owned ancestry.** Copy lineage derives from stored versions, generic saves cannot forge it. A complete hosted A→B→C journey is not yet verified.
- **AC-38 — Implemented; local merge tests.** Notes, dictionary/source/citation metadata, and binary records use accepted baselines. Selected file versions copy with checksum verification, and accepted path moves reconstruct nested folders within the copy. Hosted file-service verification is external.
- **AC-39 — Implemented; local tests.** Non-overlapping text merge, explicit conflicts, per-item keep/skip/accept and independent file staging. [MergeReview](../src/components/study/MergeReview.tsx), [merge-records](../src/lib/merge-records.ts).
- **AC-40 — Implemented; local checkpoint tests.** Revision/fingerprint invalidation, transactional cloud merge, and last-merge undo covering mapped notes, definitions, sources, anchors, files, and accepted baselines. Note history retains subsequent text; deliberately kept-both copies remain independent.
- **AC-41 — Implemented boundaries.** Author/private annotations, public Q&A and participant-only requests have separate records/projection. Full visibility/export matrix is not live-tested.
- **AC-42 — Implemented with partial journey coverage.** Version IDs, quote context, safe/ambiguous/unresolved matching, clickable passage selection, and original-version links exist. Comprehensive reattachment across arbitrary edits remains unverified. [anchors](../src/lib/anchors.ts).
- **AC-43 — Implemented SQL boundaries/events.** Participant/moderator request policy, locked idempotent replies and unique notifications. Full email/push transport is not configured; notifications are in-app.
- **AC-44 — Implemented.** Explicit editable personal enrollment and answer reveal. Full copy-restriction edge cases require further tests.
- **AC-45 — Implemented; deterministic domain/browser evidence.** Grades/idempotency, undo, suspend/reschedule, caps, timezone and daily/weekly views.
- **AC-46 — Implemented.** Source/definition edits mark selected learning content changed without resetting schedules. Broader upstream propagation cases need more regression coverage.

## AI

- **AC-47 — Real adapter implemented; live calls externally blocked.** All five task IDs use Responses streaming; rewrite/quiz UI fixtures are labeled. No live AI key/model was configured.
- **AC-48 — Implemented; context authorization tests.** Owner-loaded records, scoped passages, broad journal/dream exclusion and explicit sensitive-note permission. [server AI](../src/lib/server/ai.ts).
- **AC-49 — Implemented; reference tests.** IDs validated, unavailable references labeled and evidence retained. Factual correctness of arbitrary model prose still requires human review.
- **AC-50 — Implemented capability boundary.** Retrieved material is data; the adapter has no tools/network/mutation powers. No prompt-injection benchmark against a live model was run.
- **AC-51 — Implemented; fixture/domain evidence.** Explicit reject/append/replace/new note, freshness guards and history. Additional stale-selection browser tests are desirable.
- **AC-52 — Implemented; browser fixture passed.** Hidden answers, persisted private responses/assessment, resume, and opt-in editable review enrollment. [QuizSession](../src/components/study/QuizSession.tsx).
- **AC-53 — Implemented error/cancel/partial/quota guards.** Incomplete NDJSON is not applyable. Missing configuration is real; live provider timeout/rate-limit testing remains external.
- **AC-54 — Implemented.** Private session deletion/export and content-free routine logs; deployed log sinks/retention are not configured.

## Production

- **AC-55 — PostgreSQL role/RLS/foreign-key evidence; live auth/storage matrix external.** Moderator assignment and service RPC grants are restricted. Supabase suite supplied separately.
- **AC-56 — Implemented guards; partial adversarial coverage.** Safe Markdown URLs/no raw HTML, strict Mermaid, inert imports, DNS/redirect IP checks and ZIP checks. Real rebinding/redirect fuzzing and a broader security review remain outstanding.
- **AC-57 — Implemented account-scoped drafts/no-store routes.** Logout protects unsaved drafts and clears account cache. Full browser-back/account-switch live-session matrix remains external.
- **AC-58 — Implemented durable worker; local SQL reclaim test passed.** Actual hosted process restart, cancellation, and storage side-effect rehearsal remain external.
- **AC-59 — Local Chromium inspection.** Desktop Light/Dark/Paper, mobile and dialogs, WCAG tagged axe checks and captured tablet/wide views. Physical screen reader, actual browser 200% zoom, Safari/Firefox and complete touch/IME coverage remain outstanding.
- **AC-60 — Measured, not fully passed.** 10,000 notes/3,000 terms, paginated tree/inspector, cached trie, deferred redraw and delta saves. Production Chromium measured typing frame p50 8.9 ms, p95 17.9 ms (16 ms target), and cached switching including Playwright 169 ms (200 ms target). These are synthetic local-device timings; the typing tail still exceeds target. Indexed owner-scoped network search is wired and SQL-tested; hosted latency is unmeasured.
- **AC-61 — Implemented; PostgreSQL moderation tests.** Role-gated report queue, transactional hide/restore, audit. Live moderator browser journey is external.
- **AC-62 — Local typecheck/tests/build/start verified.** Lockfile, migration tests, safe optional seed, Vercel/Docker configurations and README supplied. Docker/clean hosted migration/seed are not claimed tested.
- **AC-63 — Partial.** Actual PGlite dump/reload and storage-byte backup/restore scripts exist. An isolated real database-plus-Storage/Auth restore and deletion rehearsal need credentials/runtime.
- **AC-64 — This checklist distinguishes code, actual local/live evidence, external dependencies, and known unfinished work.** The application is runnable, but the entire production acceptance contract is **not complete**.

## Remaining release work

Remaining work includes stronger web/paragraph reattachment for arbitrary edits and the broad compatibility, accessibility, security, performance, and hosted-service verification matrices. Binary/path merges and undo, indexed search, storage reconciliation, and trash-file backup fidelity have implementations and targeted local tests; they still require real-service rehearsals. External blockers are Supabase credentials plus an isolated service project, AI key/model, Docker/worker hosting, deployment authorization, monitoring/billing choices, and actual operator/legal/retention configuration. These are not labeled as “coming soon” app successes or hidden from the build report.
