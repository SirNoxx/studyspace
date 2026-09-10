import { beforeEach, it, expect, vi } from "vitest";
import { emptyWorkspace } from "../src/lib/model";
import { publicNameFromMetadata } from "../src/lib/public-name";
const db = vi.hoisted(() => ({
  rpc: vi.fn(),
  auth: { admin: { getUserById: vi.fn() } },
}));
vi.mock("../src/lib/supabase/server", () => ({ adminClient: () => db }));
import { loadWorkspace } from "../src/lib/server/repository";
beforeEach(() => vi.resetAllMocks());
it("uses the signup public name only when initializing a workspace", async () => {
  db.rpc
    .mockResolvedValueOnce({ data: null })
    .mockResolvedValueOnce({ data: 1 });
  db.auth.admin.getUserById.mockResolvedValue({
    data: { user: { user_metadata: { username: "  Study Friend  " } } },
  });
  const w = await loadWorkspace("owner");
  expect(w.settings.displayName).toBe("Study Friend");
  expect(db.rpc.mock.calls[1][1].p_state.settings.displayName).toBe(
    "Study Friend",
  );
});
it("preserves existing profile edits", async () => {
  const existing = emptyWorkspace();
  existing.settings.displayName = "My chosen name";
  db.rpc.mockResolvedValue({
    data: { settings: existing.settings, records: [] },
  });
  expect((await loadWorkspace("owner")).settings.displayName).toBe(
    "My chosen name",
  );
  expect(db.auth.admin.getUserById).not.toHaveBeenCalled();
});
it("falls back safely for old or malformed metadata", () => {
  expect(publicNameFromMetadata(undefined)).toBe("Researcher");
  expect(
    publicNameFromMetadata({ username: "\n", display_name: "Legacy name" }),
  ).toBe("Legacy name");
  expect(publicNameFromMetadata({ username: { admin: true } })).toBe(
    "Researcher",
  );
});
