"use client";
import { useEffect, useRef, useState } from "react";
import {
  socialCursor,
  socialQuery,
  socialCommand,
  type SocialRow,
} from "@/lib/social";
import {
  DateLabel,
  OnlineStatus,
  Report,
  Status,
  useAction,
  useSocial,
} from "./common";

export default function Messages() {
  const q = useSocial("conversations", null, {}, true);
  const [selected, setSelected] = useState<SocialRow | null>(null),
    [older, setOlder] = useState<SocialRow[]>([]),
    [error, setError] = useState("");
  const items = [...(q.data?.items || []), ...older];
  return (
    <section className="social-page">
      <OnlineStatus />
      <h1>Messages</h1>
      <p>
        Conversations begin with a request. You choose who can contact you in
        your profile.
      </p>
      <Status loading={q.loading} error={q.error || error} retry={q.reload} />
      <div className="social-split">
        <nav className="social-conversations" aria-label="Conversations">
          {!items.length && !q.loading && (
            <p>No conversations yet. Find a study partner in Discover.</p>
          )}
          {items.map((c) => (
            <button
              className="social-card"
              aria-pressed={selected?.id === c.id}
              key={c.id}
              onClick={() => setSelected(c)}
            >
              <strong>@{c.username}</strong>
              <span>
                {c.status}
                {c.unread > 0 ? ` · ${c.unread} unread` : ""}
              </span>
            </button>
          ))}
          {items.length > 0 && items.length % 30 === 0 && (
            <button
              onClick={async () => {
                try {
                  const more = await socialQuery(
                    "conversations",
                    null,
                    socialCursor(items),
                  );
                  setOlder([...older, ...more.items]);
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Older conversations
            </button>
          )}
        </nav>
        {selected ? (
          <Conversation key={selected.id} selected={selected} />
        ) : (
          <div className="social-card">Choose a conversation to read it.</div>
        )}
      </div>
    </section>
  );
}
function Conversation({ selected }: { selected: SocialRow }) {
  const q = useSocial("messages", selected.id, {}, true),
    a = useAction();
  const [body, setBody] = useState(""),
    [older, setOlder] = useState<SocialRow[]>([]),
    [report, setReport] = useState(false);
  const watermark = useRef(0);
  const c = q.data?.conversation;
  const all = [
    ...new Map(
      [...older, ...(q.data?.items || [])].map((m) => [m.id, m]),
    ).values(),
  ].sort((a, b) => a.sequence - b.sequence);
  useEffect(() => {
    if (
      !q.data ||
      document.visibilityState !== "visible" ||
      !document.hasFocus()
    )
      return;
    const highest = Math.max(
      0,
      ...q.data.items.map((m: SocialRow) => m.sequence),
    );
    if (highest <= watermark.current) return;
    watermark.current = highest;
    void socialCommand("read", { id: selected.id, sequence: highest }).catch(
      () => {
        watermark.current = 0;
      },
    );
  }, [q.data, selected.id]);
  return (
    <div className="social-chat">
      <div className="social-row">
        <h2>@{selected.username}</h2>
        <button onClick={() => setReport(true)}>Report</button>
        {c && !q.data?.blocked && (
          <button
            disabled={a.busy}
            onClick={() =>
              a.run(
                "block",
                {
                  target:
                    c.requester === q.data?.viewer ? c.recipient : c.requester,
                  enabled: !q.data?.blocked,
                },
                q.reload,
              )
            }
          >
            Block
          </button>
        )}
      </div>
      <Status error={q.error || a.error} loading={q.loading} retry={q.reload} />
      {c && (
        <>
          {q.data?.blocked && (
            <p className="social-error">
              Messaging is blocked. Manage your own blocked accounts in your
              profile.
            </p>
          )}
          {c.status === "pending" && (
            <div className="social-card">
              <p>
                {c.recipient === q.data?.viewer
                  ? "This person would like to talk with you."
                  : "Your request is waiting for a response. You can send more after it is accepted."}
              </p>
              {c.recipient === q.data?.viewer &&
                ["accepted", "declined", "ignored"].map((s) => (
                  <button
                    key={s}
                    disabled={a.busy || q.data?.blocked}
                    onClick={() =>
                      a.run("conversation", { id: c.id, status: s }, q.reload)
                    }
                  >
                    {
                      {
                        accepted: "Accept",
                        declined: "Decline",
                        ignored: "Ignore",
                      }[s]
                    }
                  </button>
                ))}
            </div>
          )}
          {["declined", "ignored"].includes(c.status) && (
            <p>This conversation is closed.</p>
          )}
          <div className="social-message-list" aria-label="Message history">
            {all.length >= 40 && (
              <button
                onClick={async () => {
                  try {
                    const more = await socialQuery("messages", c.id, {
                      sequence: String(all[0].sequence),
                    });
                    setOlder([...more.items, ...all]);
                    if (!more.items.length)
                      a.setError(
                        "You’ve reached the beginning of this conversation.",
                      );
                  } catch (e) {
                    a.setError((e as Error).message);
                  }
                }}
              >
                Load older messages
              </button>
            )}
            {all.map((m) => (
              <article
                key={m.id}
                className={
                  "social-bubble " +
                  (m.owner_id === q.data?.viewer ? "mine" : "")
                }
              >
                <small>
                  {m.owner_id === q.data?.viewer ? "You" : selected.username}
                </small>
                <p>{m.body}</p>
                <DateLabel value={m.created_at} />
              </article>
            ))}
          </div>
          <form
            className="social-form"
            onSubmit={(e) => {
              e.preventDefault();
              void a.run("message", { id: c.id, body }, () => {
                setBody("");
                q.reload();
              });
            }}
          >
            <label>
              Message
              <textarea
                aria-label="Message"
                required
                maxLength={8000}
                value={body}
                disabled={c.status !== "accepted" || q.data?.blocked}
                onChange={(e) => setBody(e.target.value)}
              />
            </label>
            <button
              className="primary"
              disabled={a.busy || c.status !== "accepted" || q.data?.blocked}
            >
              Send message
            </button>
            <small>
              Drafts stay on this page if sending fails. Retry sends the same
              message once.
            </small>
          </form>
        </>
      )}
      {report && (
        <Report
          kind="conversation"
          id={selected.id}
          onClose={() => setReport(false)}
        />
      )}
    </div>
  );
}
export function MessageBadge({ enabled }: { enabled: boolean }) {
  return enabled ? <Badge /> : null;
}
export function ProfileAvatar({
  enabled,
  fallback,
}: {
  enabled: boolean;
  fallback: string;
}) {
  return enabled ? <AccountAvatar fallback={fallback} /> : <>{fallback}</>;
}
function AccountAvatar({ fallback }: { fallback: string }) {
  const q = useSocial("badges", null, {}, true);
  const p = q.data?.identity;
  return p?.avatar ? (
    <img
      src={p.avatar}
      alt=""
      style={{
        width: "100%",
        height: "100%",
        objectFit: "cover",
        borderRadius: "50%",
      }}
    />
  ) : (
    <>{p?.username?.slice(0, 1).toUpperCase() || fallback}</>
  );
}
function Badge() {
  const q = useSocial("badges", null, {}, true);
  return q.data?.messages > 0 ? (
    <span className="social-badge">
      {q.data?.messages > 99 ? "99+" : q.data?.messages}
    </span>
  ) : null;
}
