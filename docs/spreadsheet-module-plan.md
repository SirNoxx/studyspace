# Studyspace Sheets — production implementation proposal

Status: implementation started after approval, September 21–22, 2026. The user approved free Studyspace accessibility controls around the open-source engine. See [implementation and release status](spreadsheet-module-implementation.md) for delivered behavior, verification, setup and remaining release gates. The sections below preserve the reviewed proposal.

## 1. Product decision and scope

Build Studyspace Sheets: a locally stored spreadsheet module embedded in notes, with a dedicated expanded editor. Excel-compatible files are the interchange format; Microsoft Excel itself is not embedded.

- First production release: multiple worksheets; editable cells; row and column insertion, deletion, movement, resizing and labels; rich formatting; borders and fills; collapsible groups; basic formulas; local autosave; XLSX/CSV/TSV import and export; printing; accessible keyboard interaction.

- Keep the lightweight Table module for simple notes. Offer an explicit Convert to spreadsheet action with preview and undo. Existing tables must retain their current rendering and editing behavior.

- Do not promise all of Excel. VBA, macros, Power Query, external data connections, arbitrary add-ins, full pivot-table compatibility and complete formula parity are outside this release. Unsupported content must be disclosed before conversion.

- No Microsoft subscription, Google developer account, API key or file-upload service is required for the proposed core feature. A live connection to private Google Sheets or OneDrive is a separate future integration.

## 2. Editing experience

Insert using Modules → Spreadsheet or right-click → Add a module → Spreadsheet. Start blank, import a file, or choose a study-oriented template.

- Module header: editable title, save status, Expand button and existing three-dot menu. The embedded grid has a contained scrolling area and resizable height. Expanded mode uses the note area, preserves selection and scroll position, and returns to the same module.

- Grid: single-cell and rectangular selection, Shift-selection, multi-cell paste, drag fill, copy/cut/paste, clear contents versus delete cells, find/replace, undo/redo, frozen headers, sorting and filtering. Structural changes update references rather than detaching formulas from their intended data.

- Rename rows and columns through visible custom labels such as Topic, Hours or Week 1. Retain A/B/C and 1/2/3 as stable positional addresses for Excel-style formulas. Labels are separate metadata, and sheet tabs can be renamed independently.

- Formatting toolbar: font family from bundled/system fonts, font size, bold, italic, underline, strikethrough, text color, background fill, border sides/weight/style, horizontal and vertical alignment, wrapping, number/date/currency/percentage formats, merge/unmerge and clear formatting. Include reusable restrained style presets and accessible color controls.

- Whole-cell formatting applies to a selection of cells; partial-text formatting applies while editing text inside one cell. Formula cells preserve formula semantics. Provide a DOM text editor so spelling, text selection and Studyspace actions can work even if the grid renderer uses canvas.

- Right-click menus adapt to cells, row headers, column headers and groups. Selected text exposes Create definition, Create study card, Insert or edit link / definition and Add to Chat. Study actions use an explicit selection and the existing context-sharing settings.

## 3. Collapsible groups

Support named, nested groups of contiguous rows or columns, with disclosure arrows and optional summary rows. Collapsing changes visibility, never deletes data.

- Select rows or columns → Group → name the group. Provide collapse/expand, expand all, collapse all, rename and ungroup. Disallow partially overlapping groups; permit full nesting. Keep manually hidden, filtered and group-hidden states distinct.

- Collapsing a selected rectangle cannot hide only those cells without leaving holes in a spreadsheet. Offer Group these rows, Group these columns, or Save as named range. Named ranges provide navigation and study actions; they do not hide unrelated neighboring cells.

- Update group boundaries after inserts, deletes and moves; undo restores membership. Child collapsed states survive collapsing and reopening a parent. Formulas still include collapsed cells unless a specific function has different documented behavior.

- Persist group definitions with the workbook and per-user expanded/collapsed view state separately for shared workbooks. Excel exports use supported outline metadata; Studyspace-specific group names or labels also remain in the native backup format.

