# Import/export compatibility

The authoritative note body is original Markdown. Rendering does not rewrite its unknown syntax.

Supported: UTF-8 `.md`, multiple files, directory/ZIP hierarchy, Unicode names; GFM headings/lists/tasks/tables/code/links, math, callouts, hidden comments and strict Mermaid; wikilinks, aliases, relative Markdown/assets, heading/block markers, and one-level note embeds. Ambiguous basenames are reported. YAML is preserved verbatim; basic aliases/tags are indexed without executing code. `.canvas`/`.base` are retained as inert assets. Dataview/JavaScript is text.

Limits: 25 MB compressed per input, 100 MB expanded per import, 2,000 entries, maximum 100:1 ZIP expansion, 5 MB per Markdown note, 50 MB per supported attachment, and a 4 MB compressed cloud save-request guard. The browser buffers bounded ZIPs. Larger deployment limits are not promised.

Import rejects traversal/absolute paths, symlinks, encrypted ZIPs, invalid UTF-8 notes, and excessive expansion. Case/portable-name collisions receive distinct IDs/export paths. `.obsidian`, `.git`, `.env`, executable scripts, HTML, and SVG do not become active assets. Missing references remain in Markdown and appear in the report. Original files are never changed.

Example report:

```text
Research/Overview.md: ambiguous link [[Introduction]]
Research/Overview.md: missing attachment figures/missing.png (reference preserved)
.obsidian/plugins/example/main.js: Configuration or executable content excluded.
```

Local import commits a workspace mutation after asset staging. Identical original-path + SHA-256 files are skipped on repeat import; changed files are retained independently. Cloud jobs use owner-scoped idempotency keys. Cancellation occurs at safe boundaries. An interrupted upload can leave unreferenced staged bytes; the idle worker reconciles them after a minimum 72-hour grace period.

Export derives Dictionary.md/Sources.md, uses portable names and relative asset references, and writes an ID/path manifest. The manifest preserves original Markdown, typed journals/dreams, definitions/sources, evidence, and selected personal records. On app-backup restore, this manifest is authoritative. Editing a portable Markdown file inside an app backup does not override the stored authoritative body: remove the manifest to import the edited files as an ordinary vault.

Restore allocates new private identities and remaps references. Imported data cannot install authentication, permissions, moderator roles, or trusted lineage. Arbitrary archive attribution is unverified; target-account preferences remain unchanged. Attachment bytes are checksum-verified on export and reconnect by hash on restore. Full backups include trashed notes and attachment bytes with their trash state. Tests cover a fresh local domain workspace. Fresh-account Supabase/object-service restoration remains an external verification step.

Known limits: no Obsidian plugin runtime, recursive transclusion, visual `.canvas`/`.base` editor, or promised rendering parity with every extension. These limitations are explicit rather than represented as successful conversions.
