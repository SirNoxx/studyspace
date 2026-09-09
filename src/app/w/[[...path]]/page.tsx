import { redirect } from "next/navigation";
import { configured, sessionClient } from "@/lib/supabase/server";
import WorkspaceApp from "@/components/WorkspaceApp";
export const dynamic = "force-dynamic";
export default async function WorkspacePage() {
  if (!configured()) redirect("/demo");
  const client = await sessionClient();
  const { data } = await client.auth.getUser();
  if (!data.user) redirect("/auth");
  return <WorkspaceApp account={data.user.id} />;
}
