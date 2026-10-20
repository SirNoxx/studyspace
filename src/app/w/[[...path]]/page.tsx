import { redirect } from "next/navigation";
import { configured, sessionClient } from "@/lib/supabase/server";
import DeviceWorkspace from "@/components/DeviceWorkspace";
export const dynamic = "force-dynamic";
export default async function WorkspacePage() {
  if (!configured()) redirect("/demo");
  const client = await sessionClient();
  const { data } = await client.auth.getUser();
  if (!data.user) redirect("/auth");
  return <DeviceWorkspace />;
}