## 4. Engine and licensing decision

Preferred candidate: Univer’s open-source spreadsheet core behind a Studyspace adapter, with ExcelJS for local XLSX conversion. This recommendation is conditional on a technical feasibility gate, not a completed library evaluation.

- Univer’s repository identifies an Apache-2.0 open-source core, but its packaged import/export and outline features are Pro capabilities. Do not accidentally include Pro packages or assume all demo features are free. Check exact package licenses and transitive dependencies before adoption.

- Use ExcelJS as a candidate local reader/writer with an explicit mapping into Studyspace’s workbook schema. ExcelJS does not calculate formulas; formula evaluation belongs to the spreadsheet engine. Conversion fidelity must be tested feature by feature.

- Build Studyspace-owned grouping over public row/column visibility and command APIs only if the engine supports reliable nested groups, undo, reference updates and accessible controls. Do not copy commercial implementation code.

- Gate before commitment: prove inline and expanded editing, offline reload, rich text, group behavior, worker-compatible import, two simultaneous note panes, screen-reader editing and a representative XLSX round trip. Check bundle cost, memory disposal and dependency maintenance.

- If the candidate fails, return an explicit engine comparison and revised scope/cost for review. A bespoke grid/formula engine or a paid component is a materially different project, not an automatic fallback.

## 5. Imports, exports and compatibility

All first-release conversion runs on the user’s device. Import is a staged operation: inspect → select worksheets → review compatibility → create a new workbook.

- Excel: import .xlsx through the file picker or drag-and-drop. Google Sheets: download as Excel (.xlsx), then import; alternatively paste a selected range as TSV. A pasted private Sheets URL remains a source link, not an authenticated import or live synchronization.

- CSV/TSV imports show a preview with delimiter, encoding, header and type choices. Preserve leading zeros and identifiers as text by default when ambiguous. Let users select values-only or supported formulas, and display date-system and locale conversions explicitly.

- Compatibility baseline: text/numbers/booleans/dates, supported formulas, fonts, fills, borders, alignment, wrapping, merged cells, row/column dimensions, worksheets and supported outlines. Verify each against fixtures generated by Excel and Google Sheets.

- Preserve original files locally and show sheet/cell-level warnings for unsupported features. Unsupported formulas retain their source and, when available, a clearly marked cached result; never report an old cached result as a recalculated answer. No silent dropping of sheets or truncation to size limits.

- Initial unsupported formats: legacy .xls, encrypted workbooks and macro-enabled .xlsm. Explain how to save a standard .xlsx copy. Imported macros, external connections and scripts never execute.

- Export full workbooks as .xlsx, individual sheets as CSV/TSV, and native Studyspace workbooks for complete fidelity. Offer print/PDF with page orientation, repeat headers and fit-to-width. Native bundles preserve custom labels, links to definitions and group names that may not round-trip through Excel.

- Before publication, show exactly which sheets/ranges will be shared. Hidden and collapsed content is still data: exclude unselected private sheets and either include disclosed formula dependencies or export selected calculated values.

## 6. Data model and integration

Store workbooks as separate versioned resources. A note’s spreadsheet module contains a workbook reference and display options, rather than rewriting the entire workbook as Markdown JSON on each keystroke.

- Workbook record: stable ID, schema version, title, owner/scope, ordered worksheets, style registry, revision and provenance. Worksheets contain stable row/column identities and order, optional labels, sparse cells, dimensions, merges, groups, named ranges and freeze settings.

- Cells store typed source value or formula, optional rich-text runs, style reference, annotation/definition links and cached calculation metadata. Separate source values from calculated results and user-specific view state. Formula parsing/reference rewriting must have a single authoritative adapter.

- Use one command boundary for cell edits, range formatting, structural changes and imports. Commands validate invariants, create undo entries, persist changes and notify the engine. Do not maintain two independently editable engine/native snapshots.

- Local persistence: add IndexedDB workbook, operation-journal and snapshot stores with a versioned migration. Persist commands transactionally; mark Saved only after durable completion. Recover pending local edits after crashes and handle quota failures with export/retry instead of discarding edits.

