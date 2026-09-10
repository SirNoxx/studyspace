// Built separately for an opaque-origin worker. Never imported by the app UI.
import {
  WASI,
  File,
  OpenFile,
  ConsoleStdout,
  PreopenDirectory,
} from "@bjorn3/browser_wasi_shim";

const scope = globalThis as unknown as {
  postMessage: (data: unknown) => void;
  onmessage: ((event: MessageEvent) => void) | null;
  close: () => void;
};
const send = scope.postMessage.bind(scope);
let size = 0,
  lines = 0,
  started = false;
const format = (value: unknown): string => {
  try {
    return typeof value === "string"
      ? value
      : (JSON.stringify(value, null, 2) ?? String(value));
  } catch {
    return String(value);
  }
};
const log = (...values: unknown[]) => {
  if (lines >= 500 || size >= 64000) return;
  const text = values
    .map(format)
    .join(" ")
    .slice(0, 64000 - size);
  size += text.length;
  lines++;
  if (text) send({ type: "output", text });
  if (lines >= 500 || size >= 64000) {
    send({ type: "output", text: "Output limit reached." });
    send({ type: "done" });
    scope.close();
  }
};
console.log = console.info = console.warn = console.error = console.debug = log;
const executing = () => send({ type: "executing" });
const phase = (text: string) => send({ type: "phase", text });
function outputStream() {
  const decoder = new TextDecoder();
  let pending = "";
  return {
    fd: new ConsoleStdout((bytes) => {
      pending += decoder.decode(bytes, { stream: true }).slice(0, 64000);
      let newline;
      while ((newline = pending.indexOf("\n")) >= 0) {
        log(pending.slice(0, newline));
        pending = pending.slice(newline + 1);
      }
      if (pending.length >= 64000) {
        log(pending);
        pending = "";
      }
    }),
    flush() {
      pending += decoder.decode();
      if (pending) log(pending);
      pending = "";
    },
  };
}

scope.onmessage = async (event: MessageEvent) => {
  if (started) return;
  started = true;
  const { code, language, stdin = "", assets } = event.data;
  try {
    if (
      typeof code !== "string" ||
      code.length > 100000 ||
      typeof stdin !== "string" ||
      stdin.length > 10000
    )
      throw new Error("Code or input is too large for this runner.");
    if (language === "javascript" || language === "typescript") {
      let source = code;
      if (language === "typescript") {
        phase("Loading TypeScript…");
        const { default: ts } = (await import(
          /* webpackIgnore: true */ assets + "typescript.mjs"
        )) as { default: typeof import("typescript-runtime") };
        const result = ts.transpileModule(code, {
          compilerOptions: {
            target: ts.ScriptTarget.ES2022,
            module: ts.ModuleKind.ESNext,
          },
          reportDiagnostics: true,
          fileName: "note.ts",
        });
        const errors =
          result.diagnostics?.filter(
            (d) => d.category === ts.DiagnosticCategory.Error,
          ) ?? [];
        if (errors.length)
          throw new Error(
            errors
              .map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"))
              .join("\n"),
          );
        source = result.outputText;
      }
      executing();
      const AsyncFunction = Object.getPrototypeOf(
        async function () {},
      ).constructor;
      const result = await new AsyncFunction("stdin", source)(stdin);
      if (result !== undefined) log(result);
    } else if (language === "python") {
      phase("Loading Python…");
      const { loadPyodide } = (await import(
        /* webpackIgnore: true */ assets + "python/pyodide.mjs"
      )) as typeof import("pyodide");
      const input = stdin ? stdin.replace(/\r\n/g, "\n").split("\n") : [];
      if (stdin.endsWith("\n")) input.pop();
      const py = await loadPyodide({
        indexURL: assets + "python/",
        stdout: log,
        stderr: log,
        stdin: () => input.shift() ?? null,
        jsglobals: Object.create(null),
      });
      executing();
      const result = await py.runPythonAsync(code);
      if (result !== undefined) {
        log(String(result));
        result?.destroy?.();
      }
    } else if (language === "sql") {
      phase("Loading SQLite…");
      const { default: init } = (await import(
        /* webpackIgnore: true */ assets + "sql.mjs"
      )) as { default: typeof import("sql.js").default };
      const SQL = await init({ locateFile: () => assets + "sql-wasm.wasm" });
      const db = new SQL.Database();
      executing();
      try {
        for (const statement of db.iterateStatements(code)) {
          const columns = statement.getColumnNames();
          if (columns.length) log(columns.join(" | "));
          let count = 0;
          while (statement.step()) {
            if (++count > 100) {
              log("Result limited to 100 rows.");
              break;
            }
            log(
              statement
                .get()
                .map((value) => (value === null ? "NULL" : String(value)))
                .join(" | "),
            );
          }
          if (columns.length) log(`${Math.min(count, 100)} row(s)`);
        }
      } finally {
        db.close();
      }
    } else if (language === "c" || language === "cpp") {
      phase("Loading C/C++ compiler (about 105 MB on first use)…");
      const clang = (await import(
        /* webpackIgnore: true */ assets + "clang/bundle.js"
      )) as { runClang: import("@yowasp/clang").Command };
      let lastPercent = -1;
      await clang.runClang(
        undefined,
        {},
        {
          fetchProgress: ({ doneLength, totalLength }) => {
            const percent = Math.floor((100 * doneLength) / totalLength);
            if (percent !== lastPercent) {
              lastPercent = percent;
              phase(`Loading C/C++ compiler… ${percent}%`);
            }
          },
        },
      );
      phase("Compiling…");
      const filename = language === "c" ? "main.c" : "main.cpp";
      const decoder = new TextDecoder();
      const diagnostics = (bytes: Uint8Array | null) => {
        if (bytes) log(decoder.decode(bytes));
      };
      const files = await clang.runClang(
        [
          language === "c" ? "clang" : "clang++",
          filename,
          language === "c" ? "-std=c17" : "-std=c++20",
          ...(language === "cpp" ? ["-fno-exceptions"] : []),
          "-O0",
          "-Wall",
          "-Wl,--max-memory=134217728",
          "-o",
          "program.wasm",
        ],
        { [filename]: code },
        { stdout: diagnostics, stderr: diagnostics, decodeASCII: false },
      );
      const binary = files?.["program.wasm"];
      if (!(binary instanceof Uint8Array))
        throw new Error(
          "Compilation did not produce an executable. Check the compiler output above.",
        );
      const encoder = new TextEncoder();
      const stdout = outputStream(),
        stderr = outputStream();
      const wasi = new WASI(
        [filename],
        [],
        [
          new OpenFile(new File(encoder.encode(stdin))),
          stdout.fd,
          stderr.fd,
          new PreopenDirectory(".", new Map()),
        ],
      );
      const module = await WebAssembly.compile(
        binary as Uint8Array<ArrayBuffer>,
      );
      const instance = await WebAssembly.instantiate(module, {
        wasi_snapshot_preview1: wasi.wasiImport,
      });
      executing();
      let exitCode;
      try {
        exitCode = wasi.start(instance as Parameters<typeof wasi.start>[0]);
      } finally {
        stdout.flush();
        stderr.flush();
      }
      if (exitCode !== 0) log(`Program exited with code ${exitCode}.`);
    } else if (language === "json") {
      executing();
      log(JSON.stringify(JSON.parse(code), null, 2));
      log("Valid JSON.");
    } else throw new Error("This language does not have a configured runtime.");
    send({ type: "done" });
  } catch (error) {
    send({ type: "error", text: String(error).slice(0, 6000) });
  }
};
