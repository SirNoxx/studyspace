import { normalizeWorkspace } from "../enhancements";
import { adminClient } from "../supabase/server";
import {
  emptyWorkspace,
  type Workspace,
  type LocalPublication,
} from "../model";
import { validateWorkspace } from "../domain";
import { publicNameFromMetadata } from "../public-name";
export async function loadWorkspace(owner: string): Promise<Workspace> {
  const db = adminClient();
  const { data: ws, error } = await db.rpc("read_workspace", {
    p_owner: owner,
  });
  if (error) throw error;
  if (!ws) {
    const initial = emptyWorkspace();
    // Only initialize a new workspace. Existing public names and later edits win.
    const { data: account, error: accountError } =
      await db.auth.admin.getUserById(owner);
    if (accountError) throw accountError;
    initial.settings.displayName = publicNameFromMetadata(
      account.user?.user_metadata,
    );
    const { data, error } = await db.rpc("commit_workspace", {
      p_owner: owner,
      p_expected: 0,
      p_state: initial,
    });
    if (error?.code === "40001") return loadWorkspace(owner);
    if (error) throw error;
    initial.revision = data;
    return initial;
  }
  const w: Workspace = {
    ...emptyWorkspace(),
    ...ws,
  };
  delete (w as unknown as Record<string, unknown>).records;
  for (const row of ws.records as { kind: keyof Workspace; data: unknown }[])
    (w[row.kind as keyof Workspace] as unknown[]).push(row.data);
  w.publications = w.publications.filter((p) => p.current);
  return normalizeWorkspace(w);
}
export async function persistWorkspace(
  owner: string,
  w: Workspace,
  expected: number,
) {
  validateWorkspace(w);
  const { data, error } = await adminClient().rpc("commit_workspace", {
    p_owner: owner,
    p_expected: expected,
    p_state: w,
  });
  if (error) throw error;
  return Number(data);
}
export { assertRequestOrigin as assertSameOrigin } from "./same-origin";
export function apiError(error: unknown) {
  const e = error as { message?: string; code?: string };
  const conflict =
    e.code === "40001" || e.message?.includes("REVISION_CONFLICT");
  const auth = e.message === "AUTH_REQUIRED";
  return Response.json(
    {
      error: conflict
        ? "Your workspace changed in another session. Your draft is retained; reload or keep both."
        : auth
          ? "Sign in to continue."
          : e.message?.includes("STAGED_OBJECT_EXPIRED")
            ? "A staged file expired before saving. Your draft is retained; upload that file again."
            : e.message?.includes("configur")
              ? e.message
              : "The operation could not be completed. Your existing data is retained.",
      code: conflict ? "CONFLICT" : auth ? "AUTH_REQUIRED" : "FAILED",
    },
    {
      status: conflict ? 409 : auth ? 401 : 400,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
