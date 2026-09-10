"use client";
import { useState } from "react";
import { LayoutGrid, Plus, Search } from "lucide-react";
import { Modal } from "./ui";
import { moduleTemplates, newModule } from "@/lib/modules";
import { newCodeBlock } from "@/lib/code-blocks";
import { newWhiteboard } from "@/lib/whiteboard";

export function ModulesButton({
  onInsert,
}: {
  onInsert: (text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="modules-button" onClick={() => setOpen(true)}>
        <LayoutGrid size={15} />
        Modules
      </button>
      {open && (
        <ModuleGallery onInsert={onInsert} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
export default function ModuleGallery({
  onInsert,
  onClose,
}: {
  onInsert: (text: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState(""),
    [category, setCategory] = useState("All");
  const templates = [
    ...moduleTemplates,
    {
      id: "whiteboard",
      title: "Whiteboard",
      description: "Draw diagrams and handwritten notes.",
      category: "Visuals",
      preview: "whiteboard",
    },
    {
      id: "code",
      title: "Code block",
      description:
        "Run code in nine languages and formats, with output and previews.",
      category: "Data",
      preview: "code",
    },
  ];
  const filtered = templates.filter(
    (t) =>
      (category === "All" || t.category === category) &&
      (t.title + " " + t.description)
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <Modal
      title="Modules"
      description="Choose a building block for your note. Add it with one click, then edit it in place."
      wide
      onClose={onClose}
    >
      <div className="module-search">
        <Search size={17} />
        <input
          aria-label="Search modules"
          placeholder="Find a module…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="module-categories" aria-label="Module categories">
        {["All", "Writing", "Planning", "Data", "Visuals"].map((c) => (
          <button
            key={c}
            aria-pressed={category === c}
            onClick={() => setCategory(c)}
          >
            {c}
          </button>
        ))}
      </div>
      <div className="module-gallery">
        {filtered.map((t) => (
          <button
            key={t.id}
            className="module-card"
            aria-label={"Add " + t.title}
            onClick={() => {
              onInsert(
                t.id === "code"
                  ? newCodeBlock()
                  : t.id === "whiteboard"
                    ? newWhiteboard()
                    : newModule(t.id as (typeof moduleTemplates)[number]["id"]),
              );
              onClose();
            }}
          >
            <div
              aria-hidden="true"
              className={"module-preview preview-" + t.preview}
            >
              {t.preview === "whiteboard" ? (
                <svg
                  viewBox="0 0 150 65"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="15" y="5" width="115" height="50" rx="5" />
                  <path d="M35 44C20 15 65 20 49 37S91 40 77 19M87 43L103 23M105 20L111 25M49 60H98" />
                </svg>
              ) : t.preview === "venn" ? (
                <>
                  <i />
                  <i />
                </>
              ) : t.preview === "code" ? (
                <code>{"const idea = learn();\nconsole.log(idea);"}</code>
              ) : (
                Array.from(
                  { length: t.preview === "calendar" ? 21 : 6 },
                  (_, i) => <i key={i} />,
                )
              )}
            </div>
            <strong>
              {t.title}
              <Plus size={16} />
            </strong>
            <span>{t.description}</span>
          </button>
        ))}
      </div>
      {!filtered.length && <p>No modules match your search.</p>}
    </Modal>
  );
}
