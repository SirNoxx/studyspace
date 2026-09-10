import { z } from "zod";

// A public attribution name, not a login identifier or an authorization claim.
export const usernameSchema = z
  .string()
  .trim()
  .min(2, "Choose a username with at least 2 characters.")
  .max(40, "Keep your username to 40 characters or fewer.")
  .refine(
    (name) => !/[\u0000-\u001f\u007f]/.test(name),
    "Use a username without control characters.",
  );

export function publicNameFromMetadata(
  metadata: Record<string, unknown> | undefined,
) {
  for (const value of [metadata?.username, metadata?.display_name]) {
    const parsed = usernameSchema.safeParse(value);
    if (parsed.success) return parsed.data;
  }
  return "Researcher";
}
