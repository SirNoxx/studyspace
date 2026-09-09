import { unzipSync, zipSync, strToU8 } from "fflate";
import {
  type Workspace,
  type Attachment,
  type Note,
  uid,
  now,
  ancestry,
} from "./model";
import {
  createContainer,
  createNote,
  reconcileSources,
  DomainError,
} from "./domain";
import { resolveLink } from "./markdown";
import { parseDocument } from "yaml";
export function assetMime(path: string) {
  const ext = path.split(".").at(-1)?.toLowerCase();
  return (
    (
      {
        pdf: "application/pdf",
        png: "image/png",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        webp: "image/webp",
        gif: "image/gif",
        mp3: "audio/mpeg",
        wav: "audio/wav",
        mp4: "video/mp4",
        canvas: "text/plain",
        base: "text/plain",
        md: "text/markdown",
        txt: "text/plain",
      } as Record<string, string>
    )[ext ?? ""] ?? "text/plain"
  );
}
export const importLimits = {
  compressed: 25 * 1024 * 1024,
  expanded: 100 * 1024 * 1024,
  entries: 2000,
  note: 5 * 1024 * 1024,
  ratio: 100,
};
export interface ImportFile {
  path: string;
  bytes: Uint8Array;
  kind: "note" | "asset" | "manifest" | "excluded";
  reason?: string;
  hash: string;
}
export interface ImportPlan {
  files: ImportFile[];
  warnings: string[];
  totalBytes: number;
}
export async function sha256(bytes: Uint8Array) {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes).buffer),
    ),
  ]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
