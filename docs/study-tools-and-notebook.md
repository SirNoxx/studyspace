# Study tools and notebook additions

These changes are available in the source/dev app. The previously built 1.0.2 desktop installer predates these additions.

## Files and navigation

Opening a note replaces the active header tab. To keep the current tab and add another, right-click a note and choose **Open in new tab**, the first menu option. Opening an already open note activates its existing tab. Replacing a tab preserves saved edits and note navigation history.

### Settings and note typography

Settings opens above the whole workspace with a blurred backdrop. Close it with the top-right X, Escape, or a click outside the popup. **Appearance → Note titles & headings** provides Professional (the default), Editorial, Academic, Technical, and Friendly font presets with previews. The selection applies immediately to note titles and headings in Live and Reading modes, leaves body text unchanged, and is saved with the workspace.

### Nested definitions and note locations

Creating a definition from selected text opens a compact **Define** popup with the explanation field focused. **Enter** saves, **Shift+Enter** adds a line, and **Escape** cancels. While writing a definition, other defined words and aliases are outlined. Click one to open its meaning, or select a new word and right-click (or choose **Define** above the selection) to define it in a smaller popup. The parent draft stays open. Definitions created this way inherit the parent's collections; the full dictionary form still provides collection and alias controls.

Opening a dictionary entry shows **View in notes** with a separate snippet and line number for each use. Clicking an occurrence opens that note and selects and scrolls to that exact word, including repeated uses in the same note. Matches respect collection-specific meanings and explicit definition links; code examples and deleted or archived notes are excluded.

Right-click a file and choose **Open file to the right**. Click either pane to make it active; subsequent file opens from the sidebar use that pane. The active pane has an accent outline and header. Each pane has its own Back/Forward history, saved with the workspace layout. Opening a different note after going Back starts a new history branch.

The file tab strip has a thin horizontal scrollbar when tabs overflow. Mouse-wheel scrolling over the strip moves through the tabs, and the active tab is brought into view.

## AI chat

The top toolbar contains Study material and Study Tools. Study Tools offers study cards, summaries, explanations, quizzes, learning suggestions, and passage clarification. Card/question difficulty appears only for cards/quizzes. Folder selection uses the left sidebar and includes descendant notes, excluding journals, dreams, archived and trashed material. Summaries and cards include completed transcript attachments.

Generation does not move the reader's scroll position. The down-arrow button jumps to the bottom on request. History opens a searchable popup of saved conversations. Failed/stopped requests keep the user's question and can be retried. A selected passage can be attached using the fourth selection-toolbar action, Add to Chat.

Requests require explicit selected-context sharing. Local material can be studied without signing in; private cloud material still requires authentication. Folder requests cover all selected text up to 200,000 characters, split into bounded provider requests; larger selections receive an explicit error. One study request consumes one request allowance and reserves processing capacity for every section before generation. The free default is 100 requests per UTC day, with additional processing and abuse limits; see [free-ai-chat.md](free-ai-chat.md). Hard cards require application and inference rather than giveaway topic names; generated sets can be reviewed, edited, and saved to Review.

## Code blocks

### Pasting Mermaid diagrams

Paste a complete fenced `mermaid` block into a note. Live mode automatically displays the diagram; **Edit diagram** opens its source and **Apply diagram** updates the preview. Source mode retains the Markdown, and Reading mode displays the same diagram. Rich clipboard code blocks labelled Mermaid are also supported. Pasting within an existing code example stays literal. Invalid diagrams retain their original text so they can be corrected. Paste and deletion support the editor's normal undo, and diagrams are saved with the note.

### Running code

Right-click in the writing editor and choose **Add code block**. Live mode displays an editable code cell with syntax highlighting, line numbers, indentation, bracket completion, Run/Stop, output, Copy, collapse, and Add to Chat. Selecting code before Add to Chat attaches that selection; otherwise it attaches the whole cell.

Run supports JavaScript, TypeScript, Python, C17, C++20, and SQL (SQLite). HTML and CSS render an isolated preview, and JSON validates and formats. Code runs locally in an opaque-origin worker, with a five-second execution limit, a separate two-minute loading/compilation ceiling, and bounded output. Network access is restricted to the app's public runtime assets; the worker cannot read the app DOM, private API, session or host filesystem. C/C++ and Python have temporary in-memory filesystems, and SQL starts with a fresh database every run. Standard libraries are included; external packages and native OS APIs are not supported. TypeScript transpiles syntax without full semantic type checking.

Expand **Program input (stdin)** before running programs that read input. Python `input()`, C `scanf`, and C++ `std::cin` read this text. JavaScript and TypeScript receive a `stdin` string. Inputs and output are temporary. HTML/CSS previews disable scripts, navigation, forms and external resources; CSS uses a sample page.

Runtime assets are generated by `scripts/prepare-code-runtimes.mjs` during `npm run dev` and `npm run build`, copied into standalone builds and desktop staging, and ignored by Git. Runtimes load only when selected code is run. C/C++ requires about 105 MB of compiler resources on first use; Python requires about 14 MB. The compiler download does not delay ordinary note opening. No compilation service account or per-run fee is required. See `docs/code-runtimes.md` for runtime versions, limitations and verification.

Code and collapsed state are stored as ordinary fenced Markdown with a `studyspace:<id>` info marker. Output is temporary and code never runs automatically when a note opens. The runner's `/api/code-runner` route has a separate restrictive content security policy; dynamic evaluation remains disabled on the main production app.

