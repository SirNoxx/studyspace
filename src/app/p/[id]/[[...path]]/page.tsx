import { notFound } from "next/navigation";
import { configured, sessionClient } from "@/lib/supabase/server";
import { publicSnapshot } from "@/lib/server/publications";
import PublicReader from "@/components/PublicReader";
export const dynamic = "force-dynamic";
export default async function PublicationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; path?: string[] }>;
  searchParams: Promise<{ version?: string }>;
}) {
  if (!configured()) notFound();
  const { id, path } = await params;
  const { version } = await searchParams;
  const result = await publicSnapshot(id, version);
  if (!result) notFound();
  const client = await sessionClient();
  const { data } = await client.auth.getUser();
  return (
    <PublicReader
      snapshot={result.snapshot}
      authorId={result.ownerId}
      signedIn={!!data.user}
      initialNote={path?.[0]}
    />
  );
}
