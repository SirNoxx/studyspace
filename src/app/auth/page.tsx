"use client";
import { useState } from "react";
import { BookOpen, ArrowRight } from "lucide-react";
import { browserClient } from "@/lib/supabase/browser";
export default function Auth() {
  const [mode, setMode] = useState<"signin" | "signup" | "reset">("signin"),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <main className="auth-page">
      <a className="brand" href="/">
        <BookOpen size={24} /> studyspace<span className="brand-dot">.</span>
      </a>
      <div className="auth-panel">
        <div className="eyebrow">A PLACE FOR UNDERSTANDING</div>
        <h1>
          {mode === "signup"
            ? "Make room for your ideas."
            : mode === "reset"
              ? "Find your way back."
              : "Welcome back."}
        </h1>
        <p>
          Collect what matters. Connect your ideas. Make knowledge your own.
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setMessage("");
            const data = new FormData(e.currentTarget);
            try {
              const client = browserClient();
              const email = String(data.get("email")),
                password = String(data.get("password"));
              const returnTo = new URLSearchParams(location.search).get("next");
              const next =
                returnTo?.startsWith("/") && !returnTo.startsWith("//")
                  ? returnTo
                  : "/w";
              if (mode === "reset") {
                const { error } = await client.auth.resetPasswordForEmail(
                  email,
                  {
                    redirectTo:
                      location.origin + "/auth/callback?next=/w/settings",
                  },
                );
                if (error) throw error;
                setMessage(
                  "If an account exists, a recovery link has been sent.",
                );
              } else if (mode === "signup") {
                const { data, error } = await client.auth.signUp({
                  email,
                  password,
                  options: {
                    emailRedirectTo:
                      location.origin +
                      "/auth/callback?next=" +
                      encodeURIComponent(next),
                  },
                });
                if (error) throw error;
                if (data.session) location.href = next;
                else setMessage("Check your email to confirm your account.");
              } else {
                const { error } = await client.auth.signInWithPassword({
                  email,
                  password,
                });
                if (error) throw error;
                location.href = next;
              }
            } catch (error) {
              setMessage((error as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Email
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@example.com"
            />
          </label>
          {mode !== "reset" && (
            <label>
              Password
              <input
                name="password"
                type="password"
                autoComplete={
                  mode === "signup" ? "new-password" : "current-password"
                }
                minLength={8}
                required
              />
            </label>
          )}
          <button className="primary" disabled={busy}>
            {busy
              ? "Please wait…"
              : mode === "signup"
                ? "Create account"
                : mode === "reset"
                  ? "Send recovery link"
                  : "Sign in"}
            <ArrowRight size={16} />
          </button>
        </form>
        <p role="status">{message}</p>
        <div className="auth-actions">
          <button
            onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
          >
            {mode === "signup"
              ? "Already have an account?"
              : "Create an account"}
          </button>
          <button onClick={() => setMode("reset")}>Forgot password?</button>
        </div>
        <a className="muted" href="/demo">
          Explore the local demo
        </a>
      </div>
      <footer>
        Your workspace is private. Publishing is always your choice.
      </footer>
    </main>
  );
}
