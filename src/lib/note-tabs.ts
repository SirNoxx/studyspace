/** Keep tab order stable when browsing, and only append on an explicit request. */
export function openNoteTabs(
  tabs: string[],
  activeId: string,
  noteId: string,
  newTab = false,
) {
  if (tabs.includes(noteId)) return tabs;
  if (newTab || !tabs.includes(activeId)) return [...tabs, noteId];
  return tabs.map((id) => (id === activeId ? noteId : id));
}