- References require lifecycle rules: duplicating a note clones its workbook by default; explicit linked views share one workbook. Moving a note across private/shared scopes copies resources only with a clear action. Trash retains referenced workbooks through the recovery period; garbage collection checks live references and retained revisions.

- Workspace backup/restore, note duplication, version history, search indexing, print, publish and import/export must understand workbook references. Plain Markdown exports include a readable preview plus a relative workbook attachment; full workspace bundles contain the actual workbook resources.

- Proposed integration points: modules.ts and NoteModule.tsx for registration; a new SpreadsheetModule and engine adapter; workbook schema/commands/store modules; an import worker; transfer and backup adapters; shared/document.ts and shared/session.ts for workbook collaboration.

## 7. Formulas and shared editing

Local editing ships first. Shared spreadsheet editing is enabled only after cell-level collaboration and permission tests pass; text-note collaboration alone does not establish spreadsheet correctness.

- Initial formula acceptance set: arithmetic, ranges, relative/absolute references, same-workbook cross-sheet references, SUM, AVERAGE, MIN, MAX, COUNT, IF and basic text/date operations. Publish the tested function list. Handle cycles, deleted references and calculation errors visibly.

- Apply runtime and dependency limits to recalculation. Block network-fetching functions, external workbook connections and executable expressions. Formula evaluation never uses JavaScript eval or desktop process execution.

- Studyspace already uses Yjs for shared note text. Add structured workbook operations with stable cell identities rather than merging serialized workbook JSON inside note text. Per-cell writes, formatting changes and structural operations need deterministic conflict rules.

- Concurrent edits to different cells must both survive. Same-cell competing edits require retained alternatives/history and a visible conflict/recovery affordance; silent last-write-wins is insufficient. Concurrent deletion versus editing must retain recoverable content. Undo must not erase another user’s later change.

- Enforce collection membership and Owner/Editor/Viewer roles server-side on workbook reads, writes, snapshots, imports and subscriptions. Revoke access promptly; reject queued writes after revocation. Retain a local recovery copy of unsent edits without automatically republishing them.

- Introduce separate authorized workbook endpoints for snapshots and operation batches, with idempotency keys, bounded payloads and replay protection. Keep existing private local work local. Do not route large workbook data through the current whole-workspace save path.

## 8. Performance, accessibility and failure states

Treat the spreadsheet as an independently loaded editor so ordinary notes remain fast. The following are proposed acceptance budgets to validate on documented reference hardware, not measured performance claims.

- Virtualize rows/columns, load the engine only when a spreadsheet is opened, suspend offscreen editors and dispose listeners/workers on unmount. Use workers for import and, where the engine supports it, recalculation. Narrow layouts offer expanded mode without clipping the note sidebar.

- Initial guardrails to benchmark: 10 MB compressed XLSX, 100 MB total inflated archive data, 20 worksheets and 100,000 populated cells per workbook. Also cap dimensions, formulas, styles, XML depth and archive entries. These are import safety limits, not promises of Excel-scale capacity.

- Targets on the agreed desktop fixture: under 100 ms p95 edit feedback, usable editor within 2 seconds for a 10,000-populated-cell workbook, and responsive cancel/progress during import. Tune limits downward before release if measurements miss the targets.

- Keyboard: arrows, Tab/Shift-Tab, Enter, Escape, F2, range selection, shortcuts and context-menu key. Announce cell address, label, value and formatting; give groups accessible expanded state and preserve focus after structural edits. Verify NVDA/Edge and keyboard-only flows; a canvas-only inaccessible grid is a release blocker.

- Explicit states: editor loading, blank workbook, import progress/cancel, partial compatibility, saving, saved locally, offline, unsynced shared edits, conflict, quota exceeded, corrupted file and permission revoked. Never show Saved merely because a debounce timer fired.

- Parse untrusted files with resource limits, safe hyperlink schemes and escaped text rendering. Treat leading formula-like text safely in CSV exports. Retain local originals; no spreadsheet content or filenames in telemetry.

