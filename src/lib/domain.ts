import { diffLines } from "diff";
import { current, isDraft } from "immer";
import {
  type Workspace,
  type Note,
  type Container,
  type Grade,
  type Schedule,
  type ReviewItem,
  type Snapshot,
  type PublicNote,
  uid,
  now,
  general,
  ancestry,
  inContainer,
  subjectOf,
  localDate,
} from "./model";
import { captureLinks, identifySource, publicMarkdown } from "./markdown";
export class DomainError extends Error {
  constructor(
    message: string,
    public code = "INVALID",
  ) {
    super(message);
  }
}
export function validateWorkspace(w: Workspace) {
  if (
    w.schemaVersion !== 1 ||
    w.notes.length > 10000 ||
    w.containers.length > 10000
  )
    throw new DomainError("Workspace limit exceeded.");
  if (
    w.containers.filter((c) => c.system === "general" && !c.trashed).length !==
    1
  )
    throw new DomainError("Exactly one General collection is required.");
  const ids = new Set<string>();
  for (const items of [
    w.containers,
    w.notes,
    w.definitions,
    w.sources,
    w.anchors,
    w.attachments,
    w.annotations,
    w.review,
  ])
    for (const item of items) {
      if (ids.has(item.id)) throw new DomainError("Duplicate identity.");
      ids.add(item.id);
    }
  for (const c of w.containers) {
    if (!c.title.trim() || c.title.length > 240)
      throw new DomainError("Names must contain 1–240 characters.");
    if (c.parentId && !w.containers.some((p) => p.id === c.parentId))
      throw new DomainError("Parent not found.");
    const seen = new Set([c.id]);
    let p = c.parentId;
    while (p) {
      if (seen.has(p))
        throw new DomainError(
          "A container cannot be moved into itself or a descendant.",
        );
      seen.add(p);
      p = w.containers.find((x) => x.id === p)?.parentId ?? null;
    }
  }
  for (const n of w.notes) {
    if (!w.containers.some((c) => c.id === n.containerId))
      throw new DomainError("Note destination not found.");
    if (n.body.length > 5 * 1024 * 1024)
      throw new DomainError("A note may contain at most 5 MB of text.");
  }
  for (const d of w.definitions)
    if (d.subjectIds.some((id) => !w.containers.some((c) => c.id === id)))
      throw new DomainError("Dictionary scope not found.");
}
export function createContainer(
  w: Workspace,
  fields: Partial<Container> & { title: string },
) {
  const c: Container = {
    id: uid(),
    parentId: null,
    kind: "collection",
    description: "",
    icon: "book",
    color: "#6e8f83",
    approach: "mixed",
    dictionary: true,
    related: [],
    order: w.containers.length,
    createdAt: now(),
    updatedAt: now(),
    ...fields,
    title: fields.title.trim(),
  };
  if (c.parentId && c.kind === "collection") c.kind = "subject";
  w.containers.push(c);
  validateWorkspace(w);
  return c;
}
export function createNote(
  w: Workspace,
  containerId = general(w).id,
  fields: Partial<Note> = {},
) {
  const n: Note = {
    id: uid(),
    containerId,
    title: "Untitled",
    body: "",
    kind: "note",
    revision: 1,
    createdAt: now(),
    updatedAt: now(),
    history: [],
    tags: [],
    ...fields,
  };
  const existing = w.notes.find((x) => x.id === n.id);
  if (existing) return existing;
  w.notes.push(n);
  return n;
}
export function saveNote(
  w: Workspace,
  id: string,
  expected: number,
  patch: { title?: string; body?: string },
  reason = "Edit",
) {
  const n = w.notes.find((n) => n.id === id);
  if (!n) throw new DomainError("Note unavailable.");
  if (n.revision !== expected)
    throw new DomainError(
      "This note changed in another session. Compare the versions or keep both.",
      "CONFLICT",
    );
  if ((patch.body ?? n.body) === n.body && (patch.title ?? n.title) === n.title)
    return n;
  const last = n.history.at(-1);
  if (!last || Date.now() - Date.parse(last.at) > 60000 || reason !== "Edit")
    n.history.push({
      revision: n.revision,
      title: n.title,
      body: n.body,
      at: now(),
      reason,
    });
  if (n.history.length > 100) n.history.shift();
  Object.assign(n, patch, { revision: n.revision + 1, updatedAt: now() });
  for (const a of w.annotations.filter((a) => a.noteId === id)) {
    a.state = n.body.includes(a.quote) ? "attached" : "changed";
  }
  for (const r of w.review.filter((r) => r.sourceId === id))
    r.contentChanged = true;
  if (w.settings.autoCapture) reconcileSources(w, n);
  return n;
}
export function reconcileSources(w: Workspace, n: Note) {
  const urls = captureLinks(n.body);
  const found = new Set<string>();
  for (const input of urls) {
    const info = identifySource(input);
    if (!info) continue;
    let s = w.sources.find((s) => s.canonical === info.canonical);
    if (!s) {
      s = {
        id: uid(),
        input,
        canonical: info.canonical,
        title: input,
        authors: [],
        kind: info.kind,
        subjectIds: [],
        noteIds: [],
        manual: false,
        overrides: [],
        status: "pending",
        createdAt: now(),
      };
      w.sources.push(s);
    }
    const subject = subjectOf(w, n.containerId);
    if (subject && !s.subjectIds.includes(subject.id))
      s.subjectIds.push(subject.id);
    if (!s.noteIds.includes(n.id)) s.noteIds.push(n.id);
    found.add(s.id);
  }
  for (const s of w.sources)
    if (!found.has(s.id)) s.noteIds = s.noteIds.filter((id) => id !== n.id);
}
export function moveItems(w: Workspace, ids: string[], destination: string) {
  const target = w.containers.find((c) => c.id === destination && !c.trashed);
  if (!target) throw new DomainError("Choose an existing destination.");
  for (const id of ids) {
    const c = w.containers.find((c) => c.id === id);
    if (c) {
      if (c.system)
        throw new DomainError("General is the default capture collection.");
      if (inContainer(w, destination, c.id))
        throw new DomainError(
          "A container cannot be moved into its descendants.",
        );
      c.parentId = destination;
      c.kind = c.kind === "collection" ? "subject" : c.kind;
      c.updatedAt = now();
    }
    const n = w.notes.find((n) => n.id === id);
    if (n) {
      n.containerId = destination;
      n.updatedAt = now();
      reconcileSources(w, n);
    }
  }
  validateWorkspace(w);
}
export function trashItems(w: Workspace, ids: string[], restore = false) {
  for (const id of ids) {
    const c = w.containers.find((c) => c.id === id);
    if (c?.system)
      throw new DomainError(
        "General is the default capture collection and cannot be trashed.",
      );
    if (c)
      for (const child of w.containers.filter((x) => inContainer(w, x.id, id)))
        child.trashed = !restore;
    for (const n of w.notes.filter(
      (n) => n.id === id || (c && inContainer(w, n.containerId, id)),
    ))
      n.trashed = !restore;
  }
}
export function duplicateItem(w: Workspace, id: string, destination?: string) {
  const n = w.notes.find((n) => n.id === id);
  if (n)
    return createNote(w, destination ?? n.containerId, {
      ...structuredClone(isDraft(n) ? current(n) : n),
      id: uid(),
      title: n.title + " (copy)",
      revision: 1,
      history: [],
      createdAt: now(),
    }).id;
  const c = w.containers.find((c) => c.id === id);
  if (!c) throw new DomainError("Item unavailable.");
  const oldContainers = w.containers.filter((x) => inContainer(w, x.id, id));
  const oldNotes = w.notes.filter((n) => inContainer(w, n.containerId, id));
  const map = new Map(oldContainers.map((x) => [x.id, uid()]));
  for (const old of oldContainers)
    w.containers.push({
      ...structuredClone(isDraft(old) ? current(old) : old),
      id: map.get(old.id)!,
      system: undefined,
      title: old.id === id ? old.title + " (copy)" : old.title,
      parentId:
        old.id === id ? (destination ?? old.parentId) : map.get(old.parentId!)!,
    });
  for (const old of oldNotes)
    createNote(w, map.get(old.containerId)!, {
      ...structuredClone(isDraft(old) ? current(old) : old),
      id: uid(),
      containerId: map.get(old.containerId)!,
      history: [],
      revision: 1,
    });
  return map.get(id)!;
}
export function captureJournal(
  w: Workspace,
  kind: "journal" | "dream",
  date = localDate(w.settings.timezone),
  extra = false,
) {
  if (kind === "journal" && !extra) {
    const old = w.notes.find(
      (n) =>
        n.kind === kind &&
        n.journalDate === date &&
        !n.trashed &&
        !n.metadata?.extra,
    );
    if (old) return old;
  }
  let parent = general(w).id;
  for (const title of [
    kind === "journal" ? "Journal" : "Dream Journal",
    date.slice(0, 4),
    date.slice(5, 7),
  ]) {
    let c = w.containers.find(
      (c) => c.parentId === parent && c.title === title && !c.trashed,
    );
    if (!c)
      c = createContainer(w, {
        title,
        parentId: parent,
        kind: "folder",
        dictionary: false,
      });
    parent = c.id;
  }
  return createNote(w, parent, {
    kind,
    title: kind === "journal" ? date : "Dream · " + date,
    journalDate: date,
    timezone: w.settings.timezone,
    body:
      kind === "journal"
        ? w.settings.journalTemplate
        : w.settings.dreamTemplate,
    metadata: { extra },
  });
}
export function newSchedule(at = now()): Schedule {
  return {
    algorithm: "studyspace-1",
    state: "new",
    interval: 0,
    ease: 2.5,
    repetitions: 0,
    lapses: 0,
    due: at,
  };
}
export function nextSchedule(
  previous: Schedule,
  grade: Grade,
  at: string,
): Schedule {
  const s = { ...previous };
  if (grade === "again") {
    s.state = previous.state === "review" ? "relearning" : "learning";
    s.interval = 10 / 1440;
    s.lapses += previous.state === "review" ? 1 : 0;
    s.ease = Math.max(1.3, s.ease - 0.2);
  } else if (previous.state !== "review") {
    s.interval = grade === "hard" ? 1 : grade === "good" ? 3 : 7;
    s.state = grade === "hard" ? "learning" : "review";
  } else {
    s.interval = Math.max(
      1,
      Math.round(
        s.interval *
          (grade === "hard" ? 1.2 : grade === "good" ? s.ease : s.ease * 1.3),
      ),
    );
    s.ease = Math.max(
      1.3,
      s.ease + (grade === "hard" ? -0.15 : grade === "easy" ? 0.15 : 0),
    );
  }
  s.repetitions++;
  s.due = new Date(Date.parse(at) + s.interval * 86400000).toISOString();
  return s;
}
export function gradeReview(
  w: Workspace,
  id: string,
  grade: Grade,
  eventId: string,
  at = now(),
) {
  const item = w.review.find((r) => r.id === id);
  if (!item) throw new DomainError("Review card unavailable.");
  if (item.events.some((e) => e.id === eventId)) return;
  item.events.push({ id: eventId, grade, at, before: { ...item.schedule } });
  item.schedule = nextSchedule(item.schedule, grade, at);
}
export function addReview(
  w: Workspace,
  fields: Pick<ReviewItem, "front" | "back" | "sourceType"> &
    Partial<ReviewItem>,
) {
  const item: ReviewItem = {
    id: uid(),
    schedule: newSchedule(),
    suspended: false,
    events: [],
    createdAt: now(),
    ...fields,
  };
  w.review.push(item);
  return item;
}
export interface PublicationSelection {
  attachmentIds?: string[];
  anchorIds?: string[];
  annotationIds?: string[];
  definitionIds?: string[];
  sourceIds?: string[];
}
export function prepareSnapshot(
  w: Workspace,
  ids: string[],
  fields: Partial<Snapshot> = {},
  selection: PublicationSelection = {},
): Snapshot {
  const selected = w.notes.filter((n) => ids.includes(n.id) && !n.trashed);
  if (!selected.length) throw new DomainError("Select at least one note.");
  const selectedIds = new Set(selected.map((n) => n.id));
  const titles = new Set(selected.map((n) => n.title));
  const assets = new Set(
    w.attachments
      .filter((a) => !a.trashed && selection.attachmentIds?.includes(a.id))
      .map((a) => a.id),
  );
  const subjectIds = new Set(
    selected.flatMap((n) => ancestry(w, n.containerId).map((c) => c.id)),
  );
  return {
    id: uid(),
    publicationId: uid(),
    version: 1,
    title: "Research collection",
    description: "",
    author: w.settings.displayName,
    topics: [],
    category: "General research",
    studyMethod: "mixed",
    folderCount: new Set(
      selected.flatMap((n) =>
        ancestry(w, n.containerId)
          .filter((c) => c.kind === "folder")
          .map((c) => c.id),
      ),
    ).size,
    notes: selected.map((n) => ({
      id: n.id,
      title: n.title,
      revision: n.revision,
      path: ancestry(w, n.containerId)
        .map((c) => c.title)
        .join("/"),
      body: publicMarkdown(n.body, titles, selectedIds, assets),
    })),
    definitions: w.definitions
      .filter(
        (d) =>
          !d.trashed &&
          d.subjectIds.some((id) => subjectIds.has(id)) &&
          (!selection.definitionIds || selection.definitionIds.includes(d.id)),
      )
      .map((d) => ({
        ...d,
        subjectIds: [],
        noteId: d.noteId && selectedIds.has(d.noteId) ? d.noteId : undefined,
        definition: publicMarkdown(d.definition, titles, selectedIds),
      })),
    sources: w.sources
      .filter(
        (s) =>
          s.noteIds.some((id) => selectedIds.has(id)) &&
          /^(https?:\/\/|isbn:|attachment:)/i.test(s.canonical) &&
          (!selection.sourceIds || selection.sourceIds.includes(s.id)) &&
          (!s.attachmentId || assets.has(s.attachmentId)),
      )
      .map((s) => ({
        ...s,
        noteIds: s.noteIds.filter((id) => selectedIds.has(id)),
        subjectIds: [],
        attachmentId:
          s.attachmentId && assets.has(s.attachmentId)
            ? s.attachmentId
            : undefined,
        description: undefined,
        overrides: [],
      })),
    anchors: w.anchors
      .filter(
        (a) =>
          selection.anchorIds?.includes(a.id) &&
          a.noteId &&
          selectedIds.has(a.noteId) &&
          w.sources.some(
            (s) =>
              s.id === a.sourceId &&
              (!selection.sourceIds || selection.sourceIds.includes(s.id)) &&
              (!s.attachmentId || assets.has(s.attachmentId)),
          ),
      )
      .map((a) => ({ ...a, prefix: "", suffix: "" })),
    annotations: w.annotations
      .filter(
        (a) =>
          a.kind === "author" &&
          selectedIds.has(a.noteId) &&
          selection.annotationIds?.includes(a.id),
      )
      .map((a) => ({
        ...a,
        prefix: "",
        suffix: "",
        body: publicMarkdown(a.body, titles, selectedIds),
      })),
    attachments: w.attachments
      .filter((a) => assets.has(a.id))
      .map((a) => ({ ...a, key: "" })),
    createdAt: now(),
    summary: "Initial publication",
    allowCopies: false,
    allowDownload: false,
    allowQA: false,
    lineage: [],
    ...fields,
  };
}
export function fingerprint(w: Workspace, ids: string[]) {
  return JSON.stringify({
    notes: w.notes
      .filter((n) => ids.includes(n.id))
      .map((n) => [n.id, n.revision, n.title, n.body])
      .sort(),
    definitions: w.definitions,
    sources: w.sources,
    anchors: w.anchors,
    annotations: w.annotations,
    attachments: w.attachments.map((a) => [a.id, a.hash, a.trashed]),
  });
}
export function diffNote(
  base: PublicNote | null,
  local: PublicNote | null,
  upstream: PublicNote | null,
) {
  const same = (a: PublicNote | null, b: PublicNote | null) =>
    a === null || b === null
      ? a === b
      : a.title === b.title && a.body === b.body && a.path === b.path;
  if (same(base, upstream))
    return { status: "unchanged" as const, result: local };
  if (same(base, local) || same(local, upstream))
    return { status: "safe" as const, result: upstream };
  if (!base || !local || !upstream)
    return { status: "conflict" as const, result: local };
  // Merge only disjoint line edits; ambiguous overlap is deliberately left for review.
  const edits = (text: string) => {
    let pos = 0;
    const result: { start: number; end: number; text: string[] }[] = [];
    const parts = diffLines(base.body, text);
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      const lines = p.value.match(/[^\n]*\n|[^\n]+$/g) ?? [];
      if (p.removed) {
        const e = { start: pos, end: pos + lines.length, text: [] as string[] };
        pos += lines.length;
        if (parts[i + 1]?.added)
          e.text = parts[++i].value.match(/[^\n]*\n|[^\n]+$/g) ?? [];
        result.push(e);
      } else if (p.added) result.push({ start: pos, end: pos, text: lines });
      else pos += lines.length;
    }
    return result;
  };
  const mine = edits(local.body),
    theirs = edits(upstream.body);
  if (
    mine.some((a) =>
      theirs.some((b) => a.start <= b.end && b.start <= a.end),
    ) ||
    (local.title !== base.title &&
      upstream.title !== base.title &&
      local.title !== upstream.title) ||
    (local.path !== base.path &&
      upstream.path !== base.path &&
      local.path !== upstream.path)
  )
    return { status: "conflict" as const, result: local };
  const lines = base.body.match(/[^\n]*\n|[^\n]+$/g) ?? [];
  for (const e of [...mine, ...theirs].sort((a, b) => b.start - a.start))
    lines.splice(e.start, e.end - e.start, ...e.text);
  return {
    status: "safe" as const,
    result: {
      ...local,
      title: local.title === base.title ? upstream.title : local.title,
      path: local.path === base.path ? upstream.path : local.path,
      body: lines.join(""),
    },
  };
}
