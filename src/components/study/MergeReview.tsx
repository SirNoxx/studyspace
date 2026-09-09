"use client";
import {
  checkpointMerge,
  undoMerge,
  mappedReferences,
  copyPath,
  copyRelativePath,
} from "@/lib/merge-checkpoint";
import { localDB } from "@/lib/store";
import { sha256 } from "@/lib/transfer";
import type { Attachment } from "@/lib/model";
import { useEffect, useState } from "react";
import {
  GitBranch,
  ArrowDown,
  Check,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import type { AppContext } from "../WorkspaceApp";
import { Modal } from "../ui";
import { type Snapshot, type PublicNote, uid, now } from "@/lib/model";
import { diffNote, saveNote, createNote, fingerprint } from "@/lib/domain";
import Markdown from "../Markdown";
import { recordChanges, applyRecordDecision } from "@/lib/merge-records";
export default function MergeReview({
  ctx,
  copyId,
  onClose,
}: {
  ctx: AppContext;
  copyId: string;
  onClose: () => void;
}) {
  const copy = ctx.w.copies.find((c) => c.id === copyId)!;
  const [upstream, setUpstream] = useState<Snapshot | null>(null),
    [error, setError] = useState(""),
    [decisions, setDecisions] = useState<Record<string, string>>({}),
    [index, setIndex] = useState(0),
    [baselineFingerprint] = useState(() =>
      fingerprint(ctx.w, Object.values(copy.mapping)),
    ),
    [resolutions, setResolutions] = useState<Record<string, string>>({});
  useEffect(() => {
    if (ctx.demo) {
      setUpstream(
        ctx.w.publications.find(
          (p) => p.id === copy.publicationId && p.status === "published",
        )?.current ?? null,
      );
    } else
      fetch("/api/publications?id=" + copy.publicationId)
        .then((r) => r.json())
        .then((d) => setUpstream(d.snapshot ?? null))
        .catch(() =>
          setError("Upstream is currently unavailable. Your copy is intact."),
        );
  }, []);
  const ids = [
    ...new Set([
      ...Object.keys(copy.accepted),
      ...(upstream?.notes.map((n) => n.id) ?? []),
    ]),
  ];
  const noteChanges = ids
    .map((id) => {
      const base = copy.accepted[id] ?? null,
        localNote = ctx.w.notes.find(
          (n) => n.id === copy.mapping[id] && !n.trashed,
        );
      const local: PublicNote | null = localNote
        ? {
            id,
            title: localNote.title,
            body: mappedReferences(
              localNote.body,
              Object.fromEntries(
                Object.entries(copy.mapping).map(([a, b]) => [b, a]),
              ),
            ),
            path: copyRelativePath(
              ctx.w,
              copy,
              localNote.containerId,
              base?.path ?? "",
            ),
            revision: localNote.revision,
          }
        : null;
      const next = upstream?.notes.find((n) => n.id === id) ?? null;
      return {
        id,
        kind: "notes" as const,
        base,
        local,
        upstream: next,
        ...diffNote(base, local, next),
      };
    })
    .filter((c) => c.status !== "unchanged");
  const changes = [
    ...noteChanges,
    ...(upstream ? recordChanges(ctx.w, copy, upstream) : []),
  ];
  const current = changes[index];
  return (
    <Modal
      title="A conversation with the original"
      description="Review upstream changes while keeping your own thinking intact."
      onClose={onClose}
      wide
    >
      <div
        className="lineage-tree"
        role="list"
        aria-label="Attribution lineage"
      >
        {copy.lineage.map((node, i) => (
          <div role="listitem" key={i}>
            <GitBranch size={16} />
            <span>
              {node.author}
              <strong>
                {node.title} · v{node.version}
              </strong>
            </span>
            <ArrowDown size={14} />
          </div>
        ))}
        <div role="listitem">
          <span className="current-lineage">
            <Check size={15} />
          </span>
          <span>
            Your private study copy
            <strong>
              {ctx.w.containers.find((c) => c.id === copy.containerId)?.title}
            </strong>
          </span>
        </div>
      </div>
      {!upstream ? (
        <p className="quiet-callout">
          The source is unavailable or has been unpublished. Your independent
          copy remains editable.
        </p>
      ) : !changes.length ? (
        <p className="quiet-callout">
          <Check size={18} />
          You’re up to date with version {upstream.version}.
        </p>
      ) : (
        <>
          <div className="merge-summary">
            <span>
              Source v{copy.baseline.version} → v{upstream.version}
            </span>
            <strong>{changes.length} changed items</strong>
            <p>{upstream.summary}</p>
          </div>
          <div className="merge-item-tabs">
            {changes.map((c, i) => (
              <button
                key={c.id}
                className={i === index ? "active" : ""}
                onClick={() => setIndex(i)}
              >
                {c.upstream?.title ?? c.local?.title ?? c.base?.title}
                <span
                  className={
                    "badge " + (c.status === "conflict" ? "danger" : "")
                  }
                >
                  {c.status}
                </span>
              </button>
            ))}
          </div>
          {current && (
            <>
              <div className="diff-columns">
                <section>
                  <h3>Your current version</h3>
                  <Markdown body={current.local?.body ?? "*Deleted locally*"} />
                </section>
                <section>
                  <h3>Upstream version</h3>
                  <Markdown
                    body={current.upstream?.body ?? "*Removed upstream*"}
                  />
                </section>
              </div>
              <label className="field">
                <span>Decision for this item</span>
                <select
                  value={decisions[current.id] ?? "skip"}
                  onChange={(e) =>
                    setDecisions((d) => ({
                      ...d,
                      [current.id]: e.target.value,
                    }))
                  }
                >
                  <option value="skip">
                    Skip for now · keep this baseline
                  </option>
                  {current.status === "safe" && (
                    <option value="merge">Apply nonconflicting update</option>
                  )}
                  <option value="mine">
                    Keep mine · acknowledge this upstream version
                  </option>
                  <option value="upstream">Accept upstream</option>
                  <option value="both">Keep both</option>
                  {current.kind === "notes" && (
                    <option value="edit">Write a resolution</option>
                  )}
                </select>
              </label>
              {decisions[current.id] === "edit" && (
                <textarea
                  aria-label="Merged resolution"
                  rows={8}
                  value={resolutions[current.id] ?? current.local?.body ?? ""}
                  onChange={(e) =>
                    setResolutions((r) => ({
                      ...r,
                      [current.id]: e.target.value,
                    }))
                  }
                />
              )}
            </>
          )}
        </>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {copy.mergeCheckpoint && (
        <button
          className="secondary"
          onClick={async () => {
            if (ctx.demo) {
              ctx.mutate(
                (w) =>
                  undoMerge(
                    w,
                    w.copies.find((c) => c.id === copyId)!,
                  ),
                "Previous merge restored; current note text remains in history.",
              );
              onClose();
            } else {
              const r = await fetch("/api/merge", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  action: "undo",
                  copyId,
                  expectedRevision: ctx.w.revision,
                }),
              });
              if (!r.ok) {
                setError((await r.json()).error);
                return;
              }
              location.reload();
            }
          }}
        >
          Undo last merge · {new Date(copy.mergeCheckpoint.at).toLocaleString()}
        </button>
      )}
      <div className="dialog-footer">
        <button className="secondary" onClick={onClose}>
          Close without changes
        </button>
        <button
          className="primary"
          disabled={
            !changes.length ||
            !Object.values(decisions).some((d) => d !== "skip")
          }
          onClick={async () => {
            if (
              fingerprint(ctx.w, Object.values(copy.mapping)) !==
              baselineFingerprint
            ) {
              setError(
                "Your copy changed while this preview was open. Reopen the comparison before applying updates.",
              );
              return;
            }
            if (!ctx.demo) {
              const r = await fetch("/api/merge", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  copyId,
                  upstreamId: upstream!.id,
                  fingerprint: baselineFingerprint,
                  decisions,
                  resolutions,
                  expectedRevision: ctx.w.revision,
                }),
              });
              const d = await r.json();
              if (!r.ok) {
                setError(d.error);
                return;
              }
              location.reload();
              return;
            }
            const assets: Record<string, Attachment> = {};
            try {
              const db = await localDB();
              for (const change of changes.filter(
                (c) => c.kind === "attachments",
              )) {
                if (
                  !["merge", "upstream", "both"].includes(
                    decisions[change.id],
                  ) ||
                  !change.upstream
                )
                  continue;
                const a = upstream!.attachments!.find(
                  (a) => a.id === change.id,
                )!;
                const blob = await db.get("assets", a.id);
                if (
                  !blob ||
                  (await sha256(new Uint8Array(await blob.arrayBuffer()))) !==
                    a.hash
                )
                  throw new Error(
                    "This published attachment version is unavailable on the device.",
                  );
                const id = uid();
                await db.put("assets", blob, id);
                assets[a.id] = { ...a, id, key: id, createdAt: now() };
              }
            } catch (e) {
              setError((e as Error).message);
              return;
            }
            ctx.mutate((w) => {
              const c = w.copies.find((c) => c.id === copyId)!;
              checkpointMerge(w, c);
              for (const change of [...changes].sort(
                (a, b) =>
                  Number(b.kind === "attachments") -
                  Number(a.kind === "attachments"),
              )) {
                const decision = decisions[change.id];
                if (!decision || decision === "skip") continue;
                if (change.kind !== "notes") {
                  applyRecordDecision(
                    w,
                    c,
                    change,
                    decision,
                    assets[change.id],
                  );
                  continue;
                }
                const localId = c.mapping[change.id];
                const n = w.notes.find((n) => n.id === localId);
                let result =
                  decision === "merge"
                    ? change.result
                    : decision === "upstream"
                      ? change.upstream
                      : change.local;
                if (decision === "edit")
                  result = {
                    ...(change.local ?? change.upstream!),
                    body: resolutions[change.id] ?? change.local?.body ?? "",
                  };
                if (decision === "both" && change.upstream)
                  createNote(w, c.containerId, {
                    title: change.upstream.title + " · upstream",
                    body: change.upstream.body,
                  });
                if (decision !== "mine" && decision !== "both") {
                  if (result) {
                    if (n)
                      saveNote(
                        w,
                        n.id,
                        n.revision,
                        {
                          title: result.title,
                          body: mappedReferences(result.body, c.mapping),
                        },
                        "Merge checkpoint",
                      );
                    else {
                      const created = createNote(w, c.containerId, {
                        title: result.title,
                        body: mappedReferences(result.body, c.mapping),
                      });
                      c.mapping[change.id] = created.id;
                    }
                  } else if (n) {
                    saveNote(
                      w,
                      n.id,
                      n.revision,
                      { body: n.body + "\n" },
                      "Before upstream deletion",
                    );
                    n.trashed = true;
                  }
                }
                const updated = w.notes.find(
                  (n) => n.id === c.mapping[change.id],
                );
                if (updated && result && !["mine", "both"].includes(decision))
                  updated.containerId = copyPath(w, c, result.path);
                c.accepted[change.id] = change.upstream;
              }
              if (
                changes.every(
                  (ch) => decisions[ch.id] && decisions[ch.id] !== "skip",
                )
              )
                c.baseline = structuredClone(upstream!);
            }, "Selected updates applied. Previous content is in note history.");
            onClose();
          }}
        >
          Apply selected updates <Check size={15} />
        </button>
      </div>
    </Modal>
  );
}
