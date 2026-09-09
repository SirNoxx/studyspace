import {
  type Workspace,
  type Snapshot,
  type StudyCopy,
  type PublicNote,
  type Attachment,
  uid,
  now,
  inContainer,
} from "./model";
import { saveNote } from "./domain";
const kinds = ["attachments", "definitions", "sources", "anchors"] as const;
type Kind = (typeof kinds)[number];
function canonical(
  kind: Kind,
  value: any,
  inverse: Record<string, string> = {},
) {
  const id = (v: string) => inverse[v] ?? v;
  if (kind === "attachments")
    return {
      filename: value.filename,
      mime: value.mime,
      size: value.size,
      hash: value.hash,
    };
  if (kind === "definitions")
    return {
      term: value.term,
      aliases: value.aliases,
      definition: value.definition,
    };
  if (kind === "sources")
    return {
      input: value.input,
      canonical: value.canonical?.replace(
        /attachment:([0-9a-f-]{36})/g,
        (_: string, i: string) => "attachment:" + id(i),
      ),
      title: value.title,
      authors: value.authors,
      kind: value.kind,
      noteIds: (value.noteIds ?? []).map(id).sort(),
      attachmentId: value.attachmentId ? id(value.attachmentId) : undefined,
      description: value.description,
      publisher: value.publisher,
      date: value.date,
    };
  return {
    sourceId: id(value.sourceId),
    noteId: value.noteId ? id(value.noteId) : undefined,
    quote: value.quote,
    prefix: value.prefix,
    suffix: value.suffix,
    locator: value.locator,
    contentHash: value.contentHash,
    page: value.page,
    rotation: value.rotation,
    rects: value.rects,
    state: value.state,
  };
}
export function recordChanges(
  w: Workspace,
  copy: StudyCopy,
  upstream: Snapshot,
) {
  const inverse = Object.fromEntries(
    Object.entries(copy.mapping).map(([a, b]) => [b, a]),
  );
  return kinds.flatMap((kind) => {
    const ids = [
      ...new Set([
        ...(copy.baseline[kind] ?? []).map((v) => v.id),
        ...(upstream[kind] ?? []).map((v) => v.id),
        ...Object.entries(copy.acceptedRecords ?? {})
          .filter(([, v]) => v?.kind === kind)
          .map(([id]) => id),
      ]),
    ];
    return ids.flatMap((id) => {
      const accepted = copy.acceptedRecords?.[id];
      const original = ((copy.baseline[kind] ?? []) as { id: string }[]).find(
          (v) => v.id === id,
        ),
        newValue = ((upstream[kind] ?? []) as { id: string }[]).find(
          (v) => v.id === id,
        ),
        localValue = (w[kind] as { id: string; trashed?: boolean }[]).find(
          (v) => v.id === copy.mapping[id] && !v.trashed,
        );
      const base =
          accepted === null
            ? null
            : (accepted?.data ?? (original ? canonical(kind, original) : null)),
        next = newValue ? canonical(kind, newValue) : null,
        local = localValue ? canonical(kind, localValue, inverse) : null;
      const equal = (a: unknown, b: unknown) =>
        JSON.stringify(a) === JSON.stringify(b);
      if (equal(base, next)) return [];
      const status =
        equal(base, local) || equal(local, next)
          ? ("safe" as const)
          : ("conflict" as const);
      const title =
        kind === "attachments"
          ? String((next ?? base)?.filename)
          : kind === "definitions"
            ? String((next ?? base)?.term)
            : kind === "sources"
              ? String((next ?? base)?.title)
              : String((next ?? base)?.locator);
      const note = (data: Record<string, unknown> | null): PublicNote | null =>
        data
          ? {
              id,
              title: kind + " · " + title,
              body: JSON.stringify(data, null, 2),
              path: kind,
              revision: 1,
            }
          : null;
      return [
        {
          id,
          kind,
          base: note(base),
          local: note(local),
          upstream: note(next),
          result: status === "safe" ? note(next) : note(local),
          status,
          nextData: next,
        },
      ];
    });
  });
}
export function applyRecordDecision(
  w: Workspace,
  copy: StudyCopy,
  change: ReturnType<typeof recordChanges>[number],
  decision: string,
  asset?: Attachment,
) {
  if (decision === "skip") return;
  if (!["mine", "upstream", "merge", "both"].includes(decision))
    throw new Error("Choose keep mine, upstream, or both for a metadata item.");
  if (decision === "merge" && change.status !== "safe")
    throw new Error("This metadata item requires an explicit decision.");
  const kind = change.kind,
    list = w[kind] as any[],
    old = list.find((x) => x.id === copy.mapping[change.id]);
  if (decision !== "mine") {
    const data = change.nextData;
    if (!data) {
      if (old) list.splice(list.indexOf(old), 1);
    } else {
      const id =
        kind === "attachments" && asset
          ? asset.id
          : decision === "both" || !old
            ? uid()
            : old.id;
      const mapped = (value: unknown) =>
        typeof value === "string" ? copy.mapping[value] : undefined;
      let entry: any;
      if (kind === "attachments") {
        if (!asset || asset.hash !== data.hash)
          throw new Error(
            "The selected attachment must finish copying before this update can be applied.",
          );
        entry = { ...asset, id };
        for (const source of w.sources.filter(
          (s) => s.attachmentId === old?.id,
        ))
          for (const anchor of w.anchors.filter(
            (a) => a.sourceId === source.id,
          ))
            if (anchor.contentHash !== entry.hash) anchor.state = "changed";
      } else if (kind === "definitions")
        entry = {
          ...data,
          id,
          subjectIds: [copy.containerId],
          createdAt: old?.createdAt ?? now(),
          updatedAt: now(),
        };
      else if (kind === "sources")
        entry = {
          ...data,
          id,
          noteIds: (data.noteIds as string[])
            .map((i) => copy.mapping[i])
            .filter(Boolean),
          subjectIds: [copy.containerId],
          attachmentId: mapped(data.attachmentId),
          manual: false,
          overrides: [],
          status: "ready",
          createdAt: old?.createdAt ?? now(),
        };
      else
        entry = {
          ...data,
          id,
          sourceId: mapped(data.sourceId),
          noteId: mapped(data.noteId),
        };
      if (kind === "anchors" && !entry.sourceId)
        throw new Error("Accept the associated source before its citation.");
      if (kind === "sources" && data.attachmentId && !entry.attachmentId)
        throw new Error(
          "Select the associated attachment update before accepting this source.",
        );
      if (kind === "sources" && entry.canonical?.startsWith("attachment:"))
        entry.canonical = "attachment:" + entry.attachmentId;
      if (kind === "attachments" && old && decision !== "both") {
        for (const n of w.notes.filter(
          (n) =>
            inContainer(w, n.containerId, copy.containerId) &&
            n.body.includes("attachment:" + old.id),
        ))
          saveNote(
            w,
            n.id,
            n.revision,
            {
              body: n.body
                .split("attachment:" + old.id)
                .join("attachment:" + id),
            },
            "Accepted attachment update",
          );
        for (const s of w.sources.filter((s) => s.attachmentId === old.id)) {
          s.attachmentId = id;
          if (s.canonical.startsWith("attachment:"))
            s.canonical = "attachment:" + id;
        }
      }
      if (old && decision !== "both" && kind !== "attachments")
        Object.assign(old, entry);
      else list.push(entry);
      if (decision !== "both") copy.mapping[change.id] = id;
      for (const r of w.review) if (r.sourceId === id) r.contentChanged = true;
    }
  }
  copy.acceptedRecords ??= {};
  copy.acceptedRecords[change.id] = change.nextData
    ? { kind, data: change.nextData }
    : null;
}
