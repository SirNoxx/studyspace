import { z } from "zod";
import { sessionClient, requireUser } from "@/lib/supabase/server";
import { assertSameOrigin } from "@/lib/server/repository";

export const dynamic = "force-dynamic";
const queries = z.enum([
  "profile",
  "people",
  "feed",
  "comments",
  "conversations",
  "messages",
  "shared",
  "collection",
  "versions",
  "badges",
  "reports",
]);
const actions = z.enum([
  "profile",
  "block",
  "follow",
  "topic",
  "post",
  "post-edit",
  "post-delete",
  "comment",
  "comment-edit",
  "comment-delete",
  "save",
  "download",
  "request",
  "conversation",
  "message",
  "read",
  "collection",
  "invite",
  "invitation",
  "member",
  "leave",
  "node-create",
  "node-save",
  "node-delete",
  "node-restore",
  "asset",
  "asset-delete",
  "report",
  "moderate",
]);
const headers = { "Cache-Control": "private, no-store" };
const messages: Record<string, string> = {
  COMMUNITY_UNAVAILABLE:
    "This community feature is temporarily unavailable. Please try again later.",
  AUTH_REQUIRED: "Sign in to use your community account.",
  ACCESS_DENIED: "You no longer have permission to access this content.",
  INVITE_SELF:
    "You already own this collection. Enter the other person's account ID to invite them.",
  INVITEE_UNAVAILABLE:
    "No account was found for that ID. Ask the other person to copy their account ID from their Studyspace profile.",
  INVALID_ACCOUNT_ID:
    "Enter the other person's complete account ID, or select their public username.",
  PROFILE_PRIVATE: "This profile is private or unavailable.",
  PUBLIC_PROFILE_REQUIRED:
    "Make your profile public before posting to Discover.",
  REQUESTS_DISABLED: "This person is not accepting message requests.",
  CONVERSATION_EXISTS:
    "A conversation or request already exists. Open Messages to continue.",
  CONVERSATION_NOT_ACCEPTED:
    "Messaging requires an accepted conversation and no active block.",
  BLOCKED:
    "This action is unavailable while either person has blocked the other.",
  RATE_LIMIT:
    "You have reached the daily limit for this action. Please try again tomorrow.",
  REVISION_CONFLICT:
    "A collaborator changed this file. Your draft is retained. Compare both versions before saving.",
  FOLDER_CYCLE:
    "A folder cannot be moved inside itself or one of its descendants.",
  INVALID_PARENT: "Choose an available folder in this shared collection.",
  MOVE_CHILDREN_FIRST:
    "Move or delete the contents before deleting this folder.",
  TRANSFER_OWNERSHIP_FIRST:
    "Transfer ownership before leaving this collection.",
  INVITATION_REVOKED: "This invitation is no longer valid.",
  INVALID_USERNAME:
    "Use 3–32 letters, numbers or underscores for your username.",
};
function failure(error: unknown, operation: string) {
  const e = error as { message?: string; code?: string };
  const code =
    e.code === "23505"
      ? "DUPLICATE"
      : e.message && messages[e.message]
        ? e.message
        : e.code === "40001"
          ? "REVISION_CONFLICT"
          : "FAILED";
  // No message bodies, profile fields, identifiers or tokens in server logs.
  console.warn("social_operation_failed", { operation, code: e.code ?? code });
  return Response.json(
    {
      error:
        code === "DUPLICATE"
          ? "That username, request or invitation already exists."
          : (messages[code] ??
            "This action could not be completed. Your draft has been retained."),
      code,
    },
    {
      status:
        code === "COMMUNITY_UNAVAILABLE"
          ? 503
          : code === "AUTH_REQUIRED"
            ? 401
            : e.code === "42501"
              ? 403
              : code === "REVISION_CONFLICT"
                ? 409
                : code === "RATE_LIMIT"
                  ? 429
                  : 400,
      headers,
    },
  );
}
export async function GET(request: Request) {
  if (process.env.SOCIAL_ENABLED === "false")
    return Response.json(
      { error: "Community features are temporarily unavailable." },
      { status: 503, headers },
    );
  try {
    const url = new URL(request.url);
    const kind = queries.parse(url.searchParams.get("kind") ?? "feed");
    const id = z.uuid().nullable().parse(url.searchParams.get("id"));
    const filter: Record<string, string> = {};
    for (const key of [
      "q",
      "feed",
      "category",
      "before",
      "beforeId",
      "sequence",
      "revision",
    ]) {
      const value = url.searchParams.get(key);
      if (value !== null) filter[key] = z.string().max(300).parse(value);
    }
    const client = await sessionClient();
    const { data, error } = await client.rpc("community_query", {
      p_kind: kind,
      p_id: id,
      p_filter: filter,
    });
    if (error) throw error;
    return Response.json(data, { headers });
  } catch (error) {
    return failure(error, "query");
  }
}
export async function POST(request: Request) {
  if (process.env.SOCIAL_ENABLED === "false")
    return Response.json(
      { error: "Community features are temporarily unavailable." },
      { status: 503, headers },
    );
  let action = "unknown";
  try {
    assertSameOrigin(request);
    const { client } = await requireUser();
    const reader = request.body?.getReader();
    if (!reader) throw new Error("INVALID_INPUT");
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 7500000) {
        await reader.cancel();
        return Response.json(
          { error: "The upload is too large." },
          { status: 413, headers },
        );
      }
      chunks.push(value);
    }
    const raw = Buffer.concat(chunks).toString("utf8");
    const input = z
      .object({
        action: actions,
        data: z.record(z.string(), z.unknown()),
        requestId: z.uuid(),
      })
      .parse(JSON.parse(raw));
    action = input.action;
    if (action === "invite") {
      const target = z
        .uuid()
        .safeParse(
          typeof input.data.target === "string"
            ? input.data.target.trim()
            : input.data.target,
        );
      if (!target.success) throw new Error("INVALID_ACCOUNT_ID");
      input.data.target = target.data;
    }
    const { data, error } = await client.rpc("community_command", {
      p_action: input.action,
      p_data: input.data,
      p_request: input.requestId,
    });
    if (error) throw error;
    return Response.json(data, { headers });
  } catch (error) {
    return failure(error, action);
  }
}
