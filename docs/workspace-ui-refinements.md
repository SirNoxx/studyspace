# Implementation brief: quieter navigation and consistent text actions

Implement the following refinements in the existing Studyspace application, preserving saved workspaces, public research, the current selection toolbar, and Version 1 source history.

1. Show each tab's introductory heading, eyebrow, and description until the user dismisses that tab's introduction. Provide an accessible close button and persist dismissal in workspace preferences across navigation, reloads, and desktop restarts. Retain a compact functional page title and all creation/filter controls. Each tab has an independent dismissal preference; existing workspaces require no reset or database migration.
2. Remove the opaque dark patch behind the Journal quill. Retain the app's inherited icon color, hover treatment, and visible keyboard focus indicator across themes.
3. Make collection and folder row activation expand or collapse their children, including clicks on unused row space. Use a separate labeled action to open the existing dedicated collection view. Reveal that action on hover or keyboard focus and keep it available on touch devices. Preserve the All Collections return arrow, context menus, inline creation, and drag/drop. Nested controls must not accidentally toggle the row.
4. Preserve the selection toolbar above highlighted text. Provide a matching, accessible right-click menu for selected editor or reading text, with Add to dictionary and Create study card directly below the existing single link action. Preserve the selected passage when opening a dialog, include ordinary clipboard/editing commands where applicable, and support Escape, keyboard invocation, and viewport boundaries. Do not add a duplicate link action.
5. Focus and select the complete Untitled name when creating a folder or note. The first typed character must replace the placeholder. Avoid selecting again on every keystroke or overwriting intentional edits to existing names. Verify inline creation, toolbar creation, and pointer/keyboard entry paths.

Validation must cover preference persistence, independent tab dismissal, collection expansion versus dedicated navigation, nested control behavior, folder/note naming, and text actions in writing and reading modes. Preserve the existing web and desktop save/update behavior.

## Delivery

Delivered as desktop version 1.0.1. Existing installations can use **Help > Check for updates > Restart & install**. Version 1 remains available in Git history and GitHub releases. These changes do not clear local storage or require a Supabase migration.

## Verification

The final production run passed all 25 browser journeys, alongside 55 web/domain tests and 9 desktop tests. The packaged app preserved notes and dismissed introductions across full process restarts. Installer download verification accepted the correct SHA512 digest and rejected a corrupt manifest. See [verification evidence](evidence/workspace-ui-refinements.json).
