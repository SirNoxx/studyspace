import { beforeEach, afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), rpc: vi.fn() }));
vi.mock("../src/lib/supabase/server", () => ({
  requireUser: mocks.user,
  adminClient: () => ({ rpc: mocks.rpc }),
}));
import { POST } from "../src/app/api/transcripts/route";
const request = (body: unknown) =>
  new Request("http://localhost/api/transcripts", {
    method: "POST",
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.stubEnv("SUPADATA_API_KEY", "synthetic-provider-key");
  mocks.user.mockResolvedValue({ user: { id: "owner-a" } });
  mocks.rpc.mockResolvedValue({ data: true });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
it("returns a title and transcript with server-only authentication", async () => {
  const fetcher = vi.fn(async (url: string) =>
    Response.json(
      url.includes("oembed")
        ? { title: "Lecture" }
        : { content: "Full lesson text", lang: "en" },
    ),
  );
  vi.stubGlobal("fetch", fetcher);
  const response = await POST(request({ url: "https://youtu.be/abcdefghijk" }));
  expect(await response.json()).toMatchObject({
    status: "ready",
    title: "Lecture",
    text: "Full lesson text",
  });
  expect(fetcher.mock.calls[1][0]).toContain(
    "https://api.supadata.ai/v1/transcript?",
  );
  expect(mocks.rpc).toHaveBeenCalledWith(
    "consume_quota",
    expect.objectContaining({ p_bucket: "transcripts", p_owner: "owner-a" }),
  );
});
it("binds asynchronous jobs to their owner and original video", async () => {
  const fetcher = vi.fn(async (url: string) =>
    Response.json(
      url.includes("oembed") ? { title: "Lecture" } : { jobId: "job-123" },
    ),
  );
  vi.stubGlobal("fetch", fetcher);
  const started = await (
    await POST(request({ url: "https://youtu.be/abcdefghijk" }))
  ).json();
  mocks.user.mockResolvedValue({ user: { id: "owner-b" } });
  expect(
    (
      await POST(
        request({
          url: "https://youtu.be/abcdefghijk",
          jobToken: started.jobToken,
        }),
      )
    ).status,
  ).toBe(400);
  mocks.user.mockResolvedValue({ user: { id: "owner-a" } });
  fetcher.mockImplementation(async () =>
    Response.json({
      status: "completed",
      content: "Finished lesson",
      lang: "en",
    }),
  );
  expect(
    await (
      await POST(
        request({
          url: "https://youtu.be/abcdefghijk",
          jobToken: started.jobToken,
        }),
      )
    ).json(),
  ).toMatchObject({ status: "ready", text: "Finished lesson" });
});
it("requires authentication and gives a manual-import fallback without a provider key", async () => {
  const fetcher = vi.fn(async () => Response.json({ title: "Lecture" }));
  vi.stubGlobal("fetch", fetcher);
  mocks.user.mockRejectedValueOnce(new Error("AUTH_REQUIRED"));
  expect(
    (await POST(request({ url: "https://youtu.be/abcdefghijk" }))).status,
  ).toBe(401);
  expect(fetcher).not.toHaveBeenCalled();
  vi.stubEnv("SUPADATA_API_KEY", "");
  const response = await POST(request({ url: "https://youtu.be/abcdefghijk" }));
  expect(response.status).toBe(503);
  expect((await response.json()).error).toContain("SUPADATA_API_KEY");
  expect(mocks.rpc).not.toHaveBeenCalled();
});
