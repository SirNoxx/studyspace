# Sidebar and writing refinements

Implement these changes within Studyspace's existing design system, preserving saved workspaces and the released desktop application.

1. Rename folders, collections, and notes directly in their sidebar name field. Select the full existing name, commit on Enter or blur, cancel on Escape, and keep a valid existing name when the field is blank. Reveal the item when renaming it from another view. Preserve note revision history.
2. Use a white typing caret on dark backgrounds and a dark caret on light backgrounds. Pressing Enter in an editable note title focuses the Markdown editor without adding a newline to the title; respect IME composition.
3. Remove study-style pickers, previews, and their unused styles/catalog. New collections use the standard setup, and legacy style preferences no longer alter AI behavior. Retain legacy stored metadata for backup compatibility.
4. Show a gray “Type here...” placeholder only in an empty editor. It must never become note content or appear in exports.
5. Anchor Dictionary, Sources, and Search this collection above Command palette in the focused collection sidebar, outside the scrolling file tree.
6. Distinguish root collection titles and folder levels with consistent colors. Preserve collection color choices, add a divider below Find a note, and retain All Collections navigation.
7. Lighten external and internal inserted links in both editing and reading views, with underlines and theme-aware contrast.
8. Render pasted image attachments automatically in Live and Reading views while Source retains editable Markdown. Preserve the original image in attachment storage.
9. Hide new-collection controls inside a focused collection; restore them in All Collections.
10. Dock AI Chat in the right sidebar. Anchor its composer at the bottom, offer starter prompts until the user begins typing, support separate saved conversations, and keep context, action, and response-style controls available. Preserve quiz, evidence, and explicit response-acceptance workflows. Never modify notes automatically from a reply.
11. Add workspace naming, creation, and switching. Additional workspaces are device-local, as confirmed by the user. Isolate their notes, collections, navigation, recovery drafts, and chat histories. Keep the original workspace and its cloud connection intact. Finish saving before switching.
12. Remove the right-sidebar toggle from the note header, retaining Zen/fullscreen there and the close button in the sidebar. Keep reopening the inspector available in navigation.
13. Verify persistence, keyboard behavior, scrolling, and existing workflows in an isolated browser profile. Leave the development app available for review. Do not bundle the desktop app or push a release until the user approves the result.
