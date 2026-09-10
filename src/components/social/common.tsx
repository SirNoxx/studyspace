"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  socialCommand,
  socialQuery,
  SocialError,
  type SocialRow,
} from "@/lib/social";
import { Modal } from "../ui";

export function useSocial(
  kind: string,
  id?: string | null,
  filter: Record<string, string> = {},
  poll = false,
) {
  const [data, setData] = useState<SocialRow | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [refresh, setRefresh] = useState(0);
  const key = JSON.stringify(filter);
  const previous = useRef("");
  useEffect(() => {
    let alive = true;
    const abort = new AbortController();
    const identity = JSON.stringify([kind, id, key]);
    if (previous.current !== identity) setData(null);
    previous.current = identity;
    setLoading(true);
    let reading = false;
    let revision: string | undefined;
    async function read() {
      if (reading) return;
      reading = true;
      try {
        const value = await socialQuery(
          kind,
          id,
          {
            ...JSON.parse(key),
            ...(kind === "collection" && revision ? { revision } : {}),
          },
          abort.signal,
        );
        if (alive) {
          if (!value.notModified) {
            setData(value);
            revision = value.collection?.revision?.toString();
          }
          setError("");
        }
      } catch (e) {
        if (alive && !abort.signal.aborted) {
          setError((e as Error).message);
          if (e instanceof SocialError && [401, 403].includes(e.status)) {
            setData(null);
            if (kind === "collection" && id) {
              try {
                for (let i = sessionStorage.length - 1; i >= 0; i--) {
                  const k = sessionStorage.key(i);
                  if (
                    k?.startsWith("studyspace:shared-draft:") &&
                    k.includes(":" + id + ":")
                  )
                    sessionStorage.removeItem(k);
                }
              } catch {}
            }
          }
        }
      } finally {
        reading = false;
        if (alive) setLoading(false);
      }
    }
    void read();
    const timer = poll
      ? setInterval(() => {
          if (document.visibilityState === "visible") void read();
        }, 5000)
      : null;
    return () => {
      alive = false;
      abort.abort();
      if (timer) clearInterval(timer);
    };
  }, [kind, id, key, poll, refresh]);
  return {
    data,
    error,
    loading,
    reload: useCallback(() => setRefresh((x) => x + 1), []),
  };
}
export function useAction() {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const pending = useRef<{ key: string; id: string } | null>(null);
  const run = async (
    action: string,
    data: SocialRow,
    done?: (result: SocialRow) => void,
  ) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    const key = JSON.stringify([action, data]);
    if (pending.current?.key !== key)
      pending.current = { key, id: crypto.randomUUID() };
    try {
      const result = await socialCommand(action, data, pending.current.id);
      pending.current = null;
      done?.(result);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return { run, error, busy, setError };
}
export function Status({
  error,
  loading,
  retry,
}: {
  error?: string;
  loading?: boolean;
  retry?: () => void;
}) {
  return (
    <>
      {loading && <p role="status">Loading…</p>}
      {error && (
        <div className="social-error" role="alert">
          {error} {retry && <button onClick={retry}>Try again</button>}{" "}
          {error.includes("Sign in") && <a href="/auth">Sign in</a>}
        </div>
      )}
    </>
  );
}
export function OnlineStatus() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const change = () => setOnline(navigator.onLine);
    change();
    window.addEventListener("online", change);
    window.addEventListener("offline", change);
    return () => {
      window.removeEventListener("online", change);
      window.removeEventListener("offline", change);
    };
  }, []);
  return !online ? (
    <p className="social-error" role="status">
      You’re offline. Keep this page open to preserve your draft, then retry
      when connected.
    </p>
  ) : null;
}
export function Report({
  kind,
  id,
  onClose,
}: {
  kind: string;
  id: string;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const a = useAction();
  return (
    <Modal
      title="Report to Studyspace"
      onClose={onClose}
      description="A moderator can review this content. Conversation reports include the most recent 20 messages."
    >
      <form
        className="social-form"
        onSubmit={(e) => {
          e.preventDefault();
          void a.run("report", { kind, id, reason }, onClose);
        }}
      >
        <label>
          What happened?
          <textarea
            required
            maxLength={2000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <Status error={a.error} />
        <button className="primary" disabled={a.busy}>
          Send report
        </button>
      </form>
    </Modal>
  );
}
export function Avatar({ profile }: { profile: SocialRow }) {
  return profile.avatar ? (
    <img className="social-avatar" src={profile.avatar} alt="" />
  ) : (
    <span className="social-avatar">
      {(profile.username || "S").slice(0, 1).toUpperCase()}
    </span>
  );
}
export function DateLabel({ value }: { value: string }) {
  return <time dateTime={value}>{new Date(value).toLocaleString()}</time>;
}
