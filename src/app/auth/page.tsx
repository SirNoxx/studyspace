"use client";
import { useState } from "react";
import { BookOpen, ArrowRight, Eye, EyeOff } from "lucide-react";
import { browserClient } from "@/lib/supabase/browser";
import { usernameSchema } from "@/lib/public-name";
export default function Auth() {
  const [mode, setMode] = useState<"signin" | "signup" | "reset">("signin"),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [showPassword, setShowPassword] = useState(false);
  const changeMode = (nextMode: typeof mode) => {
    setMode(nextMode);
    setShowPassword(false);
    setMessage("");
  };
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
              const username =
                mode === "signup"
                  ? usernameSchema.safeParse(data.get("username"))
                  : null;
              if (username && !username.success) {
                setMessage(username.error.issues[0].message);
                return;
              }
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
                    data: {
                      username: username!.data,
                      display_name: username!.data,
                    },
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
          {mode === "signup" && (
            <div className="auth-username-field">
              <label htmlFor="signup-username">Username</label>
              <input
                id="signup-username"
                name="username"
                autoComplete="nickname"
                minLength={2}
                maxLength={40}
                required
                placeholder="Your public name"
                aria-describedby="username-hint"
              />
              <small id="username-hint" className="field-hint">
                This name appears on your shared study material and public
                profile.
              </small>
            </div>
          )}
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
            <div className="auth-password-field">
              <label htmlFor="auth-password">Password</label>
              <div className="password-input">
                <input
                  id="auth-password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete={
                    mode === "signup" ? "new-password" : "current-password"
                  }
                  minLength={8}
                  required
                />
                <button
                  type="button"
                  className="password-toggle"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  aria-controls="auth-password"
                  onClick={() => setShowPassword((visible) => !visible)}
                >
                  {showPassword ? (
                    <EyeOff size={18} aria-hidden="true" />
                  ) : (
                    <Eye size={18} aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>
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
            disabled={busy}
            onClick={() => changeMode(mode === "signup" ? "signin" : "signup")}
          >
            {mode === "signup"
              ? "Already have an account?"
              : "Create an account"}
          </button>
          <button disabled={busy} onClick={() => changeMode("reset")}>
            Forgot password?
          </button>
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
