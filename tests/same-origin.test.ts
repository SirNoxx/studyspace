import { it, expect } from "vitest";
import { assertRequestOrigin } from "../src/lib/server/same-origin";
it("accepts the actual listener host when Next uses an internal localhost URL", () => {
  const r = new Request("http://localhost:3107/api/social", {
    headers: { host: "127.0.0.1:3107", origin: "http://127.0.0.1:3107" },
  });
  expect(() => assertRequestOrigin(r, "https://study.example")).not.toThrow();
});
it("rejects cross-origin pages and ignores forwarded-host spoofing", () => {
  for (const origin of [
    "https://attacker.example",
    "http://127.0.0.1:3000",
    "null",
  ]) {
    const r = new Request("http://localhost:3107/api/social", {
      headers: {
        host: "127.0.0.1:3107",
        origin,
        "x-forwarded-host": "attacker.example",
      },
    });
    expect(() => assertRequestOrigin(r, "https://study.example")).toThrow(
      "ORIGIN_REJECTED",
    );
  }
});
it("permits the explicitly configured HTTPS public origin behind a proxy", () => {
  const r = new Request("http://localhost:3000/api/social", {
    headers: { host: "internal:3000", origin: "https://study.example" },
  });
  expect(() => assertRequestOrigin(r, "https://study.example")).not.toThrow();
});
