"use client";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Search,
} from "lucide-react";
import {
  collectionIconNames,
  collectionIconName,
  collectionIconLabel,
} from "@/lib/collection-icons";
import { SymbolIcon } from "./ui";
const pageSize = 48;
export default function CollectionIconPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState(""),
    [page, setPage] = useState(0);
  const id = useId(),
    search = useRef<HTMLInputElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    grid = useRef<HTMLDivElement>(null);
  const selected = collectionIconName(value) ?? "book-open";
  const results = useMemo(() => {
    const words = query
      .toLowerCase()
      .trim()
      .split(/[\s-]+/)
      .filter(Boolean);
    return collectionIconNames.filter((name) =>
      words.every((word) => name.includes(word)),
    );
  }, [query]);
  const pages = Math.max(1, Math.ceil(results.length / pageSize));
  useEffect(() => {
    if (open) search.current?.focus();
  }, [open]);
  useEffect(() => {
    grid.current?.scrollTo({ top: 0 });
  }, [page, query]);
  return (
    <div className="collection-icon-field">
      <span className="collection-field-label" id={id + "-label"}>
        Icon
      </span>
      <button
        ref={trigger}
        type="button"
        className="collection-icon-trigger"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        <SymbolIcon name={value} size={22} />
        <span>
          {collectionIconLabel(selected)}
          <small>
            Browse {collectionIconNames.length.toLocaleString("en-US")} icons
          </small>
        </span>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {open && (
        <section
          id={id}
          className="collection-icon-browser"
          aria-labelledby={id + "-label"}
        >
          <label className="collection-icon-search">
            <Search size={16} />
            <input
              ref={search}
              aria-label="Search collection icons"
              placeholder="Search icons: book, atom, code…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(0);
              }}
            />
          </label>
          <p className="collection-icon-count" role="status">
            {results.length.toLocaleString("en-US")} icons
            {query.trim() ? " found" : " available"} · Lucide
          </p>
          <div
            ref={grid}
            className="collection-icon-grid"
            role="group"
            aria-label="Collection icons"
          >
            {results
              .slice(page * pageSize, (page + 1) * pageSize)
              .map((name) => (
                <button
                  type="button"
                  key={name}
                  title={collectionIconLabel(name)}
                  aria-label={"Choose icon " + collectionIconLabel(name)}
                  aria-pressed={selected === name}
                  onClick={() => {
                    onChange("lucide:" + name);
                    setOpen(false);
                    trigger.current?.focus();
                  }}
                >
                  <SymbolIcon name={"lucide:" + name} size={22} />
                  <span>{collectionIconLabel(name)}</span>
                </button>
              ))}
          </div>
          {!results.length && (
            <p className="collection-icon-empty">
              No icons match “{query}”. Try another name.
            </p>
          )}
          <div className="collection-icon-pagination">
            <button
              type="button"
              aria-label="Previous icon page"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft size={16} />
            </button>
            <span>
              Page {page + 1} of {pages}
            </span>
            <button
              type="button"
              aria-label="Next icon page"
              disabled={page >= pages - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