## YouTube transcripts


Pasting a standalone YouTube video link into the editor creates a clickable **Transcript for [video title]** attachment. Open it to read, copy, download, insert text into the note, or attach the transcript to AI chat. Attachments are saved in the note's existing metadata and survive reopening; no database migration is required. Adding the text to the note also includes it in plain Markdown exports.

Automatic imports require a server-side `SUPADATA_API_KEY` from [Supadata](https://dash.supadata.ai). Set it in the server environment and restart the server. Never use a `NEXT_PUBLIC_` variable for this key. The integration uses [Supadata's transcript endpoint](https://docs.supadata.ai/api-reference/endpoint/transcript/transcript) in auto mode: retrieve existing captions when available, otherwise request transcription. Only supported YouTube video URLs are accepted. Requests require authentication, start at most ten imports per account per UTC day, and bind asynchronous job tokens to the account and video. Provider charges are separate from OpenAI usage.

Without the provider key, or when a video cannot be transcribed, the attachment allows manual text entry or `.txt`, `.srt`, and `.vtt` import. Large jobs can be continued from the attachment after reopening. Individual transcripts are limited to 200,000 characters and twenty attachments per note. Automatic transcription has been tested with provider fixtures; a real Supadata key is still needed for live-provider verification.

## Validation

Automated tests cover retained chat failures, folder summaries/card saving, sharing consent, staged generation without forced scrolling, active-pane routing, independent histories, tab overflow, transcript persistence/manual import, provider-job ownership, code execution, blocked network access, execution timeout, and collapsed-code persistence. Provider fixtures use synthetic content and do not submit private notes.

Validation completed: 93 unit tests, TypeScript checks, an isolated production build, and all five notebook browser tests against that production build. Existing selection, workspace, and collection-return browser checks also passed after updating an obsolete test selector for the previously removed folder-focus button.

## Notebook updates — September 10

Code blocks have editable titles and a three-dot menu for saving a source file, copying the block into another note or a new file in a folder, studying the code, opening a publication preview, and deletion. Deletion can be undone. Run creates a fresh execution each time and can restart an in-progress run. Focus regression tests cover slow typing through autosaves in both panes; the reported intermittent loss of focus was not independently reproduced before the stability changes.

Whiteboards support pen, brush, highlighter, whole-stroke eraser, straight lines, arrows, rectangles and ellipses; preset/custom colors and stroke width; undo/redo; blank, dotted, grid and ruled backgrounds; collapse; and an enlarged drawing view. Zoom controls and the Pan tool navigate the board. Export PNG exports the full drawing even when zoomed. The menu offers an editable Markdown download, copying to a file/folder, a manual study card containing the drawing, publication preview, clearing, and deletion. Drawing study cards do not imply AI image recognition.

The Modules button at the top of notes (including the second pane and journal entries), and Add a module in the writing editor's context menu, open a searchable gallery with category filters. One click inserts an editable calendar, Cornell notes, paper, table, two-topic Venn diagram, bar/line/pie chart, formatted list, or checklist. Code blocks and whiteboards are also available in the gallery. Calendars retain entries when switching months. Tables support up to 12 columns and 100 rows; charts up to 24 values; lists up to 100 items. Pie charts display positive values. Modules preserve structured data in fenced Markdown and display in Reading mode; ordinary Markdown viewers display the saved data as a code fence. Study requests convert module data into readable text.

AI Chat → Chat options includes an optional 2,000-character personality/preferences field. Preferences persist per workspace and accompany future provider requests. Required evidence and response-format rules still apply.

Quick notes have their own navigation tab and a separate internal storage container excluded from the collection tree and destination pickers. Previously unfiled quick notes are normalized into this area without changing note identities or content. Moving one through the visual collection/folder picker turns it into an ordinary filed note. The owner can still search, edit, export, publish individually, and trash these notes.

The note right-click and three-dot menus include **Move to quick notes**. It moves the existing note, preserving its content, identity, history and references. Pinned notes move out of Pinned notes when sent to Quick notes. Long titles and previews wrap within equally padded content.

**Journal → Browse templates** includes ten named Studyspace originals with distinct prompts, tables and checklists: Daybreak Compass, Deep Work Dock, Recall Forge, Paper Trail, Debug Diary, Idea Greenhouse, Weekly Orbit, Exam Expedition, Commonplace Cabinet, and Evening Landing. They are bundled public resources, available even when community templates cannot load. Preview and Use template follow the existing save-copy and append/replace flow. They do not publish a user's entries.

Focused collection headers have a subtle tint encompassing quick-action icons. Their footer shows whiteboard/code counts only when matching blocks exist in active descendant notes, excluding unrelated collections, archived/trashed material, and other module types. The dictionary heading uses the focused collection's name. Folder menus end with the descendant file count and creation date.

These updates are in the source and development app. The installed Windows app and its 1.0.2 installer have not been rebuilt with these later changes. The broader social expansion remains unfinished; `social-platform-implementation-brief.md` records its requirements. Messaging and shared collections are not implemented yet.

Latest validation on September 10: 102 unit tests and TypeScript checks passed; 26 browser checks passed against the isolated Webpack production build. These include all code languages/formats, calendar and chart editing, pinning, moving notes into Quick notes, wrapping and spacing, and the ten public template originals. A separate production check verified Python stdin reaches EOF correctly after a trailing newline. No live AI provider call, Supadata call, member publication, or desktop installation was performed by these fixture-based checks.
