export type SocialRow = Record<string, any>;
export class SocialError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}
export async function socialQuery(
  kind: string,
  id?: string | null,
  filter: Record<string, string> = {},
  signal?: AbortSignal,
): Promise<SocialRow> {
  const query = new URLSearchParams({ kind, ...filter });
  if (id) query.set("id", id);
  const response = await fetch("/api/social?" + query, {
    signal,
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok)
    throw new SocialError(data.error, response.status, data.code);
  return data;
}
export async function socialCommand(
  action: string,
  data: SocialRow,
  requestId = crypto.randomUUID(),
): Promise<SocialRow> {
  const response = await fetch("/api/social", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, data, requestId }),
  });
  const value = await response.json();
  if (!response.ok)
    throw new SocialError(value.error, response.status, value.code);
  return value;
}
export function socialCursor(items: SocialRow[]): Record<string, string> {
  const last = items.at(-1);
  return last ? { before: last.created_at, beforeId: last.id } : {};
}
export const socialCategories = [
  "Computer science",
  "Mathematics",
  "Natural sciences",
  "Medicine & health",
  "Humanities",
  "Languages",
  "Business",
  "Arts & design",
  "General study",
];