export function safePath(path: string) {
  const p = path.replace(/\\/g, "/").normalize("NFC");
  if (
    p.startsWith("/") ||
    /^[a-z]:/i.test(p) ||
    p.split("/").some((x) => x === ".." || /[\x00-\x1f]/.test(x))
  )
    throw new DomainError("Unsafe archive path: " + path);
  return p
    .split("/")
    .filter((x) => x && x !== ".")
    .join("/");
}
function inspectZip(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let p = bytes.length - 22; p >= Math.max(0, bytes.length - 65557); p--)
    if (view.getUint32(p, true) === 0x06054b50) {
      end = p;
      break;
    }
  if (end < 0) throw new DomainError("Invalid ZIP directory.");
  const count = view.getUint16(end + 10, true);
  if (count > importLimits.entries)
    throw new DomainError("ZIP exceeds 2,000 entries.");
  let pos = view.getUint32(end + 16, true),
    total = 0;
  for (let i = 0; i < count; i++) {
    if (pos + 46 > bytes.length || view.getUint32(pos, true) !== 0x02014b50)
      throw new DomainError("Invalid ZIP entry.");
    const compressed = view.getUint32(pos + 20, true),
      expanded = view.getUint32(pos + 24, true),
      nameLength = view.getUint16(pos + 28, true),
      extra = view.getUint16(pos + 30, true),
      comment = view.getUint16(pos + 32, true),
      external = view.getUint32(pos + 38, true);
    if (((external >>> 16) & 0xf000) === 0xa000)
      throw new DomainError("Symbolic links are not imported.");
    if (view.getUint16(pos + 8, true) & 1)
      throw new DomainError("Encrypted ZIP files are unsupported.");
    if (
      expanded > importLimits.expanded ||
      expanded / Math.max(1, compressed) > importLimits.ratio
    )
      throw new DomainError("Unsafe ZIP expansion ratio.");
    total += expanded;
    if (total > importLimits.expanded)
      throw new DomainError("ZIP expands beyond 100 MB.");
    safePath(
      new TextDecoder("utf-8", { fatal: true }).decode(
        bytes.slice(pos + 46, pos + 46 + nameLength),
      ),
    );
    pos += 46 + nameLength + extra + comment;
  }
  return total;
}
export async function prepareImport(files: File[]): Promise<ImportPlan> {
  const unpacked: { path: string; bytes: Uint8Array }[] = [];
  let total = 0;
  for (const file of files) {
    if (file.size > importLimits.compressed)
      throw new DomainError(
        "Local import accepts files up to 25 MB. Split a larger vault into smaller ZIPs.",
      );
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (file.name.toLowerCase().endsWith(".zip")) {
      inspectZip(bytes);
      for (const [path, data] of Object.entries(unzipSync(bytes)))
        if (!path.endsWith("/")) unpacked.push({ path, bytes: data });
    } else unpacked.push({ path: file.webkitRelativePath || file.name, bytes });
  }
  const plan: ImportPlan = { files: [], warnings: [], totalBytes: 0 };
  const seen = new Set<string>();
  for (const item of unpacked) {
    if (plan.files.length >= importLimits.entries)
      throw new DomainError("Import exceeds 2,000 entries.");
    const path = safePath(item.path);
    total += item.bytes.length;
    if (total > importLimits.expanded)
      throw new DomainError("Import exceeds 100 MB.");
    let kind: ImportFile["kind"] = "excluded",
      reason = "Unsupported file type; original file is untouched.";
    if (
      /(^|\/)(\.obsidian|\.git|node_modules|\.env)(\/|$|\.)|\.(exe|dll|js|ts|html|svg|sh|bat|ps1)$/i.test(
        path,
      )
    )
      reason = "Configuration or executable content excluded.";
    else if (/(^|\/)studyspace-manifest\.json$/i.test(path)) kind = "manifest";
    else if (/\.md$/i.test(path)) {
      kind = "note";
      if (item.bytes.length > importLimits.note)
        throw new DomainError(path + " exceeds 5 MB.");
      try {
        new TextDecoder("utf-8", { fatal: true }).decode(item.bytes);
      } catch {
        kind = "excluded";
        reason = "Invalid UTF-8. Save this file as UTF-8 and retry.";
      }
    } else if (
      /\.(png|jpe?g|webp|gif|pdf|mp3|wav|mp4|txt|canvas|base)$/i.test(path)
    )
      kind = "asset";
    const folded = path.toLowerCase().replace(/[. ]+(?=\/|$)/g, "");
    if (seen.has(folded))
      plan.warnings.push(
        "Case or path collision: " + path + " (kept with a distinct ID)",
      );
    seen.add(folded);
    if (/(^|\/)(con|prn|aux|nul|com\d|lpt\d)(\.|\/|$)/i.test(path))
      plan.warnings.push(
        "Windows-reserved name will use a portable export mapping: " + path,
      );
    plan.files.push({
      ...item,
      path,
      kind,
      reason: kind === "excluded" ? reason : undefined,
      hash: await sha256(item.bytes),
    });
  }
  plan.totalBytes = total;
  return plan;
}
export function commitImport(
  w: Workspace,
  plan: ImportPlan,
  destination: string,
  { skipIdentical = true }: { skipIdentical?: boolean } = {},
) {
  const manifestFile = plan.files.find((f) => f.kind === "manifest");
  if (manifestFile) return restoreManifest(w, plan, destination, manifestFile);
  const paths = new Map<string, string>([["", destination]]);
  let imported = 0,
    skipped = 0;
  const importedNotes = [];
  for (const file of plan.files.filter((f) => f.kind === "note")) {
    if (
      skipIdentical &&
      w.notes.some(
        (n) =>
          n.metadata?.importHash === file.hash && n.originalPath === file.path,
      )
    ) {
      skipped++;
      continue;
    }
    const parts = file.path.split("/");
    let prefix = "",
      parent = destination;
    for (const title of parts.slice(0, -1)) {
      prefix = prefix ? prefix + "/" + title : title;
      if (!paths.has(prefix)) {
        const existing = w.containers.find(
          (c) => c.parentId === parent && c.title === title && !c.trashed,
        );
        paths.set(
          prefix,
          existing?.id ??
            createContainer(w, {
              title,
              parentId: parent,
              kind: "folder",
              dictionary: false,
            }).id,
        );
      }
      parent = paths.get(prefix)!;
    }
    const n = createNote(w, parent, {
      title: parts.at(-1)!.replace(/\.md$/i, ""),
      body: new TextDecoder("utf-8", { fatal: true }).decode(file.bytes),
      originalPath: file.path,
      metadata: { importHash: file.hash },
      linkMap: {},
    });
    importedNotes.push(n);
    const frontmatter = n.body.match(
      /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/,
    )?.[1];
    if (frontmatter) {
      try {
        const data = parseDocument(frontmatter).toJS({ maxAliasCount: 0 });
        if (Array.isArray(data?.aliases))
          n.metadata!.aliases = data.aliases.filter(
            (a: unknown) => typeof a === "string",
          );
        else if (typeof data?.aliases === "string")
          n.metadata!.aliases = [data.aliases];
        if (Array.isArray(data?.tags))
          n.tags = data.tags.filter((t: unknown) => typeof t === "string");
      } catch {
        plan.warnings.push(
          file.path +
            ": frontmatter could not be indexed; original text is preserved.",
        );
      }
    }
    reconcileSources(w, n);
    imported++;
  }
  const warnings = [...plan.warnings];
  for (const n of importedNotes) {
    for (const m of n.body.matchAll(/!?\[\[([^\]]+)\]\]/g)) {
      const result = resolveLink(m[1], n.originalPath ?? "", w.notes);
      if (result.id) n.linkMap![m[1]] = result.id;
      else
        warnings.push(`${n.originalPath}: ${result.status} link [[${m[1]}]]`);
    }
    for (const m of n.body.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) {
      if (!/^(https?:|#|mailto:)/i.test(m[1]) && !/\.md(?:#|$)/i.test(m[1])) {
        const relative = (n.originalPath ?? "").split("/").slice(0, -1);
        for (const part of m[1].split("/")) {
          if (part === "..") relative.pop();
          else if (part !== ".") relative.push(part);
        }
        if (
          !plan.files.some(
            (f) =>
              f.kind === "asset" &&
              (f.path === relative.join("/") || f.path === m[1]),
          )
        )
          warnings.push(
            `${n.originalPath}: missing attachment ${m[1]} (reference preserved)`,
          );
      }
    }
  }
  return { imported, skipped, warnings, notes: importedNotes };
}
function restoreManifest(
  w: Workspace,
  plan: ImportPlan,
  destination: string,
  file: ImportFile,
) {
  const manifest = JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(file.bytes),
  );
  if (
    manifest.schemaVersion !== 1 ||
    !Array.isArray(manifest.notes) ||
    !Array.isArray(manifest.containers) ||
    !manifest.mapping
  )
    throw new DomainError(
      "Unsupported backup manifest. No notes were imported.",
    );
  if (manifest.notes.length > importLimits.entries)
    throw new DomainError("Backup contains too many notes.");
  const warnings = [...plan.warnings],
    map: Record<string, string> = {},
    notes: Note[] = [];
  let skipped = 0;
  if (w.notes.some((n) => n.metadata?.backupHash === file.hash))
    return { imported: 0, skipped: manifest.notes.length, warnings, notes };
  for (const a of manifest.attachments ?? []) {
    const asset = w.attachments.find((x) => x.hash === a.hash && !x.trashed);
    if (asset) {
      map[a.id] = asset.id;
      asset.trashed = !!a.trashed;
    } else warnings.push("Missing attachment bytes: " + a.filename);
  }
  const originalContainers = manifest.containers as Workspace["containers"];
  const todo = [...originalContainers];
  let guard = 0;
  while (todo.length && guard++ <= originalContainers.length) {
    for (let i = todo.length - 1; i >= 0; i--) {
      const c = todo[i];
      if (
        c.parentId &&
        originalContainers.some((p) => p.id === c.parentId) &&
        !map[c.parentId]
      )
        continue;
      map[c.id] = createContainer(w, {
        title: String(c.title).slice(0, 240),
        parentId: c.parentId ? (map[c.parentId] ?? destination) : destination,
        kind: c.kind === "folder" ? "folder" : "subject",
        description: typeof c.description === "string" ? c.description : "",
        color: /^#[0-9a-f]{6}$/i.test(c.color) ? c.color : "#739b8e",
        icon: c.icon,
        approach: c.approach,
        dictionary: !!c.dictionary,
      }).id;
      todo.splice(i, 1);
    }
  }
  if (todo.length)
    throw new DomainError("Backup container hierarchy contains a cycle.");
  for (const old of manifest.notes) {
    const path = manifest.mapping[old.id];
    const imported = plan.files.find(
      (f) => f.path === path && f.kind === "note",
    );
    if (!imported) {
      warnings.push("Missing note file: " + path);
      continue;
    }
    if (typeof old.body !== "string" || old.body.length > importLimits.note)
      throw new DomainError("Invalid note content in backup.");
    const note = createNote(w, map[old.containerId] ?? destination, {
      title: String(old.title).slice(0, 240),
      body: old.body,
      kind: ["note", "quick", "journal", "dream"].includes(old.kind)
        ? old.kind
        : "note",
      tags: Array.isArray(old.tags)
        ? old.tags.filter((t: unknown) => typeof t === "string")
        : [],
      createdAt: old.createdAt ?? now(),
      journalDate: old.journalDate,
      timezone: old.timezone,
      originalPath: old.originalPath ?? path,
      history: Array.isArray(old.history) ? old.history.slice(-100) : [],
      trashed: !!old.trashed,
      archived: !!old.archived,
      metadata: {
        ...(typeof old.metadata === "object" ? old.metadata : {}),
        backupHash: file.hash,
        backupOriginalId: old.id,
      },
      linkMap: {},
    });
    map[old.id] = note.id;
    notes.push(note);
  }
  for (const old of manifest.notes) {
    const n = notes.find((n) => n.id === map[old.id]);
    if (n)
      n.linkMap = Object.fromEntries(
        Object.entries(old.linkMap ?? {}).map(([key, value]) => [
          key,
          map[String(value)] ?? String(value),
        ]),
      );
  }
  for (const d of manifest.definitions ?? []) {
    if (typeof d.term !== "string" || typeof d.definition !== "string")
      continue;
    const id = uid();
    map[d.id] = id;
    w.definitions.push({
      id,
      term: d.term,
      definition: d.definition,
      aliases: Array.isArray(d.aliases) ? d.aliases : [],
      subjectIds: (d.subjectIds ?? [])
        .map((s: string) => map[s])
        .filter(Boolean),
      createdAt: d.createdAt ?? now(),
      updatedAt: d.updatedAt ?? now(),
    });
  }
  for (const s of manifest.sources ?? []) {
    const id = uid();
    map[s.id] = id;
    w.sources.push({
      ...s,
      id,
      attachmentId: map[s.attachmentId],
      canonical:
        s.attachmentId && map[s.attachmentId]
          ? "attachment:" + map[s.attachmentId]
          : s.canonical,
      noteIds: (s.noteIds ?? []).map((id: string) => map[id]).filter(Boolean),
      subjectIds: (s.subjectIds ?? [])
        .map((id: string) => map[id])
        .filter(Boolean),
    });
  }
  for (const a of manifest.anchors ?? []) {
    if (!map[a.sourceId]) continue;
    const id = uid();
    map[a.id] = id;
    w.anchors.push({
      ...a,
      id,
      sourceId: map[a.sourceId],
      noteId: map[a.noteId],
      state:
        a.contentHash && !w.attachments.some((x) => x.hash === a.contentHash)
          ? "unresolved"
          : a.state,
    });
  }
  for (const n of notes)
    n.body = n.body.replace(
      /(attachment:|#citation:)([0-9a-f-]{36})/gi,
      (all, prefix, id) => (map[id] ? prefix + map[id] : all),
    );
  for (const a of manifest.annotations ?? [])
    if (map[a.noteId] || a.publicationId)
      w.annotations.push({
        ...a,
        id: uid(),
        noteId: map[a.noteId] ?? a.noteId,
      });
  for (const r of manifest.review ?? [])
    if (r.front && r.back && r.schedule?.algorithm === "studyspace-1")
      w.review.push({
        ...r,
        id: uid(),
        sourceId: map[r.sourceId],
        subjectId: map[r.subjectId],
      });
  for (const a of manifest.ai ?? [])
    if (map[a.noteId]) w.ai.push({ ...a, id: uid(), noteId: map[a.noteId] });
  if (manifest.copies?.length)
    warnings.push(
      "Imported attribution is unverified. It cannot establish server-owned lineage.",
    );
  warnings.push(
    ...plan.files
      .filter((f) => f.kind === "excluded")
      .map((f) => f.path + ": " + f.reason),
  );
  return { imported: notes.length, skipped, warnings, notes };
}
function portableName(value: string) {
  const clean =
    value
      .normalize("NFC")
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
      .replace(/[. ]+$/, "") || "Untitled";
  return /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(clean)
    ? "_" + clean
    : clean;
}
export async function exportWorkspace(
  w: Workspace,
  options: {
    containerId?: string;
    noteId?: string;
    full?: boolean;
    loadAsset?: (a: Attachment) => Promise<Uint8Array>;
  },
) {
  const notes = w.notes.filter(
    (n) =>
      (options.full || !n.trashed) &&
      (!options.noteId || n.id === options.noteId) &&
      (!options.containerId ||
        ancestry(w, n.containerId).some((c) => c.id === options.containerId)),
  );
  const files: Record<string, Uint8Array> = {},
    mapping: Record<string, string> = {};
  const used = new Set<string>();
  for (const n of notes) {
    let path =
      ancestry(w, n.containerId)
        .map((c) => portableName(c.title))
        .join("/") +
      "/" +
      portableName(n.title) +
      ".md";
    let i = 2;
    const initial = path;
    while (used.has(path.toLowerCase()))
      path = initial.replace(/\.md$/, ` (${i++}).md`);
    used.add(path.toLowerCase());
    mapping[n.id] = path;
    files[path] = strToU8(n.body);
  }
  const contexts = new Set(
    notes.flatMap((n) => ancestry(w, n.containerId).map((c) => c.id)),
  );
  const defs = w.definitions.filter(
    (d) =>
      options.full || (!d.trashed && d.subjectIds.some((s) => contexts.has(s))),
  );
  const sources = w.sources.filter(
    (s) =>
      options.full ||
      s.noteIds.some((id) => mapping[id]) ||
      s.subjectIds.some((id) => contexts.has(id)),
  );
  const managed = (name: string, body: string) => {
    let path = name,
      i = 2;
    while (used.has(path.toLowerCase()))
      path = name.replace(".md", ` (${i++}).md`);
    files[path] = strToU8(body);
    used.add(path.toLowerCase());
  };
  managed(
    "Dictionary.md",
    "# Dictionary\n\n" +
      defs
        .sort((a, b) => a.term.localeCompare(b.term))
        .map(
          (d) =>
            `## ${d.term}\n\n<!-- studyspace-entry:${d.id} -->\n\n${d.definition}\n`,
        )
        .join("\n"),
  );
  managed(
    "Sources.md",
    "# Sources\n\n" +
      sources
        .map(
          (s) =>
            `- [${s.title}](${s.canonical})${s.authors.length ? " — " + s.authors.join(", ") : ""}`,
        )
        .join("\n"),
  );
  const assets = [];
  const assetMapping: Record<string, string> = {};
  if (options.loadAsset)
    for (const a of w.attachments.filter((a) => options.full || !a.trashed)) {
      if (
        options.full ||
        notes.some((n) => n.body.includes(a.id) || n.body.includes(a.filename))
      ) {
        const bytes = await options.loadAsset(a);
        if ((await sha256(bytes)) !== a.hash)
          throw new DomainError("Attachment checksum mismatch: " + a.filename);
        const assetPath = "assets/" + a.id + "/" + portableName(a.filename);
        files[assetPath] = bytes;
        assetMapping[a.id] = assetPath;
        assets.push(a);
      }
    }
  // Keep authoritative original Markdown in the manifest; portable files use relative asset paths.
  for (const n of notes) {
    const prefix = "../".repeat(mapping[n.id].split("/").length - 1);
    files[mapping[n.id]] = strToU8(
      n.body.replace(/attachment:([0-9a-f-]{36})/gi, (all, id) =>
        assetMapping[id] ? prefix + assetMapping[id] : all,
      ),
    );
  }
  const manifest = {
    schemaVersion: 1,
    exportedAt: now(),
    mapping,
    assetMapping,
    notes,
    containers: w.containers.filter((c) => options.full || contexts.has(c.id)),
    definitions: defs,
    sources,
    anchors: w.anchors.filter((a) => a.noteId && mapping[a.noteId]),
    attachments: assets,
    ...(options.full
      ? {
          annotations: w.annotations,
          review: w.review,
          copies: w.copies,
          ai: w.ai,
          settings: w.settings,
        }
      : {}),
  };
  files["studyspace-manifest.json"] = strToU8(
    JSON.stringify(manifest, null, 2),
  );
  return zipSync(files, { level: 6 });
}
export function downloadBytes(
  bytes: Uint8Array,
  name: string,
  mime = "application/zip",
) {
  const url = URL.createObjectURL(
    new Blob([Uint8Array.from(bytes)], { type: mime }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
