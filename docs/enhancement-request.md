Act as a senior full-stack engineer responsible for delivering a polished, production-ready update to Studyspace, an existing note-taking and study application.
This is an additive enhancement to the existing product. I love Studyspace’s current appearance, layout, and overall experience. Preserve its visual identity, existing functionality, and familiar workflows. Make targeted changes only where necessary to implement the requirements below. Do not redesign unrelated screens, remove features, or replace established components unnecessarily.
Begin by inspecting the existing application, architecture, data models, design system, and integrations. Build on the patterns already in use. Implement complete, persistent functionality across the interface, application logic, and backend wherever required—not static mockups or placeholder interactions.
Use sound engineering judgment to resolve routine implementation details. Ask for clarification only when a decision materially affects scope, existing data, or intended behavior.
1. Make navigation easier to understand
   Update the leftmost navigation sidebar so users can expand and collapse it with a smooth sliding transition. Display tab names beneath their icons in the expanded state, and make this labeled state the default.
   Apply the same principle to the tabs in the upper-right area of the application: show clear labels by default and provide a compact presentation when desired.
   Preserve the existing icons and styling unless a specific change is requested below. Ensure both navigation areas remain understandable for new users, with accessible names, tooltips in compact mode, visible focus states, and persisted display preferences.
2. Add categories and collections for study cards
   Allow users to organize study cards into named categories or collections—for example, an “AI” collection containing only artificial intelligence study cards.
   Users must be able to create, rename, and delete these groupings; assign and move cards between them; and review only the cards within a selected grouping. Preserve the existing ability to access and review all cards.
   Clearly distinguish study-card groupings from workspace collections wherever their terminology could otherwise cause confusion. Removing a grouping must not silently delete its cards.
3. Create study cards and dictionary entries from notes
   Allow users to create study cards directly within regular notes without leaving their writing workflow.
   When a user selects text, show a lightweight contextual menu containing:
   - Add to dictionary
   - Create study card
   Reuse existing dictionary and study-card functionality. Where an AI integration is available, use it to propose an editable definition or a question-and-answer card based on the selected passage and relevant note context.
   Let users review the result, choose its destination, and confirm before saving. Preserve a reference to the originating note where supported. Keep manual creation available if AI is unavailable or fails, and prevent the interaction from disrupting the editor’s selection or unsaved content.
4. Improve the new-collection form with visual previews
   Enhance collection setup so users understand what each option means before choosing it.
   Replace the basic “How would you like to study?” dropdown interaction with a polished modal containing a responsive grid of the application’s supported study styles. Each option must include:
   - Its name.
   - A representative image or illustration.
   - A concise explanation of how the study experience works.
   - The tasks or material it is particularly useful for.
   - A clear selected state.
   Describe these as study methods or preferences without making unsupported claims about fixed learning types.
   Show the chosen method in the collection form after selection. Add visible icon previews to the icon picker, and provide useful previews for other dropdown choices where appropriate. Match the existing application’s visual language.
5. Export notes as a ZIP archive
   Add an export action that downloads all of the user’s Markdown notes in a ZIP file.
   Preserve collection and folder organization, use readable filenames, and handle duplicate names without overwriting files. Export the underlying Markdown content accurately, regardless of how formatting is displayed in the editor.
   Show a visible progress bar during export preparation, followed by a clear completion or failure state. Base progress on actual work where measurable; use an indeterminate state where it is not. Do not imply that the browser’s download has completed if the application can only confirm that the archive is ready.
   Avoid blocking normal interaction during large exports.
6. Create folders immediately with inline renaming
   When users create a folder within a collection, remove the separate folder-creation popup.
   Create the folder immediately with the default name “Untitled”, reveal it in the correct location, and activate inline renaming with the name selected so users can begin typing at once.
   Support Enter to confirm and a predictable Escape behavior. Handle empty names and naming conflicts consistently with the existing file manager.
7. Hide Markdown syntax outside the active editing context
   Improve the note editor so Markdown formatting becomes visually rendered when users move away from the relevant line or formatting context.
   For example, heading markers such as # and emphasis markers such as ** should no longer remain visibly exposed after the user moves to a new line. The heading or bold formatting itself should remain visible.
   Preserve valid underlying Markdown and make formatted content straightforward to edit again. Integrate this behavior with the existing editor, retaining reliable cursor movement, selection, undo/redo, keyboard shortcuts, and copy/paste behavior.
8. Allow users to enter a collection
   Add a collection-focused navigation mode. When a user enters a collection, the file-navigation portion of the left sidebar should show only that collection’s folders and files.
   Provide a clear indication of the active collection and an obvious way to return to the full workspace.
   Add separate new folder and new file controls beside each collection. Reveal them on hover and keyboard focus, with an equivalent accessible interaction for touch devices. Newly created items must belong to the collection from which the action was triggered.
9. Create an interactive onboarding experience
   Introduce onboarding for users who have just signed up. Keep it welcoming, concise, and consistent with Studyspace’s existing interface.
   The walkthrough must explain:
   - How to expand, collapse, and reopen the leftmost navigation sidebar.
   - The purpose of the major application tabs.
   - How to use the tabs or tools in the right sidebar.
   For the right-sidebar portion, highlight the group of available tabs and invite users to select whichever interests them. When a tab is selected, display a brief, useful description beneath the buttons explaining what it does and when to use it.
   Allow users to skip or finish onboarding, persist completion, and provide a way to revisit it. Keep overlays positioned correctly across screen sizes and ensure they do not obscure the controls users are being asked to use.
