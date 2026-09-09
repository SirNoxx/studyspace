import { lookup } from "node:dns/promises";
import { Agent, request } from "undici";
import ipaddr from "ipaddr.js";
export function publicAddress(address: string) {
  try {
    const ip = ipaddr.process(address.replace(/^\[|\]$/g, ""));
    return ip.range() === "unicast";
  } catch {
    return false;
  }
}
export async function guardedFetch(
  input: string,
  options: {
    maxBytes?: number;
    timeout?: number;
    allowedHosts?: string[];
  } = {},
) {
  let url = new URL(input);
  const max = options.maxBytes ?? 2 * 1024 * 1024;
  for (let redirect = 0; redirect <= 4; redirect++) {
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      throw new Error("Only public HTTP(S) sources are supported.");
    if (url.port && !["80", "443"].includes(url.port))
      throw new Error("Nonstandard source ports are not supported.");
    if (options.allowedHosts && !options.allowedHosts.includes(url.hostname))
      throw new Error("Metadata provider redirect rejected.");
    const host = url.hostname.replace(/^\[|\]$/g, "");
    const records = ipaddr.isValid(host)
      ? [
          {
            address: host,
            family: ipaddr.parse(host).kind() === "ipv6" ? 6 : 4,
          },
        ]
      : await lookup(host, { all: true, verbatim: true });
    if (!records.length || records.some((r) => !publicAddress(r.address)))
      throw new Error(
        "This source does not resolve to a public internet address.",
      );
    const selected = records[0];
    // The connection uses the validated address, retaining the original host for TLS.
    const agent = new Agent({
      connect: {
        lookup: ((_hostname: any, opts: any, cb: any) =>
          opts.all
            ? cb(null, [selected])
            : cb(null, selected.address, selected.family)) as any,
        timeout: options.timeout ?? 10000,
      },
    });
    try {
      const response = await request(url, {
        dispatcher: agent,
        headers: {
          "user-agent": "Studyspace/0.1 research-source-reader",
          "accept-encoding": "identity",
        },
        headersTimeout: options.timeout ?? 10000,
        bodyTimeout: options.timeout ?? 10000,
        signal: AbortSignal.timeout(options.timeout ?? 15000),
      });
      if (
        response.statusCode >= 300 &&
        response.statusCode < 400 &&
        response.headers.location
      ) {
        await response.body.dump();
        url = new URL(String(response.headers.location), url);
        continue;
      }
      if (
        response.headers["content-encoding"] &&
        response.headers["content-encoding"] !== "identity"
      ) {
        await response.body.dump();
        throw new Error(
          "Compressed source response is not supported by this bounded reader.",
        );
      }
      if (Number(response.headers["content-length"] ?? 0) > max) {
        response.body.destroy();
        throw new Error("Source exceeds the reader size limit.");
      }
      const chunks: Uint8Array[] = [];
      let total = 0;
      for await (const chunk of response.body) {
        total += chunk.length;
        if (total > max) {
          response.body.destroy();
          throw new Error("Source exceeds the reader size limit.");
        }
        chunks.push(chunk);
      }
      return {
        status: response.statusCode,
        headers: response.headers,
        text: Buffer.concat(chunks).toString("utf8"),
        url: url.toString(),
      };
    } finally {
      await agent.close();
    }
  }
  throw new Error("The source redirects too many times.");
}