## 9. Delivery stages and release gates

Each stage produces a demonstrable result and must meet its gate before the next release surface is enabled. Estimate delivery dates after the engine spike rather than treating Excel parity as a small table enhancement.

- Stage 0 — feasibility and contract: pin candidate packages; verify licenses; demonstrate the engine gate, schema and conversion fixtures. Deliver a capability matrix and measured performance. Exit only with an accepted engine decision.

- Stage 1 — local editing: module insertion, expanded view, worksheet tabs, row/column labels and operations, rich formatting, formulas, nested groups, autosave, undo and crash recovery. Gate: all requested core interactions survive reload and work in the packaged desktop app with network disconnected.

- Stage 2 — interoperability and Studyspace integration: XLSX/CSV/TSV, compatibility report, native backups, table conversion, study actions, read-only rendering and print/PDF. Gate: supported fixture fields round-trip without loss, unsupported fields produce actionable reports, and existing notes/tables remain unchanged.

- Stage 3 — collaboration: structured shared operations, presence, authorization, conflict recovery and disconnect/reconnect. Gate: multi-account tests prove viewers cannot write, revoked users cannot rejoin, independent edits survive, same-cell conflicts are recoverable and retries do not duplicate actions.

- Stage 4 — production rollout: local opt-in beta, broader desktop/web rollout, then shared editing after its independent gate. Monitor aggregate import failures, save failures, worker crashes and editor latency without collecting cell content.

- Rollback: independent flags for editor, conversion and shared writing. Preserve workbook records and migrations; disable writes while retaining read-only preview and native export. Verify the previous build handles unknown spreadsheet modules without deleting their references.

## 10. Verification and decisions for review

Recommended review baseline: a dedicated module, no external API dependency, XLSX plus CSV/TSV interoperability, named row/column groups, and an open-source-first engine spike.

- Automated coverage: command/property tests for insert/delete/move/reference rewriting; nested group and undo invariants; typed values and locale/date fixtures; Excel/Google export round trips; crash/quota recovery; malicious and oversized files; multiple open notes; upgrade and backup restoration.

- Manual acceptance journey: insert spreadsheet → name columns Topic and Hours → format cells → group rows and collapse/reopen → import an Excel/Google-exported workbook → close and reopen Studyspace offline → export to Excel and compare supported content → print a selected range.

- Inspect repository facts separately from proposed design: existing Table module is capped at 12 columns and 100 rows; modules serialize JSON into note code blocks; local workspaces use IndexedDB; shared note bodies use Y.Text; remote workspace saves include a 4 MB compressed request guard. These observations motivate a separate workbook resource.

- Review choices: accept the proposed formula subset and compatibility boundaries; confirm full-screen editing alongside embedded mode; retain local-only operation as the default. Paid licensing, live Google/Microsoft synchronization, pivots and advanced charts require separate scope decisions.

- User setup for the recommended first release: none. For implementation QA, a few representative, non-sensitive Excel or Google-exported files would help validate real workflows. No spreadsheet feature has been implemented by this planning task.

## Technical sources

- [Univer open-source repository and license](https://github.com/dream-num/univer) — Core license and separation from Pro capabilities.
- [Univer import/export documentation](https://docs.univer.ai/en-US/guides/sheets/features/import-export) — Packaged conversion is a Pro/server path; the proposed local adapter is separate engineering work.
- [Univer outline API](https://docs.univer.ai/ko-KR/reference/facade/outline) — Row/column outline APIs are marked Pro.
- [ExcelJS technical documentation](https://github.com/exceljs/exceljs/blob/master/README.md) — Local workbook tooling, styles and rich text; formula results must be supplied by a calculation engine.
- [ExcelJS license](https://github.com/exceljs/exceljs/blob/master/LICENSE) — MIT license; verify the exact adopted package and dependency versions.
- [Google Sheets export instructions](https://support.google.com/docs/answer/9330963?hl=en) — User-driven download/export supports the proposed API-free import workflow.
