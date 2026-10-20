# Studyspace learning experience — engineering brief

Act as the senior product engineer responsible for delivering a coherent, production-quality learning experience in Studyspace. Preserve existing private notes and workspace behavior. Implement the following capabilities with accessible interfaces, persistent data, automated verification and clear external-service limitations.

## Product scope

1. Replace the whiteboard text box's blue resize square with a diagonal resize arrow. Retain a minimum 24-pixel pointer target, keyboard resizing, focus visibility and all existing text formatting and persistence.
2. Introduce a dedicated **Learning** tab. A category-filtered topic wheel helps users decide what to study across History, Mathematics, Science and Computer science. Ship hundreds of distinct, substantive starter topics. Select uniformly from eligible topics; respect reduced motion; prevent duplicate spins and repeat recommendations of started topics.
3. A selected topic automatically creates and opens a **Learning Path**, separate from the Collections explorer. Paths contain private nested folders, editable notes, source links and a concept checklist. Users can mark individual concepts and entire paths learned, reopen completed paths and resume work without losing files. Completion is self-reported, not a credential or validated assessment.
4. Provide optional Wikipedia topic discovery through MediaWiki's official search API. Persist only topics the user chooses, with stable source identifiers and attribution links. Search failures must not prevent offline use of the starter catalog. Never treat every Wikipedia page as a vetted lesson or inferred prerequisite.
5. Add lightweight note syntax: typing `def:` on its own line and pressing Enter creates a Definition module with a term field on the left and a wrapped explanation on the right. Enter from the term moves focus to the explanation. Typing `uses:` and pressing Enter creates a collapsible **Use cases** module with an editable multiline body. Modules also appear in the existing gallery, retain readable text in exports and AI context, and preserve undo and source-mode editing. Do not intercept these shortcuts inside fenced code.

## Catalog architecture and expansion

### Learned Vault and learning history

Make Learning the single home for **Topic wheel**, **In progress**, and **Learned Vault**. A path is the ongoing workspace for a skill; the vault is a searchable index of demonstrated-to-yourself understanding. Store completion timestamps on concepts and paths. Completing a path keeps all folders, files, sources and concept history; reviewing it again restores active status without erasing previously checked concepts. Show concepts from active paths as soon as they are marked learned. Include learned Definition modules from ordinary notes under **From my notes**, linking directly to their original note. Support category filters and title/explanation search, useful empty states and persistent state after restart. Do not move or duplicate note content when updating completion status.

Definition modules must also maintain linked dictionary entries. Preserve entry identity when wording changes; deleting a module archives its generated entry and undo restores it. Edits through the dictionary update the linked module. Match multiword terms case-insensitively across whitespace while retaining word boundaries and excluding code examples.

### Shared workspace explorer and extended whiteboard

Entering Shared Collections replaces the private Collections explorer with a shared explorer. Retain familiar collection/folder/file visuals, nested folder expansion, create-folder/create-file controls, selected-file indication and the regular editor. Display a people indicator when a collection has collaborators. Keep owner/editor/viewer enforcement, invitation management, history, recovery and revision-conflict behavior. The home view should emphasize resuming a shared collection or creating one, without exposing unrelated private folders.

Extend whiteboard coordinates beyond the original page, retaining saved drawing positions. Support wheel/trackpad pan, modifier-wheel zoom around the pointer, Space-drag or middle-button pan, keyboard navigation, a wider zoom range and a Fit drawing recovery action. Keep practical coordinate and object-count limits for robustness, rather than presenting a fixed page edge. PNG export must include drawing content beyond the original viewport.

Start with a reviewed, versioned local catalog so selection works offline without API costs. Give every topic a stable ID, category and source/search reference. Separate catalog content from per-user path progress. Deduplicate imported Wikipedia pages by page ID and canonical title. Use page-sized browsing instead of rendering thousands of options at once.

For expansion to thousands, build an operator-reviewed ingestion pipeline from Wikidata entities and Wikipedia category/search seeds. Store canonical entity IDs, language, aliases, category, source revision, review status, difficulty and editorial prerequisites. Queue fetches with conditional requests, caching, bounded concurrency, exponential backoff and provider rate-limit handling. Treat category membership as a candidate signal, not educational suitability. Reject disambiguation/navigation pages, duplicates and overly broad entries. Record provenance and applicable licenses; copying article text requires proper attribution and license handling. AI may propose learning objectives for review, but must not silently fabricate source claims or difficulty ratings.

A later server catalog can provide indexed category/tag search and cursor pagination while personal progress and notes remain local. Use stable IDs across catalog revisions; retire recommendations without deleting existing paths. Add explicit user opt-in before syncing learning interests to a cloud profile. Track aggregate selection failures and catalog coverage without sending private notes or search history to analytics.

## Integration and release criteria

- Validate persisted module and topic data, bound network inputs and external requests, and construct trusted provider URLs rather than rendering returned HTML.
- Prove that spinning excludes started topics, duplicate actions do not create duplicate paths, categories filter correctly, learned status survives restart, and path files remain separate from ordinary collections.
- Verify keyboard-only operation, reduced motion, narrow screens, offline use, empty/exhausted catalogs and provider failures. Show the actual selected topic when animation ends; never imply the wheel visually displays every catalog entry.
- Test note shortcuts, focus transfer, wrapping, collapse/expand, export text, undo and persistence.
- Release editor blocks and offline Learning first, then verify live topic discovery in web and packaged desktop environments. Keep the previous release available and preserve new module data when rolling back.

References: [MediaWiki REST API](https://www.mediawiki.org/wiki/API:REST_API/Reference).
