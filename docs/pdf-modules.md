# PDFs module

Add **Modules → PDFs**, choose an existing workspace PDF, or upload a PDF. Uploading directly into a PDFs module automatically preserves the original styling without another format prompt. PDF imports through the import dialog, ZIP/folder import, attachment picker, paste, and drop offer **PDF module — keep original styling** or **Convert to Markdown text**. Originals remain attachments in either mode. Full workspace backup restores do not reconvert their PDF assets.

PDF.js renders the original pages, including fonts, images, colors, crop boxes and rotation. The viewer provides continuous scrolling, fit-to-width/zoom, a bottom current / total page counter with previous/next/jump navigation, and selectable original text. Canvases render near the viewport and are released offscreen. Fonts, character maps, decoding WASM and the matching PDF.js worker are bundled locally; document viewing does not need an external PDF service.

## Editing and saving

- Visible icon tool buttons for selection, pen, rectangle highlighter, text boxes, text color/size/box width, visual text corrections, annotation deletion, undo and redo.
- Annotations save as validated module data in the note; original PDF bytes are immutable. Closing and reopening the note preserves annotations.
- **Save PDF copy** downloads the unchanged original when no annotations exist. With annotations it embeds a transparent image overlay on each affected original PDF page, preserving underlying PDF text/vector content and page geometry. Overlay text is rasterized in this exported copy; editable annotations remain in Studyspace's note/backup.
- **Print** renders the requested pages with annotations into an isolated print document. Mixed portrait/landscape page sizes are specified individually. Printing is limited to 100 pages per batch to bound memory use; longer documents can be printed in ranges or saved and printed in a PDF app.

**Visual text corrections are not native PDF text replacement or redaction.** They cover the selected text segment with a white patch and draw the correction on top; the original searchable text remains. Arbitrary PDF content-stream editing, paragraph reflow, original-font matching, form-field editing, OCR, and digital-signature preservation are not provided. PDF-LIB itself does not expose native editing of ordinary page text: https://github.com/Hopding/pdf-lib#limitations. The tool explains the correction behavior before use. Scanned documents can receive annotations but need OCR elsewhere to extract/edit their printed text. Exporting an annotated copy may invalidate document signatures; the untouched original remains stored.

## Storage, access and recovery

Files use existing local IndexedDB or authenticated attachment storage; shared attachments reuse the existing server/RLS access checks. Module sources resolve only through the note's permitted attachment metadata, never through arbitrary fetched URLs. Public snapshots exclude PDF modules unless the corresponding attachment is explicitly selected. Full backups include original bytes and annotation data, and restore remaps attachment IDs.

Limits: 25 MB per file through bulk import; 50 MB through attachment/module upload; 2,000 PDF pages; 2,000 annotations; 5,000 points per stroke; 1 MB annotation JSON. Password-protected PDFs request an unlocked copy, with no password retention. Corrupt/missing files show an error and retry action without discarding the original attachment. Reading/public modes disable editing. Undo history is session-local; note revisions and workspace backups provide durable recovery.

## Verification

`tests/pdf-module.test.ts` covers original-byte retention, attachment resolution, backup/restore, cancelled imports, publication filtering and upload replacement conflict handling. `e2e/pdf-modules.spec.ts` covers styled pages, drawing, highlights, text correction, undo/redo, persistence, zoom/page navigation, exported PDFs, printing, damaged files and the Markdown conversion choice, direct module imports without a prompt, and responsive dialog wrapping. `node desktop/scripts/pdf-smoke.cjs` checks the packaged desktop viewer with external network requests blocked, persistent annotations and rendered export/reimport on rotated pages. Run with `npx playwright test --config playwright.pdf.config.ts` against the development server.
