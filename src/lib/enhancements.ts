import { attachmentTargets } from "./markdown";
import { findAttachment } from "./attachments";
import {
  type Workspace,
  type Snapshot,
  type ReviewItem,
  ancestry,
  inContainer,
  uid,
} from "./model";
export const categories = [
  "General research",
  "Artificial intelligence",
  "Technology",
  "Science",
  "Humanities",
  "Arts & design",
  "Languages",
  "Health & wellbeing",
  "Business",
  "Other",
];
export const extraThemes = [
  { id: "winter", label: "Winter", colors: ["#edf5fc", "#24587d", "#c9e4f3"] },
  { id: "spring", label: "Spring", colors: ["#f0f7ee", "#356444", "#cddfb7"] },
  { id: "summer", label: "Summer", colors: ["#fff9e8", "#765713", "#f4d672"] },
  { id: "fall", label: "Fall", colors: ["#f8efe5", "#874725", "#cf8f56"] },
  {
    id: "tropical",
    label: "Tropical",
    colors: ["#ebf7f2", "#17665f", "#83c6ae"],
  },
  {
    id: "underwater",
    label: "Underwater",
    colors: ["#e6f5fb", "#155974", "#104b65"],
  },
  { id: "space", label: "Space", colors: ["#231b36", "#f0a8dd", "#6e4e89"] },
  { id: "forest", label: "Forest", colors: ["#eff1e6", "#405e37", "#9bad83"] },
] as const;
export function normalizeWorkspace(w: Workspace) {
  return {
    ...w,
    settings: {
      ...w.settings,
      cardGroups: w.settings.cardGroups ?? [],
      ribbonCompact: w.settings.ribbonCompact ?? false,
      toolsCompact: w.settings.toolsCompact ?? false,
      chatHidden: w.settings.chatHidden ?? false,
    },
  };
}
export function createCardGroup(
  w: Workspace,
  title: string,
  containerId?: string,
) {
  const value = title.trim();
  if (!value) throw new Error("Enter a study-card collection name.");
  if (
    w.settings.cardGroups?.some(
      (g) => g.title.toLowerCase() === value.toLowerCase(),
    )
  )
    throw new Error("A study-card collection already uses that name.");
  if (
    containerId &&
    !w.containers.some((c) => c.id === containerId && !c.trashed)
  )
    throw new Error("Choose an available collection or folder.");
  const group = {
    id: uid(),
    title: value.slice(0, 120),
    ...(containerId ? { containerId } : {}),
  };
  (w.settings.cardGroups ??= []).push(group);
  return group;
}
export function cardMatchesGroup(
  w: Workspace,
  card: ReviewItem,
  group: NonNullable<Workspace["settings"]["cardGroups"]>[number],
) {
  if (card.groupId) return card.groupId === group.id;
  if (
    !group.containerId ||
    !w.containers.some((c) => c.id === group.containerId && !c.trashed)
  )
    return false;
  const within = (id?: string) =>
    !!id &&
    ancestry(w, id).every((c) => !c.trashed) &&
    inContainer(w, id, group.containerId!);
  if (card.sourceType === "note") {
    const note = w.notes.find((n) => n.id === card.sourceId);
    return !!note && !note.trashed && within(note.containerId);
  }
  if (card.sourceType === "definition") {
    const definition = w.definitions.find(
      (d) => d.id === card.sourceId && !d.trashed,
    );
    return !!definition && definition.subjectIds.some(within);
  }
  if (card.sourceType === "citation") {
    const anchor = w.anchors.find((a) => a.id === card.sourceId);
    const note = w.notes.find((n) => n.id === anchor?.noteId && !n.trashed);
    return !!note && within(note.containerId);
  }
  return within(card.subjectId);
}
export function cardsInGroup(w: Workspace, groupId: string) {
  const groups = w.settings.cardGroups ?? [];
  if (groupId === "all") return w.review;
  if (!groupId)
    return w.review.filter(
      (card) =>
        !card.groupId &&
        !groups.some((group) => cardMatchesGroup(w, card, group)),
    );
  const group = groups.find((g) => g.id === groupId);
  return group
    ? w.review.filter((card) => cardMatchesGroup(w, card, group))
    : [];
}
export function removeCardGroup(w: Workspace, id: string) {
  w.settings.cardGroups = (w.settings.cardGroups ?? []).filter(
    (g) => g.id !== id,
  );
  for (const card of w.review) if (card.groupId === id) delete card.groupId;
}
export function scopedAttachments(w: Workspace, containerId: string) {
  const notes = w.notes.filter(
    (n) => !n.trashed && inContainer(w, n.containerId, containerId),
  );
  const references = new Map(
    notes.map((n) => [
      n.id,
      new Set(
        attachmentTargets(n.body)
          .map(
            (target) =>
              findAttachment(w.attachments, target, n.originalPath ?? "")?.id,
          )
          .filter(Boolean),
      ),
    ]),
  );
  return w.attachments
    .filter((a) => !a.trashed)
    .map((asset) => ({
      asset,
      notes: notes.filter(
        (n) =>
          references.get(n.id)?.has(asset.id) ||
          w.sources.some(
            (s) => s.attachmentId === asset.id && s.noteIds.includes(n.id),
          ),
      ),
    }))
    .filter((row) => row.notes.length);
}
export function publicationCounts(p: Snapshot) {
  return {
    files: p.notes.length,
    folders:
      p.folderCount ??
      new Set(
        p.notes.flatMap((n) => {
          const parts = n.path.split("/");
          return parts.slice(1).map((_, i) => parts.slice(0, i + 2).join("/"));
        }),
      ).size,
    sources: new Set(p.sources.map((s) => s.canonical)).size,
    annotations: new Set(p.annotations.map((a) => a.id)).size,
  };
}
export function dateParts(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}
export function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}
export function calendarDays(date: string, mode: string) {
  const pivot = dateParts(date),
    year = pivot.getUTCFullYear(),
    month = pivot.getUTCMonth();
  let start: Date, count: number;
  if (mode === "year") {
    start = new Date(Date.UTC(year, 0, 1, 12));
    count = (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / 86400000;
  } else if (mode === "month") {
    start = new Date(Date.UTC(year, month, 1, 12));
    start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
    count = 42;
  } else {
    start = new Date(pivot);
    start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
    count = 7;
  }
  return Array.from({ length: count }, (_, i) =>
    dateKey(new Date(start.getTime() + i * 86400000)),
  );
}
export function shiftPeriod(date: string, mode: string, direction: number) {
  const d = dateParts(date);
  if (mode === "year") d.setUTCFullYear(d.getUTCFullYear() + direction);
  else if (mode === "month") {
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + direction);
  } else d.setUTCDate(d.getUTCDate() + 7 * direction);
  return dateKey(d);
}
export function stableNoteLink(id: string, text: string) {
  return `[${text.replace(/[\\\[\]]/g, "\\$&")}](${"#note:" + id})`;
}
