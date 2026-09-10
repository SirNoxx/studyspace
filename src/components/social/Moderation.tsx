"use client";
import { Status, useAction, useSocial } from "./common";
import { type SocialRow } from "@/lib/social";
export default function Moderation() {
  const badge = useSocial("badges");
  return badge.data?.moderator ? <Queue /> : null;
}
function Queue() {
  const q = useSocial("reports"),
    a = useAction();
  return (
    <details className="social-card">
      <summary>Moderation queue</summary>
      <Status loading={q.loading} error={q.error || a.error} retry={q.reload} />
      {q.data?.items.map((r: SocialRow) => (
        <article key={r.id} className="social-card">
          <h3>{r.kind} report</h3>
          <p>{r.reason}</p>
          <details>
            <summary>Reported evidence</summary>
            <pre>{JSON.stringify(r.evidence, null, 2)}</pre>
          </details>
          <div className="social-row">
            {[
              "resolve",
              "dismiss",
              ...(["post", "comment"].includes(r.kind)
                ? ["hide"]
                : r.kind === "profile"
                  ? ["suspend"]
                  : []),
            ].map((decision) => (
              <button
                disabled={a.busy}
                key={decision}
                onClick={() =>
                  a.run("moderate", { id: r.id, decision }, q.reload)
                }
              >
                {decision}
              </button>
            ))}
          </div>
        </article>
      ))}
      {q.data && !q.data.items.length && <p>No open reports.</p>}
    </details>
  );
}
