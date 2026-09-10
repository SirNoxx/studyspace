// User code runs only inside a worker created by an opaque-origin, network-restricted
// iframe. Never evaluate note content in the app origin or the desktop main process.
export function runStudyCode(
  code: string,
  onOutput: (text: string) => void,
  onDone: () => void,
  options: {
    language?: string;
    stdin?: string;
    onPhase?: (text: string) => void;
  } = {},
): () => void {
  const frame = document.createElement("iframe");
  frame.hidden = true;
  frame.title = "Isolated code runner";
  frame.sandbox.add("allow-scripts");
  const token = crypto.randomUUID();
  let finished = false;
  const cleanup = () => {
    if (finished) return;
    finished = true;
    clearTimeout(timeout);
    clearTimeout(executionTimeout);
    window.removeEventListener("message", receive);
    frame.contentWindow?.postMessage({ type: "stop", token }, "*");
    frame.remove();
    onDone();
  };
  let outputSize = 0;
  let executionTimeout: ReturnType<typeof setTimeout> | undefined;
  let executing = false;
  const receive = (event: MessageEvent) => {
    if (event.source !== frame.contentWindow) return;
    const data = event.data;
    if (data?.type === "ready" && data.channel === "studyspace-code") {
      frame.contentWindow?.postMessage(
        {
          token,
          code,
          language: options.language ?? "javascript",
          stdin: options.stdin ?? "",
        },
        "*",
      );
      return;
    }
    if (data?.token !== token) return;
    if (data.type === "phase" && typeof data.text === "string")
      options.onPhase?.(data.text.slice(0, 150));
    if (data.type === "executing" && !executing) {
      executing = true;
      options.onPhase?.("Running…");
      executionTimeout = setTimeout(() => {
        onOutput("Stopped after 5 seconds.");
        cleanup();
      }, 5000);
    }
    if (
      (data.type === "output" || data.type === "error") &&
      typeof data.text === "string"
    ) {
      const text = data.text.slice(0, Math.max(0, 64000 - outputSize));
      outputSize += text.length;
      if (text) onOutput(text);
      if (data.type === "error" || outputSize >= 64000) cleanup();
    } else if (data.type === "done") cleanup();
  };
  window.addEventListener("message", receive);
  const timeout = setTimeout(() => {
    onOutput("Runtime loading or compilation took too long. Try Run again.");
    cleanup();
  }, 120000);
  frame.src = "/api/code-runner";
  document.body.append(frame);
  return cleanup;
}
