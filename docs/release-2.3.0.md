# Studyspace 2.3.0 — PDFs

## New PDFs module

- Import a PDF in its original layout or explicitly choose Markdown text conversion. The choice is available for file/ZIP/folder imports and PDF attachments, pastes and drops.
- Importing directly into a PDFs module preserves the original layout automatically. Standard imports use a wider format-choice dialog with wrapping text.
- Select annotation tools from a visible row of labeled icons, with the current / total page counter at the bottom.
- Open original pages with preserved styling, continuous scrolling, zoom, page navigation and a bottom page count.
- Draw with a pen, highlight areas, add and edit text boxes, adjust text color/size/width, make visual text corrections, delete annotations, and undo/redo.
- Annotations save with the note. Save a PDF copy with your annotations or print selected pages. Original PDF bytes remain unchanged in your workspace.
- PDF rendering resources are bundled for offline desktop use. Backups preserve original attachments and annotation data.

**Text corrections are visual overlays, not native PDF text replacement or redaction.** The original searchable text remains underneath; arbitrary paragraph reflow, original-font matching, form editing and OCR are not included. Scanned PDFs can still be viewed and annotated. See `docs/pdf-modules.md` for behavior and limits.

## Install

Close Studyspace and run **Studyspace-Setup-2.3.0-x64.exe**. The application identity and existing desktop data location are unchanged. Keep a workspace backup before upgrading. Browser and desktop workspaces use separate storage.

The Windows x64 installer is unsigned; Windows may show an unknown-publisher warning. Checksums are included in `SHA256SUMS.txt`. No hosted website or database deployment is included in this desktop release.

## Verification

Production build and TypeScript checks passed, along with 225 unit tests, 17 desktop tests and 3 PDF browser tests. The packaged app passed offline PDF rendering, annotation persistence, rotated-page export/reimport, page-counter, startup and save/restart checks. The updater accepted the real installer checksum and rejected a corrupt manifest. No installer or in-place upgrade was executed during these checks. Detailed evidence is in `docs/evidence/release-2.3.0.json`.
