# Studyspace Sheets implementation

Implemented September 21–22, 2026. Local modules are available by choosing **Modules → Spreadsheet**, or **Add a module → Spreadsheet** in a note's context menu. The existing Table module has a separate conversion action. No paid component or external spreadsheet API is required.

## Available behavior

- Blank sheets and three study templates; multiple worksheets; custom row/column labels alongside stable A1 addresses; insert/delete/move/resize controls; keyboard cell navigation and rectangular range selection through the address field.
- A default DOM grid with named controls, cell text editing, spelling and Studyspace selection actions. The optional visual grid uses Univer. Expanded mode preserves the engine, supports Escape, and contains keyboard focus.
- Cell and substring formatting, fonts, sizes, colors, borders, alignment, wrapping, number formats, merge/unmerge, clipboard ranges, find/replace, sorting, filtering, frozen panes and named ranges. Selected text exposes the existing definition, study-card, link and chat actions.
- Named row/column groups, nesting, rename, collapse/expand all and ungroup. Collapsed content remains in the workbook. Imported/exported Excel outlines are supported. Shared group disclosure is stored per person, separately from shared cell content.
- On-device XLSX/CSV/TSV/native conversion in a cancellable worker; worksheet selection and compatibility warnings before replacement; original import download; Excel, CSV/TSV and native backup export. CSV preserves leading-zero identifiers as text by default. Google Sheets works through **File → Download → Microsoft Excel (.xlsx)** or clipboard ranges.
- Print/PDF for the used worksheet or selected range, orientation, fit-to-width layout and optional repeating first row. Printing is independent of the editor's virtual viewport.
- Explicit selected-value previews for note search, AI context and publishing. Publishing converts that preview to ordinary Markdown and excludes workbook IDs, formulas, unselected sheets and seed data. Users must choose a preview before publishing a note containing a workbook.

## Resource ownership and recovery

Markdown contains a versioned workbook reference, not the full workbook on every edit. IndexedDB `studyspace-sheets-v1` version 2 holds separate `workbooks`, `history`, `originals` and `recovery` stores. Keys include the workspace/account scope. Notes copied to another note clone their workbook when opened. Trash/unused references retain their resource; this release does not automatically garbage-collect data.

Local saves use revision comparisons and a transaction containing the workbook and prior version. The last 19 previous revisions are retained. A recovery journal precedes a save; Saved is shown only after durable completion. Another window's stale save is rejected. Export/reload recovery is available instead of overwriting it. Closing with an unapplied edit or outstanding save triggers the browser's unsaved-work prompt.

Workspace ZIP exports include native workbook resources and relative links. Restore validates resources, assigns fresh IDs and rewrites references before importing notes. Native backups retain Studyspace metadata; Excel conversion has a narrower compatibility contract.

## Shared workbook contract

The implementation is behind `SHARED_SPREADSHEETS_ENABLED=true`; the example environment leaves it off. It uses separate workbook resources rather than serialized workbook JSON in collaborative note text.

- `GET /api/shared/spreadsheets?id=UUID&collection=UUID`: authorized snapshot and current edit permission. Supplying `revision` returns a small unchanged response when possible. `history=1` returns retained revisions.
- `POST /api/shared/spreadsheets`: `{id, collection, note, revision, requestId, snapshot}`. The server derives a cell-level difference against the retained base revision and merges independent cell edits. Same-cell conflicts reject the batch with HTTP 409; the client keeps a recovery copy. Structural conflicts also require explicit recovery/reload. No silent last-write-wins merge.
- Retry IDs prevent repeated commits; revisions and permissions are rechecked under a collection lock. Bodies are streamed with a 10 MB limit. Database limits include 240 commits per actor/minute and 200 workbooks/collection. Shared history retains up to 100 prior revisions.
- Live updates poll revisions every 1.5 seconds. The existing desktop authenticated bridge already permits `/api/shared/*`. The API never requires renderer-side service credentials. Read authorization uses RLS; mutation RPCs are service-role-only and recheck the authenticated actor's collection permissions. Removing a collection cascades workbook data; deleting an account removes its request records and anonymizes authorship in surviving version history.
- Shared imports convert locally, then sync workbook values to collaborators. Original source files stay on the importing device. Shared workspace ZIP restore remains disabled; import a workbook into its shared note using the module's import control instead.

Apply `supabase/migrations/20260922010000_shared_spreadsheets.sql` after the existing shared-workspace migration, deploy the new server code, verify the acceptance checks below in staging, and then enable the flag. This implementation task does not apply that migration to the hosted project or publish a new desktop installer.

