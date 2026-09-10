/** Next's internal URL can use localhost behind the production listener. The
 * browser's Host header still names the actual destination and cannot be set
 * by a cross-origin page. Never trust a client-supplied forwarded host here. */
export function assertRequestOrigin(
  request: Request,
  configuredOrigin = process.env.NEXT_PUBLIC_APP_URL,
) {
  const origin = request.headers.get("origin");
  if (!origin) return;
  const url = new URL(request.url),
    host = request.headers.get("host");
  let destination = url.origin;
  if (host && !/[\s/@\\]/.test(host)) {
    try {
      destination = new URL(url.protocol + "//" + host).origin;
    } catch {}
  }
  if (origin !== destination && origin !== configuredOrigin)
    throw new Error("ORIGIN_REJECTED");
}
