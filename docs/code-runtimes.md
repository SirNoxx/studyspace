# Local code execution

The Run button supports every language currently offered in Studyspace's code-block dropdown. Execution requires an explicit click. Opening, importing, previewing a publication or reading a note never executes its code.

## Runtime behavior

- JavaScript runs in an async function inside a worker. Use console output, return values, or the supplied `stdin` string. There is no DOM or Node.js environment.
- TypeScript 6.0.3 transpiles a single snippet to JavaScript. Enums, interfaces and annotations are supported; syntax diagnostics are returned. This does not perform full semantic type checking. Imports of npm packages are unavailable. The browser compiler is a separate pinned dependency from the app's TypeScript 7 build tool.
- Python uses Pyodide 314.0.6 with its bundled standard library and a fresh virtual filesystem. `input()` reads pre-entered stdin. External packages and native extensions are unavailable.
- C17 and C++20 use YoWASP Clang/LLVM `22.0.0-git20542-10` and the browser WASI shim. Standard input/output and temporary virtual files work. C++ exceptions are disabled because this toolchain's supplied standard library lacks exception runtime symbols. Native OS APIs, subprocesses, networking and additional dependencies are unavailable.
- SQL uses sql.js 1.14.2 (SQLite). Every run gets a new in-memory database, completely separate from Supabase. A result set displays up to 100 rows.
- HTML renders sanitized markup in a sandboxed, script-disabled iframe. CSS styles a sample page. External resources, forms, script execution and navigation are disabled. HTML may include inline CSS.
- JSON validates syntax and prints formatted data or the parse error.

The UI offers input, Run, Stop, temporary output and progress. Run replaces prior output; rerunning starts a fresh environment. Editing, collapsing, copying and sending code to AI retain the original source. Input and output are not saved to the note.

## Isolation and limits

The `/api/code-runner` document has an opaque origin via `sandbox="allow-scripts"`; it cannot access its parent or the Studyspace session. A classic blob bootstrap dynamically imports the module runtime to avoid Chromium's rejection of module-worker entry URLs with opaque origins. Execution itself remains in a worker.

The runner CSP permits only blob scripts and the current server's `/code-runtime/` assets. Private API paths and external destinations are blocked. Runtime assets are public with wildcard CORS, without credential permission. The normal app CSP remains unchanged; only the runner route is excluded from the global CSP and provides its own. HTML/CSS previews additionally remove navigation attributes and embedded documents and disable all scripts.

Run time is capped at five seconds, with a separate absolute 120-second ceiling covering runtime download and compilation. The execution deadline can be armed only once per run; repeated worker status messages cannot extend it. Output is capped at 64,000 characters and 500 worker output messages. Code is limited to 100,000 characters and stdin to 10,000. C/C++ programs have a 128 MiB WebAssembly memory limit; compiler and Python memory are managed by the browser. Stop removes the frame and terminates its worker. This is a browser learning environment, not a sandbox for native operating-system programs.

## Build and release

`node scripts/prepare-code-runtimes.mjs` generates `public/code-runtime/` from pinned npm dependencies. Both the dev and production build scripts run it automatically. Generated binary assets are ignored by Git and copied into standalone output with the rest of `public/`. Desktop staging uses that standalone output. No compilation server or provider key is needed.

C/C++ compiler resources total about 105 MB before transport compression; Python is about 14 MB. These are loaded on demand. Runtime assets use the server's normal static-file revalidation rather than an indefinitely cached, unversioned URL. No compiler asset is part of the initial note UI bundle. The existing installed desktop release must be rebuilt to include these changes.

To roll back execution, restore the JavaScript runner and disable the additional runtime buttons together; leave language syntax support and stored code untouched. Removing generated assets alone produces a recoverable runtime-loading error without affecting note content.

## Sources and maintenance

- [TypeScript compiler API](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API), Apache-2.0.
- [Pyodide](https://github.com/pyodide/pyodide), MPL-2.0 with upstream Python and bundled component licenses.
- [YoWASP Clang](https://github.com/YoWASP/clang), including LLVM and its bundled standard-library licensing. The upstream wrapper repository is archived; the pinned toolchain should be reviewed before future compiler upgrades.
- [Browser WASI shim](https://github.com/bjorn3/browser_wasi_shim), MIT / Apache-2.0.
- [sql.js](https://github.com/sql-js/sql.js), MIT; SQLite is public domain.
- [DOMPurify](https://github.com/cure53/DOMPurify), MPL-2.0 / Apache-2.0.

`e2e/code-languages.spec.ts` executes real programs, repeats them, exercises standard input and compile failures, and checks preview isolation, denied network calls and stop/retry. The existing notebook test verifies the five-second runaway-code deadline and saved source after collapse/reload. Run these against a production build before release so development-only CSP behavior cannot hide a regression.

Validation on September 10, 2026: the isolated Webpack production build passed; all 102 unit tests passed; 26 production Chromium browser checks passed, including all nine language/format options, repeat runs, stdin, compiler errors, Stop/Run recovery, blocked network calls, execution timeout, templates, Quick notes and module layout. The main production app's CSP still disallows dynamic evaluation. HTTPS forwarding was checked for the runner's runtime-asset policy. The installed desktop application was not rebuilt or restarted.
