import DOMPurify from "dompurify";

export function codePreview(code: string, language: "html" | "css") {
  // No script execution, forms, navigation or external resources in previews.
  const content =
    language === "html"
      ? DOMPurify.sanitize(code, {
          USE_PROFILES: { html: true },
          FORBID_TAGS: [
            "script",
            "iframe",
            "object",
            "embed",
            "form",
            "input",
            "meta",
            "link",
            "base",
            "audio",
            "video",
            "source",
          ],
          FORBID_ATTR: [
            "href",
            "src",
            "srcset",
            "action",
            "formaction",
            "target",
            "ping",
            "background",
          ],
        })
      : `<style>${code.replace(/</g, "\\3c ")}</style><main><h1>CSS preview</h1><p>Style this sample with your CSS.</p><section class="card sample-card"><h2>A sample card</h2><p>A paragraph with <strong>bold text</strong> and <em>emphasis</em>.</p><button>Sample button</button><ul><li>First item</li><li>Second item</li></ul></section></main>`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; form-action 'none'; base-uri 'none'"><style>body{font:16px system-ui;margin:20px;color:#24342e;background:#fff}*{box-sizing:border-box}</style></head><body>${content}</body></html>`;
}