10. Clarify the workspace quick-actions menu
    Improve the presentation of the dropdown currently represented by the down arrow beside “My Workspace.”
    Give it a clear “Quick actions” label and position it directly above “Quick note.” Preserve its existing actions and style it consistently with the surrounding interface.
11. Add a discreet AI Chat launcher
    Add a small chat bubble in the bottom-right corner of the note-taking screen that opens AI Chat.
    The assistant should help users clarify topics, understand their notes, and study using the capabilities already available in the Study guide window. Reuse the existing AI infrastructure and shared functionality where practical.
    On opening, show a short, positive introduction explaining its purpose. Keep the launcher noticeable but unobtrusive: avoid automatic opening, repeated prompts, or distracting animation.
    Allow users to hide the launcher, persist that preference, and provide a discoverable way to restore it. Position it so it does not obstruct writing or essential editor controls.
12. Add a dedicated attachment-management experience
    Make attachments accessible through the file manager while keeping them visually separate from regular notes.
    Add a “View attachments” action to each folder. This should open a dedicated window or panel listing attachments within that folder and its descendants.
    Each attachment row must show:
    - The attachment’s link or filename.
    - An image preview or thumbnail immediately after it, where applicable.
    - Its location within the collection and folder hierarchy.
    - The note or notes referencing it, where that relationship exists.
    Use appropriate file-type previews for non-image attachments. Support opening attachments and navigating to their source locations. Handle unavailable files and repeated references gracefully, and keep attachment records consistent when notes or folders are moved or renamed.
13. Support hyperlinks to external pages and internal notes
    Allow users to select text and insert or edit a hyperlink.
    Support both external URLs and links to other files within Studyspace. Provide a searchable internal-file picker so users can choose a destination without manually entering an internal address.
    Preserve meaningful link text and use stable internal references so links continue working after a destination is renamed or moved. Provide a clear state when a linked file is no longer available.
14. Add eight optional themes
    Preserve every existing theme and keep the current default appearance unchanged. Add the following eight selectable themes through the existing theme system:
    - Winter: Cool blues, icy accents, and a calm, crisp appearance.
    - Spring: Fresh greens with subtle botanical accents.
    - Summer: Bright, playful yellows balanced with readable surfaces and restrained accents.
    - Fall: Burnt orange paired with tasteful coffee browns.
    - Tropical: Lush greens, turquoise, and warm tropical accents.
    - Underwater: Light blue near the top, gradually deepening toward darker ocean tones lower in the application. Add tasteful plants and bubbles in peripheral areas that do not distract from content.
    - Space: Deep purples and pinks with restrained white star accents.
    - Forest: Greens, earthy browns, moss tones, and small accents inspired by wildflowers.
    Apply each theme consistently across navigation, editors, dialogs, forms, cards, and interactive states. Include previews in the theme selector and persist the user’s choice.
    Maintain readable contrast and clear focus states. Decorative elements must not interfere with text, interaction, or performance, and any animation must respect reduced-motion preferences.
15. Update the journal icon and add calendar views
    Replace the journal icon with a book-and-quill icon consistent with the application’s icon style.
    Add a journal calendar with weekly, monthly, and yearly views. Default to weekly.
    - Weekly: Show the seven days in a compact grid with clear indicators for days containing entries.
    - Monthly: Show a conventional calendar grid and highlight dates containing entries.
    - Yearly: Show a compact dot grid with one dot per day, illuminating dates containing entries. Support 365 days or 366 in leap years.
    Allow users to navigate between periods and select a day to view its entries or begin an entry. Distinguish the current day, selected day, and days with entries. Use the user’s local date consistently and support multiple entries on one day.
16. Expand Discover browsing and publishing
    Add a browsing menu to Discover that lets users explore popular notes and browse content by category. Use real published content and a defined popularity signal supported by the application’s data.
    Add a prominent action for publishing a collection or folder to Discover.
    Build a thorough publishing flow that captures or displays:
    - Title and description.
    - Category and relevant tags.
    - Study method or learning-style setting.
    - Author attribution.
    - Number of included folders and files.
    - Number of identifiable sources.
    - Number of author annotations.
    - A preview of the material being published.
    Calculate counts from actual content and metadata wherever possible. Define what constitutes a source or annotation, avoid double-counting, and never invent counts when the underlying information is unavailable.
    Let users review the publication scope, included attachments, metadata, and preview before explicitly confirming publication. Make the resulting visibility clear, preserve the existing private workspace content, and ensure unpublished material is excluded.
    If Discover requires new backend or storage functionality, implement it within the application’s existing architecture with appropriate ownership and access controls.
17. Complete integration and verification
    Deliver these features as a cohesive extension of Studyspace. Reuse existing components, design tokens, authentication, storage, and application services wherever practical.
    Persist new settings and content appropriately. Introduce backward-compatible data changes that preserve existing notes, collections, cards, attachments, and user preferences.
    Cover relevant loading, empty, success, and error states. Ensure keyboard accessibility, responsive layouts, and reliable behavior across the application’s supported devices.
    Run the project’s existing checks and add focused verification for meaningful risks, including collection scoping, export integrity, Markdown editing, internal links, attachment references, journal dates, and publication visibility. Fix regressions introduced by the changes.
    When finished, provide a concise delivery report explaining what was implemented, how it was verified, and any remaining limitations or external configuration requirements. Clearly distinguish completed functionality from anything still blocked.
The finished result should feel like a natural, professionally integrated evolution of Studyspace: easier to discover, organize, study with, and personalize, while retaining the appearance and experience I already love.