## Verification

Latest run: 39 unit/database/regression tests passed; all four browser tests passed against both development and production servers; the production build passed; npm's production dependency audit reported zero vulnerabilities. The production 10,000-cell fixture completed import application and formula assertions in 1,499 ms on this Windows/Edge 153 machine, including driver overhead.

The isolated Electron 44 renderer smoke test also passed with external requests blocked: formula editing and reload retained data while Node access remained unavailable to the renderer. Run `node desktop/scripts/spreadsheet-smoke.cjs` with `E2E_BASE_URL` pointing at a temporary production server. Its hidden test window uses a separate profile. This validates the desktop runtime, not an installed/upgraded or signed release artifact.

Automated coverage includes XLSX formulas/styles/outlines/freeze round trips; multiline CSV and leading zeros; unsafe formulas and excessive dimensions; native backup remapping; stale-save rejection; independent note copies; substring-format preservation; full-range printing; publication privacy; shared cell conflicts and role/idempotency/revocation enforcement in PostgreSQL-compatible tests.

Browser coverage includes insertion, durable reload, formulas, groups, expanded-mode escape, context-menu clearing, worker imports, Excel download, keyboard editing, WCAG A/AA automated checks of the Studyspace controls, a 10,000-cell formula fixture, and simultaneous edits from independent browser contexts. The browser collaboration fixture exercises the real client adapter against a controlled HTTP fixture; SQL authorization is tested separately with multiple account roles.

Commands (from the application directory):

```powershell
npx vitest run tests/spreadsheets.test.ts tests/shared-spreadsheets.test.ts tests/roundtrip.test.ts tests/domain.test.ts
$env:BROWSER_CHANNEL = 'msedge' # Omit on CI with Playwright Chromium installed.
npx playwright test --config=playwright.spreadsheets.config.ts
npm run build
npm audit --omit=dev
```

Browser reports and the 10,000-cell timing attachment are written to `test-results/spreadsheets/report.json`. The performance fixture records elapsed time including test-driver overhead; it is not a hardware-independent latency guarantee. The original engine experiment remains in `experiments/spreadsheet-engine`: its **native canvas grid** fails the accessibility gate. The user approved the free Studyspace DOM adapter, which is the default and has separate passing accessibility checks.

## Compatibility and remaining release gates

This is a spreadsheet module, not full Excel parity. VBA, legacy XLS, encrypted XLSX, external connections, pivots, drawings/charts and full formula parity are outside this release. Unsupported objects produce import warnings; retain the original file for full fidelity. Named ranges and custom labels are preserved in native backups; Excel interoperability for those custom details is not promised. CSV export is limited to a used rectangle of 100,000 cells to avoid huge allocations from sparse files.

The tested calculation baseline covers arithmetic, ranges, absolute references, SUM, AVERAGE, MIN, MAX, COUNT and IF. Shared structural changes deliberately conflict when racing with another edit rather than guessing at row identities. Undo and version recovery are available; hosted multi-account acceptance and manual NVDA/Edge testing remain release gates. Real Excel/Google-authored compatibility fixtures and representative hardware p95 editing benchmarks should accompany a broader public rollout.

## Monitoring and rollback

`studyspace:spreadsheet-metric` browser events report operation, success/failure and elapsed milliseconds only; no titles, IDs, filenames or cell contents. Connect this hook to the deployment's aggregate telemetry if desired. Watch save failures, conversion failures and opening latency during staging.

- `NEXT_PUBLIC_SPREADSHEETS_READONLY=true` disables editing while preserving viewing and native export. Client flags require rebuilding.
- `NEXT_PUBLIC_SPREADSHEET_CONVERSION_ENABLED=false` disables file conversion while native backup export remains available.
- `SHARED_SPREADSHEETS_ENABLED=false` stops shared workbook endpoints. Keep the additive tables and stored resources; do not drop data as rollback.

Univer 0.25.1 uses Apache-2.0; ExcelJS 4.4.0 uses MIT. License copies are included under `public/licenses/spreadsheets`. No Univer Pro package is used. Patched nanoid/uuid overrides are pinned in the lockfile.

## Owner setup

For local spreadsheets: **nothing**—no Microsoft subscription, Google credentials, API key or paid license. Import downloaded XLSX/CSV/TSV files directly.

For shared spreadsheets: apply the migration, deploy this server version, run staging checks with Owner/Editor/Viewer accounts, then enable `SHARED_SPREADSHEETS_ENABLED`. Distribute a newly built desktop version when ready for existing desktop users to receive the module.
