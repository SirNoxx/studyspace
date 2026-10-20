# Learning experience verification

Development work for 2.1.0; not a claim that the public desktop installer or hosted API has been updated.

## Implemented

- 320 starter topics across four categories; optional live Wikipedia search and custom topics; started topics excluded from future recommendations.
- Separate Learning Paths with nested folders and notes, concept checklists, completion timestamps, and a searchable Learned Vault. Reviewing a completed path preserves files and checked concepts.
- `def:` and `uses:` Enter shortcuts and gallery modules. Definition modules maintain linked dictionary entries; dictionary edits update the original module. Phrase matching handles case and repeated whitespace, respects word boundaries, and excludes code. Moving, trashing, restoring and backing up notes preserves the relationship.
- Whiteboard corner resize arrow with keyboard support, wheel/trackpad pan, Space/middle-button pan, pointer-centered modifier-wheel zoom, 5%–1600% zoom, Fit drawing and exports beyond the original page. Coordinate limits are ±1,000,000 logical units rather than a fixed visible page.
- Shared Collections explorer with nested folders, selected-file indication, collaborator icons, familiar creation controls, and separate editor/viewer UI. Cloud permissions remain enforced by existing server/database policies.

## Evidence

- Unit/database suite: 130 tests across 24 files passed, including learning catalog uniqueness, path identity and history, module-definition synchronization, phrase matching, full backup restoration and whiteboard data validation.
- Desktop unit suite: 15 tests passed. Existing native bridge authorization, token isolation, sign-out and streaming behavior retained coverage.
- Browser coverage exercises wheel persistence; nested learning files and completion/reopening; definition creation, dictionary editing and hover highlights; module focus, collapse and learned status; whiteboard text formatting/resize/export/restart; extended pan/zoom; provider failure; narrow layout and WCAG A/AA checks; mocked shared editor/viewer navigation and nested creation.
- Live development API checks returned HTTP 200 for Wikipedia’s GitHub search.

One development shortcut browser run failed while the CPU-heavy unit/database suite was running concurrently; three isolated repeats passed. Before the subsequent menu updates and music removal, the final sequential run against the optimized production build passed all **14 Chromium tests** in 44 seconds, including the fenced-code shortcut guard and dictionary-to-module editing. Shared interface fixtures do not replace hosted multi-account authorization tests.

The final isolated webpack production build passed compilation, TypeScript checking, static generation and build tracing. It ran on temporary port 47832 for browser verification; the user's development server and installed desktop server were preserved. This latest Learning/editor build has not been packaged into a new public installer or deployed.

## External release gates

The new unified-workspace migration, Google OAuth, email provider, hosted deployment, actual provider-backed desktop AI and public installer release still require the steps in [the operator checklist](operator-setup-checklist.md). The catalog expansion pipeline for thousands of reviewed topics is an architectural plan; the shipped starter catalog contains 320 topics, plus topics users choose to add.

Do not drop additive database tables or erase device storage during rollback. Keep the prior installer and export workspaces before reverting; older clients preserve module Markdown but may not render newer module controls. Full backups now retain Learning Paths and completion history.


## Editor and sidebar follow-up (September 11, local development)

- Learning is hidden from navigation; existing paths and the direct route are retained for future development. Study Music and its route, styles and Spotify frame permission were removed.
- Folder menus follow the requested creation/bookmark, navigation/organization and export/lifecycle groups.
- Whiteboards use wheel zoom anchored at the pointer, a viewport-sized enlarged canvas, content-sized text boxes with transparent centered editing, visible formatting labels and bordered actions. Saved text captures clicks around rendered lines, including in previously oversized boxes; manual resize remains available.
- Shared Collections uses the common workspace header, planner/calendar shortcuts, capture and search controls, plus the regular tree dimensions, left disclosure arrows, active row styling and folder creation menus. Viewer controls remain read-only.
- Spelling uses the existing nspell/Hunspell engine plus the Fuzzball fuzzy-matching library over dictionary-validated English words and inflections. The worker and dictionaries are bundled locally. Other misspelling decorations remain mapped through correction transactions; code and URLs are excluded. Suggestions remain user-selected; ambiguous severe errors are not guaranteed to identify the intended word.
- TypeScript and 19 targeted unit tests passed. Eleven Chromium checks passed across spelling (including severe typos, persistent underlines and offline replacement), whiteboard interactions/persistence, hidden Learning navigation and editor/viewer shared-tree fixtures. Screenshots were inspected at desktop and mobile sizes. These local checks do not establish hosted multi-account authorization or a rebuilt installer; no deployment or release was performed for this follow-up.

Additional retained-Learning regression checks passed (five cases), including dictionary/module synchronization and saved paths. After navigation was hidden, the direct-route vault test was updated to await autosave before a full page navigation; it then passed. The two final whiteboard interaction checks also passed after clipping text hit areas to visible text.
