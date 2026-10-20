const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { build } = require("esbuild");
const output = path.resolve(
  __dirname,
  "../../test-results/spreadsheet-feasibility",
);

async function serve() {
  fs.mkdirSync(output, { recursive: true });
  await build({
    entryPoints: [path.join(__dirname, "fixture.ts")],
    bundle: true,
    outfile: path.join(output, "fixture.js"),
    format: "esm",
    minify: true,
    loader: { ".woff2": "file", ".woff": "file", ".ttf": "file" },
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
  });
  const html = `<!doctype html><html lang="en"><head><meta charset="UTF-8"><title>Studyspace Sheets engine evaluation</title><link rel="stylesheet" href="/fixture.css"></head><body style="margin:0"><h1 style="font:18px system-ui;margin:12px">Studyspace Sheets — isolated engine evaluation</h1><div id="sheet" style="height:650px"></div><div id="second" style="height:650px"></div><script type="module" src="/fixture.js"></script></body></html>`;
  const server = http.createServer((req, res) => {
    const name = new URL(req.url, "http://localhost").pathname.slice(1);
    if (!name) {
      res.setHeader("Content-Type", "text/html");
      return res.end(html);
    }
    // Serve build artifacts only, never dependency files or arbitrary paths.
    if (!/^[a-zA-Z0-9_.-]+$/.test(name)) {
      res.writeHead(404);
      return res.end();
    }
    fs.readFile(path.join(output, name), (error, data) => {
      if (error) {
        res.writeHead(404);
        return res.end();
      }
      res.setHeader(
        "Content-Type",
        name.endsWith(".js")
          ? "text/javascript"
          : name.endsWith(".css")
            ? "text/css"
            : "application/octet-stream",
      );
      res.end(data);
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { server, output, url: `http://127.0.0.1:${server.address().port}` };
}
module.exports = { serve };
if (require.main === module)
  serve()
    .then(({ url }) => console.log(`Spreadsheet evaluation: ${url}`))
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
