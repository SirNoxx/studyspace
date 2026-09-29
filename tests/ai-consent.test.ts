import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { emptyWorkspace, general, now } from "../src/lib/model";
import { createNote } from "../src/lib/domain";
const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  load: vi.fn(),
  rpc: vi.fn(),
  stream: vi.fn(),
}));
vi.mock("../src/lib/supabase/server", () => ({
  configured: () => true,
  requireUser: mocks.requireUser,
  adminClient: () => ({ rpc: mocks.rpc }),
}));
vi.mock("../src/lib/server/repository", () => ({
  loadWorkspace: mocks.load,
  assertSameOrigin: () => {},
  apiError: () =>
    Response.json({ error: "Sign in to continue." }, { status: 401 }),
}));
vi.mock("../src/lib/server/ai-response", () => ({
  streamStudyResponse: mocks.stream,
}));
import { POST } from "../src/app/api/ai/route";
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("AI_API_KEY", "synthetic-test-key");
  vi.stubEnv("AI_MODEL", "synthetic-test-model");
  mocks.requireUser.mockResolvedValue({ user: { id: "user" } });
  vi.stubEnv("AI_QUOTA_SECRET", "synthetic-quota-secret");
  mocks.rpc.mockResolvedValue({
    data: { allowed: true, remaining: 99, reset: "2026-09-30T00:00:00Z" },
  });
  mocks.stream.mockImplementation(
    () =>
      new ReadableStream({
        start(controller) {
          controller.close();
        },
      }),
  );
});
afterEach(() => vi.unstubAllEnvs());
function fixture() {
  const w = emptyWorkspace(),
    n = createNote(w, undefined, { body: "Local study material" });
  const payload = {
    action: "summarize",
    scope: "note",
    noteId: n.id,
    expectedRevision: n.revision,
    consent: true,
    localContext: { notes: [n], containers: [general(w)] },
  };
  return { w, payload };
}
const request = (body: unknown) =>
  new Request("http://localhost/api/ai", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
it("uses the explicitly shared local material without consulting a different cloud workspace", async () => {
  const { payload } = fixture();
  const response = await POST(request(payload));
  expect(response.status).toBe(200);
  expect(mocks.load).not.toHaveBeenCalled();
  expect(mocks.stream.mock.calls[0][1].passages[0].text).toBe(
    "Local study material",
  );
});
it("requires explicit local consent and honors revocation before contacting the provider", async () => {
  const { payload } = fixture();
  expect((await POST(request({ ...payload, consent: false }))).status).toBe(
    403,
  );
  expect(mocks.stream).not.toHaveBeenCalled();
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("accepts per-request consent while the cloud preference is still saving", async () => {
  const { w, payload } = fixture();
  mocks.load.mockResolvedValue(w);
  expect(
    (await POST(request({ ...payload, localContext: undefined }))).status,
  ).toBe(200);
  expect(mocks.stream).toHaveBeenCalledOnce();
});
it("allows explicitly shared local material without signing in", async () => {
  mocks.requireUser.mockRejectedValue(new Error("AUTH_REQUIRED"));
  expect((await POST(request(fixture().payload))).status).toBe(200);
  expect(mocks.stream).toHaveBeenCalledOnce();
  expect(mocks.load).not.toHaveBeenCalled();
});

it("never loads private cloud workspaces for guests", async () => {
  mocks.requireUser.mockRejectedValue(new Error("AUTH_REQUIRED"));
  expect(
    (await POST(request({ ...fixture().payload, localContext: undefined })))
      .status,
  ).toBe(401);
  expect(mocks.load).not.toHaveBeenCalled();
  expect(mocks.stream).not.toHaveBeenCalled();
});
it("reserves all usage before streaming and blocks when quotas fail", async () => {
  mocks.rpc.mockResolvedValue({
    data: { allowed: false, reason: "daily", reset: "2099-01-01T00:00:00Z" },
  });
  const response = await POST(request(fixture().payload));
  expect(response.status).toBe(429);
  expect(response.headers.get("Retry-After")).toBeTruthy();
  expect(mocks.stream).not.toHaveBeenCalled();
  mocks.rpc.mockResolvedValue({ error: { message: "unavailable" } });
  expect((await POST(request(fixture().payload))).status).toBe(503);
  expect(mocks.stream).not.toHaveBeenCalled();
});
