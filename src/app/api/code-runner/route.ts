import { codeRunnerCsp, codeRunnerDocument } from "@/lib/code-runner-document";
export function GET(request: Request) {
  const url = new URL(request.url);
  if (request.headers.get("host")) url.host = request.headers.get("host")!;
  const protocol = request.headers
    .get("x-forwarded-proto")
    ?.split(",")[0]
    .trim();
  if (protocol === "https" || protocol === "http")
    url.protocol = protocol + ":";
  const origin = url.origin;
  return new Response(codeRunnerDocument(origin), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": codeRunnerCsp(origin),
      "X-Frame-Options": "SAMEORIGIN",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Cache-Control": "no-store",
    },
  });
}
