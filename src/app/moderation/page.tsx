"use client";
import { useEffect, useState } from "react";
export default function Moderation() {
  const [reports, setReports] = useState<any[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    fetch("/api/moderation")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok)
          throw new Error("An authorized moderator account is required.");
        setReports(d.reports ?? []);
      })
      .catch((e) => setError(e.message));
  }, []);
  return (
    <main className="policies">
      <a className="brand" href="/w">
        studyspace.
      </a>
      <h1>Moderator queue</h1>
      <p>
        Only server-assigned moderators can review reports or change public
        visibility. Actions are audited.
      </p>
      {error && <p role="alert">{error}</p>}
      {reports.map((r) => (
        <article key={r.id} className="inbox-request">
          <span className="badge">
            {r.status} · {r.category}
          </span>
          <p>{r.body}</p>
          <a href={"/p/" + r.publication_id} target="_blank">
            Review publication
          </a>
          <div className="inline-actions">
            {["hide", "restore"].map((action) => (
              <button
                key={action}
                className="secondary"
                onClick={async () => {
                  const response = await fetch("/api/moderation", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      publicationId: r.publication_id,
                      reportId: r.id,
                      action,
                    }),
                  });
                  setError(
                    response.ok
                      ? "Action applied and audited."
                      : "Action failed.",
                  );
                }}
              >
                {action === "hide" ? "Hide publication" : "Restore publication"}
              </button>
            ))}
          </div>
        </article>
      ))}
    </main>
  );
}
