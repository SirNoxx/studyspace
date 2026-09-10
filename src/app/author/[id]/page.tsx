import Profile from "@/components/social/Profile";
export const dynamic = "force-dynamic";
export default async function AuthorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <main className="social-public">
      <header className="public-header">
        <a className="brand" href="/">
          studyspace.
        </a>
        <nav>
          <a href="/discover">Discover</a>
          <a href="/w/profile">My profile</a>
          <a href="/w/messages">Messages</a>
        </nav>
      </header>
      <Profile id={id} />
    </main>
  );
}
