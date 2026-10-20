let sessionId: string | undefined;
/** A pseudonymous quota identifier, never an authentication credential. */
export function aiClientId() {
  try {
    const existing = localStorage.getItem("studyspace-ai-client");
    if (existing && /^[0-9a-f-]{36}$/i.test(existing)) return existing;
    const id = (sessionId ??= crypto.randomUUID());
    localStorage.setItem("studyspace-ai-client", id);
    return id;
  } catch {
    return (sessionId ??= crypto.randomUUID());
  }
}
