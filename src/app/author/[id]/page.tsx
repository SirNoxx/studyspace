import { notFound } from "next/navigation";
import { adminClient, configured } from "@/lib/supabase/server";
export const dynamic = "force-dynamic";
export default async function AuthorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!configured()) notFound();
  const { id } = await params;
  const db = adminClient();
  const { data: profile } = await db
    .from("profiles")
    .select("display_name,bio")
    .eq("id", id)
    .single();
  if (!profile) notFound();
  const { data: pubs } = await db
    .from("publications")
    .select("id,current_version")
    .eq("owner_id", id)
    .eq("status", "published")
    .eq("hidden", false);
  const { data: versions } = await db
    .from("publication_versions")
    .select("payload")
    .in(
      "id",
      (pubs ?? []).map((p) => p.current_version),
    );
  return (
    <main className="policies">
      <a className="brand" href="/">
        studyspace.
      </a>
      <h1>{profile.display_name}</h1>
      <p>{profile.bio}</p>
      <h2>Published research</h2>
      {versions?.map(({ payload: p }) => (
        <article key={p.id}>
          <h3>
            <a href={"/p/" + p.publicationId}>{p.title}</a>
          </h3>
          <p>{p.description}</p>
          <small>
            {p.notes.length} notes · version {p.version}
          </small>
        </article>
      ))}
    </main>
  );
}
