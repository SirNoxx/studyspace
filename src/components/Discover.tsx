"use client";
import { useEffect, useState } from "react";
import { Globe, Search, ArrowRight, BookOpen } from "lucide-react";
import type { Snapshot } from "@/lib/model";
export default function Discover() {
  const [query, setQuery] = useState(""),
    [items, setItems] = useState<Snapshot[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    const abort = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      fetch("/api/publications?q=" + encodeURIComponent(query), {
        signal: abort.signal,
      })
        .then(async (r) => {
          const d = await r.json();
          if (!r.ok) throw new Error(d.error);
          setItems(d.publications);
          setError("");
        })
        .catch((e) => {
          if (e.name !== "AbortError") setError(e.message);
        })
        .finally(() => setLoading(false));
    }, 200);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [query]);
  return (
    <div className="public-shell">
      <header className="public-header">
        <a className="brand" href="/">
          studyspace<span className="brand-dot">.</span>
        </a>
        <nav>
          <a href="/auth">Sign in</a>
          <a href="/demo">Try the workspace</a>
        </nav>
      </header>
      <main className="workspace-view discover-view">
        <span className="eyebrow">
          <Globe size={14} /> PUBLIC RESEARCH
        </span>
        <h1>Discover a different perspective.</h1>
        <p className="view-description">
          Follow the ideas, definitions, and evidence someone chose to share.
        </p>
        <div className="large-search">
          <Search size={20} />
          <input
            aria-label="Search public research"
            placeholder="A topic, a question, an author…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {loading && <p role="status">Finding published research…</p>}
        {error && <p role="alert">{error}</p>}
        <div className="discover-grid">
          {items.map((p) => (
            <article className="publication-card" key={p.id}>
              <span className="eyebrow">VERSION {p.version}</span>
              <h2>
                <a href={"/p/" + p.publicationId}>{p.title}</a>
              </h2>
              <p>{p.description}</p>
              <p className="muted">
                {p.author} · {p.notes.length} notes
              </p>
              <a className="text-button" href={"/p/" + p.publicationId}>
                Read the research <ArrowRight size={15} />
              </a>
            </article>
          ))}
        </div>
        {!loading && !items.length && (
          <div className="empty-state">
            <BookOpen size={30} />
            <h2>No published research found.</h2>
            <p>
              Try another topic, or publish selected notes from your workspace.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
