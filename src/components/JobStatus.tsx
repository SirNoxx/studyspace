"use client";
import { useEffect, useState } from "react";
import { RefreshCw, Download, X } from "lucide-react";
export default function JobStatus({ demo }: { demo: boolean }) {
  const [jobs, setJobs] = useState<any[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    if (demo) return;
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch("/api/jobs");
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        if (!cancelled) setJobs(d.jobs ?? []);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    };
    void load();
    const timer = setInterval(() => void load(), 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [demo]);
  return (
    <div className="job-status">
      <h3>Background jobs</h3>
      {demo ? (
        <p className="field-hint">
          Local imports and exports run on this device. Hosted workspaces use
          the durable worker queue.
        </p>
      ) : (
        <>
          {error && <p className="form-error">{error}</p>}
          {!jobs.length && (
            <p className="field-hint">No background jobs yet.</p>
          )}
          {jobs.map((j) => (
            <div className="job-row" key={j.id}>
              <div>
                <strong>{j.kind}</strong>
                <small>
                  {j.status} · attempt {j.attempts}
                  {j.status === "running" ? " · " + j.progress + "%" : ""}
                </small>
                {j.error && <p>{j.error}</p>}
                {j.kind === "export" &&
                  ["queued", "running"].includes(j.status) && (
                    <>
                      <progress
                        aria-label="Export preparation"
                        max={100}
                        value={
                          j.status === "queued" || j.result?.indeterminate
                            ? undefined
                            : j.progress
                        }
                      />
                      <small>
                        {j.result?.phase ?? "Waiting for the export worker…"}
                      </small>
                    </>
                  )}
                {j.kind === "export" &&
                  j.status === "succeeded" &&
                  !j.result?.expired && (
                    <small>
                      Archive ready. Choose Download; your browser manages the
                      transfer.
                    </small>
                  )}
                {j.result?.expired && (
                  <small>
                    Export download expired. Request a fresh export.
                  </small>
                )}
                {j.result?.warnings?.length > 0 && (
                  <details>
                    <summary>{j.result.warnings.length} import notices</summary>
                    {j.result.warnings.map((w: string, i: number) => (
                      <p key={i}>{w}</p>
                    ))}
                  </details>
                )}
              </div>
              {j.result?.snapshot && (
                <a href={"/p/" + j.result.snapshot.publicationId}>
                  Open publication
                </a>
              )}
              {j.result?.containerId && (
                <a href={"/w/collection/" + j.result.containerId}>
                  Open imported collection
                </a>
              )}
              {j.result?.objectKey && !j.result?.expired && (
                <a
                  aria-label="Download completed export"
                  href={"/api/jobs/" + j.id}
                >
                  <Download size={15} />
                </a>
              )}
              {["failed", "cancelled"].includes(j.status) && (
                <button
                  onClick={async () => {
                    await fetch("/api/jobs", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ action: "retry", id: j.id }),
                    });
                  }}
                >
                  <RefreshCw size={14} />
                  Retry
                </button>
              )}
              {["queued", "running"].includes(j.status) && (
                <button
                  onClick={async () => {
                    await fetch("/api/jobs", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ action: "cancel", id: j.id }),
                    });
                  }}
                >
                  <X size={14} />
                  Cancel
                </button>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
