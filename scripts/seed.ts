import { createClient } from "@supabase/supabase-js";
import { sampleWorkspace } from "../src/lib/demo";
const owner = process.env.SEED_OWNER_ID,
  url = process.env.NEXT_PUBLIC_SUPABASE_URL,
  key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!owner || !url || !key || process.env.SEED_CONFIRM_PROJECT !== url)
  throw new Error(
    "Set SEED_OWNER_ID to your test account and SEED_CONFIRM_PROJECT to the exact Supabase URL. Only an empty workspace can be seeded.",
  );
const db = createClient(url, key, { auth: { persistSession: false } }),
  { data, error } = await db.rpc("read_workspace", { p_owner: owner });
if (error) throw error;
if (data?.notes?.length)
  throw new Error("Seed refused: this account already contains notes.");
const state = sampleWorkspace();
if (data?.containers?.find((c: any) => c.system === "general")) {
  const old = state.containers.find((c) => c.system === "general")!.id,
    target = data.containers.find((c: any) => c.system === "general").id;
  state.containers.find((c) => c.id === old)!.id = target;
  for (const n of state.notes)
    if (n.containerId === old) n.containerId = target;
}
const result = await db.rpc("commit_workspace", {
  p_owner: owner,
  p_expected: data?.revision ?? 0,
  p_state: state,
});
if (result.error) throw result.error;
console.log(
  "Editable TEST/sample workspace seeded. No publication or AI request was made.",
);
