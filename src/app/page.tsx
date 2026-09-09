import { redirect } from "next/navigation";
import { configured, sessionClient } from "@/lib/supabase/server";
export default async function Home() {
  if (!configured()) redirect("/demo");
  const client = await sessionClient();
  const { data } = await client.auth.getUser();
  redirect(data.user ? "/w" : "/auth");
}
