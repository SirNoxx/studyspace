"use client";
import { useEffect, useState } from "react";
import { diffLines } from "diff";
import type { Snapshot } from "@/lib/model";
export default function VersionHistory({
  publicationId,
  current,
}: {
  publicationId: string;
  current: Snapshot;
}) {
  const [versions, setVersions] = useState<Snapshot[]>([current]),
    [selected, setSelected] = useState(current.id),
    [error, setError] = useState("");
  useEffect(() => {
    fetch("/api/publications?id=" + publicationId + "&versions=1")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        setVersions(d.versions ?? [current]);
      })
      .catch((e) => setError(e.message));
  }, [publicationId]);
  const next = versions.find((v) => v.id === selected) ?? current,
    base = versions.find((v) => v.version === next.version - 1);
  return (
    <section>
      <label className="field">
        <span>Published version</span>
        <select value={selected} onChange={(e) => setSelected(e.target.value)}>
          {versions.map((v) => (
            <option key={v.id} value={v.id}>
              Version {v.version} · {new Date(v.createdAt).toLocaleDateString()}
            </option>
          ))}
        </select>
      </label>
      <p>{next.summary}</p>
      {error && <p role="alert">{error}</p>}
      {[
        ...new Set([
          ...(base?.notes.map((n) => n.id) ?? []),
          ...next.notes.map((n) => n.id),
        ]),
      ].map((id) => {
        const a = base?.notes.find((n) => n.id === id),
          b = next.notes.find((n) => n.id === id);
        if (a?.body === b?.body && a?.title === b?.title) return null;
        return (
          <details key={id}>
            <summary>
              {b?.title ?? a?.title} ·{" "}
              {!a
                ? "Added"
                : !b
                  ? "Removed"
                  : a.title !== b.title
                    ? "Renamed & changed"
                    : "Changed"}
            </summary>
            <pre className="text-diff">
              {diffLines(a?.body ?? "", b?.body ?? "").map((part, i) => (
                <span
                  key={i}
                  className={
                    part.added
                      ? "diff-added"
                      : part.removed
                        ? "diff-removed"
                        : ""
                  }
                >
                  {part.added ? "+ " : part.removed ? "- " : "  "}
                  {part.value}
                </span>
              ))}
            </pre>
          </details>
        );
      })}
      <p className="field-hint">
        This history contains only immutable published snapshots. Private draft
        revisions are never included.
      </p>
    </section>
  );
}
