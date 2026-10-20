import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { adminClient } from "@/lib/supabase/server";
import { studyBatches, type buildAIContext } from "./ai";
import { studyRequest, type StudyRequestInput } from "./ai-request";

function limit(name: string, fallback: number) {
  const value = Number(process.env[name] ?? fallback);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}
export const aiDailyLimit = () => limit("AI_FREE_DAILY_REQUEST_LIMIT", 100);
export type QuotaEntry = {
  key: string;
  window: "day" | "minute";
  requests: number;
  tokens: number;
  cost: number;
  reason: string;
};
export type QuotaResult = {
  allowed: boolean;
  reason?: string;
  remaining?: number;
  reset?: string;
};

export function quotaEntries(
  request: Request,
  userId: string | undefined,
  cost: number,
): QuotaEntry[] {
  const secret =
    process.env.AI_QUOTA_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.AI_API_KEY;
  if (!secret) throw Error("AI quota identity is not configured.");
  const hash = (value: string) =>
    createHmac("sha256", secret).update(value).digest("hex");
  // Vercel overwrites this header at its edge. Other hosts must explicitly configure a trusted proxy header.
  const header =
    process.env.VERCEL === "1"
      ? "x-vercel-forwarded-for"
      : process.env.AI_TRUSTED_IP_HEADER;
  const address = header
    ? request.headers.get(header)?.split(",")[0].trim()
    : undefined;
  // Group IPv6 privacy addresses by /64 so rotating interface IDs does not reset network limits.
  let normalized = address;
  if (address && isIP(address) === 6) {
    const canonical = new URL(`http://[${address}]/`).hostname.slice(1, -1);
    const [head, tail] = canonical.split("::"),
      left = head ? head.split(":") : [],
      right = tail ? tail.split(":") : [];
    const groups =
      tail === undefined
        ? left
        : [
            ...left,
            ...Array(8 - left.length - right.length).fill("0"),
            ...right,
          ];
    normalized =
      groups
        .slice(0, 4)
        .map((v) => parseInt(v, 16).toString(16))
        .join(":") + "::/64";
  }
  const network =
    normalized && isIP(address!)
      ? hash(`network:${normalized}`)
      : hash("network:unavailable");
  const supplied = request.headers.get("x-studyspace-ai-client") ?? "";
  const client =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      supplied,
    )
      ? hash(`device:${supplied}`)
      : network;
  const dailyTokens = limit("AI_FREE_DAILY_TOKEN_BUDGET", 2000000);
  const entries: QuotaEntry[] = [
    {
      key: `device:${client}`,
      window: "day",
      requests: aiDailyLimit(),
      tokens: dailyTokens,
      cost,
      reason: "daily",
    },
    {
      key: `device:${client}`,
      window: "minute",
      requests: 8,
      tokens: dailyTokens,
      cost,
      reason: "burst",
    },
    {
      key: `network:${network}`,
      window: "day",
      requests: limit("AI_NETWORK_DAILY_REQUEST_LIMIT", 1000),
      tokens: limit("AI_NETWORK_DAILY_TOKEN_BUDGET", 10000000),
      cost,
      reason: "network",
    },
    {
      key: `network:${network}`,
      window: "minute",
      requests: 30,
      tokens: dailyTokens * 5,
      cost,
      reason: "burst",
    },
    {
      key: "global",
      window: "day",
      requests: limit("AI_GLOBAL_DAILY_REQUEST_LIMIT", 2000),
      tokens: limit("AI_GLOBAL_DAILY_TOKEN_BUDGET", 20000000),
      cost,
      reason: "global",
    },
  ];
  if (userId)
    entries.push({
      key: `account:${hash(userId)}`,
      window: "day",
      requests: aiDailyLimit(),
      tokens: dailyTokens,
      cost,
      reason: "daily",
    });
  return entries;
}

/** Conservatively reserve UTF-8 bytes plus maximum output tokens for EVERY provider call, before any call starts. */
export function studyCost(
  input: StudyRequestInput,
  context: ReturnType<typeof buildAIContext>,
) {
  return studyBatches(context).reduce((sum, _, i) => {
    const payload = studyRequest(input, context, i);
    return (
      sum +
      Buffer.byteLength(JSON.stringify(payload), "utf8") +
      payload.max_output_tokens +
      1024
    );
  }, 0);
}

export async function reserveAI(
  request: Request,
  userId: string | undefined,
  cost: number,
): Promise<QuotaResult> {
  const entries = quotaEntries(request, userId, cost);
  if (
    process.env.NODE_ENV === "development" &&
    process.env.AI_QUOTA_BACKEND !== "database"
  ) {
    const { reserveDevelopmentAI } = await import("./ai-quota-local");
    return reserveDevelopmentAI(entries);
  }
  const { data, error } = await adminClient().rpc("reserve_ai_usage", {
    p_entries: entries,
  });
  if (error || !data || typeof data.allowed !== "boolean")
    throw Error("AI_LIMITER_UNAVAILABLE");
  return data as QuotaResult;
}
