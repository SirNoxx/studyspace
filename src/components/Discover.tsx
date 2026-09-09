"use client";
import { useEffect, useState } from "react";
import { Globe, Search, ArrowRight, BookOpen } from "lucide-react";
import { categories, publicationCounts } from "@/lib/enhancements";
import type { Snapshot } from "@/lib/model";
export default function Discover() {
  const [query, setQuery] = useState(""),
    [items, setItems] = useState<Snapshot[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [category, setCategory] = useState("all"),
    [sort, setSort] = useState("newest");
  useEffect(() => {
    const abort = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      fetch(
        "/api/publications?q=" +
          encodeURIComponent(query) +
          "&category=" +
          encodeURIComponent(category) +
          "&sort=" +
          sort,
        {
          signal: abort.signal,
        },
      )
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
  }, [query, category, sort]);
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
        <div className="discover-controls">
          <a className="primary" href="/w/discover">
            Publish a collection or folder
          </a>
          <select
            aria-label="Browse research category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="all">All categories</option>
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <select
            aria-label="Discover order"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="newest">Newest research</option>
            <option value="popular">Popular · study copies</option>
          </select>
        </div>
        <p className="muted">
          Popularity counts currently saved independent study copies. Only
          explicitly published material appears here.
        </p>
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
                {p.category ?? "General research"} · {p.popularity ?? 0} study
                copies · {publicationCounts(p).sources} sources
              </p>
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
