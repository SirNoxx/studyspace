"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  GraduationCap,
  Shuffle,
  Folder,
  FileText,
  Plus,
  ArrowLeft,
  Check,
  Search,
  ExternalLink,
  RotateCcw,
} from "lucide-react";
import { type AppContext } from "./WorkspaceApp";
import { type EditorHandle } from "./Editor";
import { ModulesButton } from "./ModuleGallery";
import { Modal } from "./ui";
import DocumentExport from "./DocumentExport";
import { learningTopicSchema } from "@/lib/learning-schema";
import {
  createContainer,
  createNote,
  saveNote,
  trashItems,
} from "@/lib/domain";
import { now, uid, inContainer, contextDefinitions } from "@/lib/model";
import {
  eligibleTopics,
  startLearningPath,
  learnedVault,
  setPathLearned,
} from "@/lib/learning";
import {
  learningCatalog,
  topicCategories,
  randomIndex,
  topicKey,
  type LearningTopic,
  type TopicCategory,
} from "@/lib/learning-catalog";
const NoteEditor = dynamic(() => import("./Editor"), { ssr: false });
export default function Learning({ ctx }: { ctx: AppContext }) {
  const { w, mutate } = ctx;
  const [tab, setTab] = useState<"explore" | "paths" | "vault">(
      w.settings.activeLearningPath ? "paths" : "explore",
    ),
    [category, setCategory] = useState("All"),
    [query, setQuery] = useState(""),
    [spin, setSpin] = useState(false),
    [angle, setAngle] = useState(0),
    [error, setError] = useState("");
  const [wiki, setWiki] = useState<LearningTopic[]>([]),
    [fetching, setFetching] = useState(false),
    [topicName, setTopicName] = useState(""),
    [newCategory, setNewCategory] = useState<TopicCategory>("Computer science");
  const [file, setFile] = useState<string | null>(null),
    [parent, setParent] = useState<string | null>(null),
    [create, setCreate] = useState<"note" | "folder" | null>(null),
    [name, setName] = useState(""),
    [concept, setConcept] = useState(""),
    [exporting, setExporting] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    busy = useRef(false),
    searchAbort = useRef<AbortController | null>(null),
    editor = useRef<EditorHandle | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      searchAbort.current?.abort();
    },
    [],
  );
  const paths = (w.settings.learningPaths ?? []).filter((p) =>
      w.containers.some((c) => c.id === p.rootId && !c.trashed),
    ),
    path = paths.find((p) => p.id === w.settings.activeLearningPath),
    activePaths = paths.filter((p) => !p.learnedAt);
  const allTopics = useMemo(() => {
    const seen = new Set<string>();
    return [...learningCatalog, ...(w.settings.learningTopics ?? [])].filter(
      (t) => {
        const key = topicKey(t.title);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      },
    );
  }, [w.settings.learningTopics]);
  const eligible = eligibleTopics(
    allTopics,
    w.settings.learningPaths ?? [],
  ).filter(
    (t) =>
      (category === "All" || t.category === category) &&
      t.title.toLowerCase().includes(query.toLowerCase()),
  );
  const candidateKey = eligible.map((t) => t.id).join("|");
  const candidates = useMemo(() => {
    const pool = [...eligible],
      result: LearningTopic[] = [];
    while (pool.length && result.length < 8)
      result.push(pool.splice(randomIndex(pool.length), 1)[0]);
    return result;
  }, [candidateKey]);
  const vault = useMemo(() => learnedVault(w), [w]);
  const note = w.notes.find((n) => n.id === file && !n.trashed);
  const openPath = (id: string, noteId?: string) => {
    mutate((s) => {
      s.settings.activeLearningPath = id;
    });
    setFile(noteId ?? null);
    setParent(null);
    setTab("paths");
    setError("");
  };
  const begin = (topic: LearningTopic) => {
    let id = "";
    mutate((s) => {
      id = startLearningPath(s, topic).id;
    });
    if (id) openPath(id);
  };
  const changeTab = (value: typeof tab) => {
    if (busy.current) return;
    setTab(value);
    setQuery("");
    setCategory("All");
  };
  const doSpin = () => {
    if (busy.current || !candidates.length) return;
    busy.current = true;
    setSpin(true);
    setError("");
    const index = randomIndex(candidates.length),
      chosen = candidates[index],
      target = 360 - ((index + 0.5) * 360) / candidates.length;
    setAngle((current) => Math.ceil(current / 360) * 360 + 1440 + target);
    timer.current = setTimeout(
      () => {
        busy.current = false;
        setSpin(false);
        try {
          begin(chosen);
        } catch (e) {
          setError((e as Error).message);
        }
      },
      matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 1900,
    );
  };
  const lookup = async () => {
    searchAbort.current?.abort();
    const abort = new AbortController();
    searchAbort.current = abort;
    setFetching(true);
    setError("");
    try {
      const r = await fetch(
        "/api/learning-topics?" +
          new URLSearchParams({
            q: query,
            category: category === "All" ? newCategory : category,
          }),
        { signal: abort.signal },
      );
      const data = await r.json();
      if (!r.ok) throw Error(data.error);
      if (!abort.signal.aborted) {
        const topics = learningTopicSchema.array().max(20).parse(data.topics);
        setWiki(topics);
        if (!topics.length)
          setError(
            "No reference topics found. Try another search or add your own topic.",
          );
      }
    } catch (e) {
      if (!abort.signal.aborted) setError((e as Error).message);
    } finally {
      if (!abort.signal.aborted) setFetching(false);
    }
  };
  const tree = (folder: string, depth = 0): React.ReactNode => (
    <div
      className="learning-file-level"
      style={{ paddingLeft: depth ? 14 : 0 }}
    >
      {w.containers
        .filter((c) => c.parentId === folder && !c.trashed)
        .map((c) => (
          <details key={c.id} open>
            <summary>
              <button
                aria-pressed={parent === c.id}
                onClick={() => setParent(c.id)}
              >
                <Folder size={15} />
                {c.title}
              </button>
            </summary>
            {tree(c.id, depth + 1)}
          </details>
        ))}
      {w.notes
        .filter((n) => n.containerId === folder && !n.trashed)
        .map((n) => (
          <button
            key={n.id}
            aria-pressed={file === n.id}
            onClick={() => {
              setFile(n.id);
              setParent(n.containerId);
            }}
          >
            <FileText size={15} />
            {n.title}
          </button>
        ))}
    </div>
  );
  return (
    <section className="view-scroll">
      <div className="learning-page">
        <header className="learning-heading">
          <div>
            <span className="eyebrow">FOLLOW YOUR CURIOSITY</span>
            <h1>
              <GraduationCap /> Learning
            </h1>
            <p>A new idea today. A growing vault of understanding tomorrow.</p>
          </div>
          <span className="social-tag">Private learning space</span>
        </header>
        <nav className="learning-tabs" aria-label="Learning areas">
          {(
            [
              ["explore", "Topic wheel"],
              ["paths", `In progress (${activePaths.length})`],
              ["vault", `Learned Vault (${vault.length})`],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              disabled={spin}
              aria-current={tab === id ? "page" : undefined}
              onClick={() => changeTab(id)}
            >
              {label}
            </button>
          ))}
        </nav>
        {error && <p role="alert">{error}</p>}
        {tab === "explore" && (
          <>
            <div className="learning-filters">
              <label>
                Category
                <select
                  disabled={spin}
                  value={category}
                  onChange={(e) => {
                    setCategory(e.target.value);
                    searchAbort.current?.abort();
                    setFetching(false);
                    setWiki([]);
                  }}
                >
                  <option>All</option>
                  {topicCategories.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label>
                Find a topic
                <input
                  disabled={spin}
                  placeholder="GitHub, stars, ancient history…"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    searchAbort.current?.abort();
                    setFetching(false);
                    setWiki([]);
                  }}
                />
              </label>
            </div>
            <div className="learning-discovery">
              <div className="topic-wheel-wrap">
                <span className="topic-wheel-pointer" aria-hidden="true">
                  ▼
                </span>
                <div
                  className="topic-wheel"
                  aria-hidden="true"
                  style={{
                    transform: `rotate(${angle}deg)`,
                    background: candidates.length
                      ? `conic-gradient(${candidates.map((_, i) => `${["#426c60", "#536780", "#806c92", "#886d4c"][i % 4]} ${(i * 360) / candidates.length}deg ${((i + 1) * 360) / candidates.length}deg`).join(",")})`
                      : "var(--panel)",
                  }}
                >
                  {candidates.map((t, i) => (
                    <span
                      key={t.id}
                      style={{
                        transform: `translate(-50%, -50%) rotate(${((i + 0.5) * 360) / candidates.length}deg) translateY(-105px) rotate(90deg)`,
                      }}
                    >
                      {i + 1}
                    </span>
                  ))}
                </div>
                <button
                  className="primary topic-spin"
                  disabled={spin || !candidates.length}
                  onClick={doSpin}
                >
                  <Shuffle size={18} />
                  {spin ? "Finding your next topic…" : "Spin & start learning"}
                </button>
                <p role="status">
                  {eligible.length} unstarted topics · {allTopics.length} in
                  your catalog
                </p>
              </div>
              <div className="topic-candidates">
                <h2>This spin’s possibilities</h2>
                <p>
                  Eight topics sampled from your filters. Spin, or choose one
                  directly.
                </p>
                {candidates.map((t, i) => (
                  <button key={t.id} disabled={spin} onClick={() => begin(t)}>
                    <span>{i + 1}</span>
                    <strong>{t.title}</strong>
                    <small>{t.category}</small>
                  </button>
                ))}
                {!candidates.length && (
                  <p>
                    No unstarted topics match. Change your filters or add a
                    topic below.
                  </p>
                )}
              </div>
            </div>
            <details className="learning-custom">
              <summary>Add your own topic or explore Wikipedia</summary>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const title = topicName.trim();
                  if (title)
                    begin({
                      id: "custom:" + topicKey(title),
                      title,
                      category: newCategory,
                    });
                }}
              >
                <label>
                  Topic title
                  <input
                    required
                    maxLength={240}
                    value={topicName}
                    onChange={(e) => setTopicName(e.target.value)}
                    placeholder="GitHub commands"
                  />
                </label>
                <label>
                  Topic category
                  <select
                    value={newCategory}
                    onChange={(e) =>
                      setNewCategory(e.target.value as TopicCategory)
                    }
                  >
                    {topicCategories.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </label>
                <button className="primary" disabled={spin}>
                  Start this learning path
                </button>
              </form>
              <p>
                Search Wikipedia for more ideas. Results are reference pages,
                not reviewed lessons.
              </p>
              <button
                disabled={fetching || query.trim().length < 2 || spin}
                onClick={() => void lookup()}
              >
                <Search size={15} />
                {fetching
                  ? "Searching…"
                  : "Search Wikipedia using the topic filter"}
              </button>
              {wiki.map((t) => (
                <div className="learning-wiki-result" key={t.id}>
                  <a
                    href={t.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {t.title} <ExternalLink size={12} />
                  </a>
                  <button
                    onClick={() => {
                      mutate((s) => {
                        const topics = (s.settings.learningTopics ??= []);
                        if (
                          !topics.some(
                            (x) =>
                              x.id === t.id ||
                              topicKey(x.title) === topicKey(t.title),
                          )
                        )
                          topics.push(t);
                      });
                      setWiki((items) => items.filter((x) => x.id !== t.id));
                    }}
                  >
                    Add to wheel
                  </button>
                  <button onClick={() => begin(t)}>Start path</button>
                </div>
              ))}
            </details>
          </>
        )}
        {tab === "paths" && (
          <>
            {path ? (
              <>
                <button
                  className="text-button"
                  onClick={() => {
                    mutate((s) => {
                      s.settings.activeLearningPath = undefined;
                    });
                    setFile(null);
                  }}
                >
                  <ArrowLeft size={16} /> All learning paths
                </button>
                <header className="learning-path-heading">
                  <div>
                    <span className="eyebrow">
                      {path.topic.category} · LEARNING PATH
                    </span>
                    <h2>{path.topic.title}</h2>
                    <p>
                      {path.learnedAt
                        ? `Learned ${new Date(path.learnedAt).toLocaleDateString()}`
                        : "Build understanding at your own pace."}
                    </p>
                  </div>
                  <button
                    className="primary"
                    onClick={() =>
                      mutate((s) => {
                        const p = s.settings.learningPaths!.find(
                          (p) => p.id === path.id,
                        )!;
                        setPathLearned(p, !p.learnedAt);
                      })
                    }
                  >
                    {path.learnedAt ? (
                      <>
                        <RotateCcw size={16} /> Review again
                      </>
                    ) : (
                      <>
                        <Check size={16} /> Mark path as learned
                      </>
                    )}
                  </button>
                </header>
                <section className="learning-concepts">
                  <h3>Concepts to understand</h3>
                  <p>
                    Check off what you can explain or apply. Learned concepts
                    appear in your vault immediately.
                  </p>
                  {path.concepts.map((c) => (
                    <label key={c.id}>
                      <input
                        type="checkbox"
                        checked={c.learned}
                        onChange={(e) =>
                          mutate((s) => {
                            const p = s.settings.learningPaths!.find(
                                (p) => p.id === path.id,
                              )!,
                              item = p.concepts.find((x) => x.id === c.id)!;
                            item.learned = e.target.checked;
                            item.learnedAt = item.learned ? now() : undefined;
                            if (!item.learned) p.learnedAt = undefined;
                          })
                        }
                      />
                      {c.title}
                    </label>
                  ))}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const title = concept.trim();
                      if (title)
                        mutate((s) => {
                          const p = s.settings.learningPaths!.find(
                            (p) => p.id === path.id,
                          )!;
                          if (
                            !p.concepts.some(
                              (c) => topicKey(c.title) === topicKey(title),
                            )
                          ) {
                            p.concepts.push({
                              id: uid(),
                              title,
                              learned: false,
                            });
                            p.learnedAt = undefined;
                          }
                        });
                      setConcept("");
                    }}
                  >
                    <input
                      aria-label="New concept"
                      placeholder="e.g. Resolve a merge conflict"
                      maxLength={240}
                      value={concept}
                      onChange={(e) => setConcept(e.target.value)}
                    />
                    <button>
                      <Plus size={15} /> Add concept
                    </button>
                  </form>
                </section>
                <div className="learning-workspace">
                  <nav aria-label="Learning path files">
                    <button
                      className="learning-root"
                      onClick={() => setParent(path.rootId)}
                      aria-pressed={!parent || parent === path.rootId}
                    >
                      <GraduationCap size={16} /> Path files
                    </button>
                    <small>
                      Adding to:{" "}
                      {
                        w.containers.find(
                          (c) => c.id === (parent ?? path.rootId),
                        )?.title
                      }
                    </small>
                    <div className="social-row">
                      <button
                        onClick={() => {
                          setName("");
                          setCreate("folder");
                        }}
                      >
                        <Folder size={14} /> New folder
                      </button>
                      <button
                        onClick={() => {
                          setName("");
                          setCreate("note");
                        }}
                      >
                        <Plus size={14} /> New file
                      </button>
                    </div>
                    {tree(path.rootId)}
                  </nav>
                  <div className="learning-writing">
                    {note && inContainer(w, note.containerId, path.rootId) ? (
                      <>
                        <input
                          className="learning-note-title"
                          aria-label="Learning note title"
                          maxLength={240}
                          value={note.title}
                          onChange={(e) =>
                            mutate((s) => {
                              const n = s.notes.find((x) => x.id === note.id)!;
                              n.title = e.target.value;
                              n.updatedAt = now();
                            })
                          }
                        />
                        <div className="social-row">
                          <ModulesButton
                            onInsert={(text) => editor.current?.insert(text)}
                          />
                          <button onClick={() => setExporting(true)}>
                            Print & export
                          </button>
                          <button
                            onClick={() => {
                              ctx.openNote(note.id);
                            }}
                          >
                            Open in full editor
                          </button>
                          <button
                            onClick={() => {
                              mutate((s) => trashItems(s, [note.id]));
                              setFile(null);
                            }}
                          >
                            Move file to Trash
                          </button>
                        </div>
                        <NoteEditor
                          id={note.id}
                          body={note.body}
                          mode="live"
                          handle={editor}
                          onChange={(body) =>
                            mutate((s) =>
                              saveNote(
                                s,
                                note.id,
                                s.notes.find((n) => n.id === note.id)!.revision,
                                { body },
                              ),
                            )
                          }
                          onSelection={ctx.setSelection}
                          definitions={contextDefinitions(w, note.containerId)}
                          onDefinition={(id) =>
                            ctx.setDialog({ type: "definition", id })
                          }
                          notes={w.notes}
                          attachments={w.attachments}
                          demo={ctx.demo}
                          onAttach={(files, placement) => void ctx.attach(files, note.id, placement)}
                          onChat={(text) => ctx.openChat(text, note.id)}
                          onBlockAction={(action, block) =>
                            ctx.blockAction?.(action, block, note.id)
                          }
                        />
                      </>
                    ) : (
                      <div className="learning-empty">
                        <FileText size={30} />
                        <h3>Your space to figure it out</h3>
                        <p>
                          Open the learning journal, or create a file in a
                          folder.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <>
                <h2>Your learning paths</h2>
                <p>
                  Active paths and completed paths keep their original files.
                </p>
                <div className="learning-path-grid">
                  {paths
                    .filter((p) =>
                      w.containers.some((c) => c.id === p.rootId && !c.trashed),
                    )
                    .map((p) => (
                      <button
                        key={p.id}
                        className="social-card"
                        onClick={() => openPath(p.id)}
                      >
                        <span className="eyebrow">{p.topic.category}</span>
                        <h3>{p.topic.title}</h3>
                        <p>
                          {p.learnedAt
                            ? "Learned · Open to review"
                            : `${p.concepts.filter((c) => c.learned).length}/${p.concepts.length} concepts learned`}
                        </p>
                      </button>
                    ))}
                </div>
                {!paths.length && (
                  <button
                    className="primary"
                    onClick={() => changeTab("explore")}
                  >
                    Find my first topic
                  </button>
                )}
              </>
            )}
          </>
        )}
        {tab === "vault" && (
          <>
            <h2>Learned Vault</h2>
            <p>
              Your personal learning history. Revisit a skill with its original
              notes, or open a concept where you defined it.
            </p>
            <div className="learning-filters">
              <label>
                Vault category
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  <option>All</option>
                  {[...topicCategories, "From my notes"].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label>
                Search learned skills
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Find something you learned…"
                />
              </label>
            </div>
            {[...topicCategories, "From my notes"]
              .filter((c) => category === "All" || category === c)
              .map((c) => {
                const items = vault.filter(
                  (e) =>
                    e.category === c &&
                    (e.title + " " + (e.description ?? ""))
                      .toLowerCase()
                      .includes(query.toLowerCase()),
                );
                return items.length ? (
                  <section className="vault-category" key={c}>
                    <h3>{c}</h3>
                    <div className="learning-path-grid">
                      {items.map((e) => (
                        <article className="social-card" key={e.id}>
                          <small>
                            {e.kind} ·{" "}
                            {new Date(e.learnedAt).toLocaleDateString()}
                          </small>
                          <h4>{e.title}</h4>
                          {e.description && (
                            <p>{e.description.slice(0, 180)}</p>
                          )}
                          <button
                            onClick={() =>
                              e.pathId
                                ? openPath(e.pathId, e.noteId)
                                : e.noteId && ctx.openNote(e.noteId)
                            }
                          >
                            Revisit {e.kind.toLowerCase()}
                          </button>
                        </article>
                      ))}
                    </div>
                  </section>
                ) : null;
              })}
            {!vault.some(
              (e) =>
                (category === "All" || e.category === category) &&
                (e.title + " " + (e.description ?? ""))
                  .toLowerCase()
                  .includes(query.toLowerCase()),
            ) && (
              <div className="learning-empty">
                <GraduationCap size={32} />
                <h3>
                  {vault.length
                    ? "No matching learned concepts"
                    : "Your understanding will grow here"}
                </h3>
                <p>
                  Mark a path or concept as learned. Definition modules you mark
                  learned also appear here.
                </p>
              </div>
            )}
          </>
        )}
        {create && path && (
          <Modal
            title={
              create === "folder" ? "New learning folder" : "New learning file"
            }
            onClose={() => setCreate(null)}
          >
            <form
              className="social-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (!name.trim()) return;
                mutate((s) => {
                  if (create === "folder") {
                    const c = createContainer(s, {
                      title: name,
                      kind: "folder",
                      parentId: parent ?? path.rootId,
                    });
                    setParent(c.id);
                  } else {
                    const n = createNote(s, parent ?? path.rootId, {
                      title: name,
                    });
                    setFile(n.id);
                  }
                });
                setCreate(null);
              }}
            >
              <label>
                Name
                <input
                  autoFocus
                  required
                  maxLength={240}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <button className="primary">Create {create}</button>
            </form>
          </Modal>
        )}
        {exporting && note && (
          <DocumentExport
            note={note}
            demo={ctx.demo}
            onClose={() => setExporting(false)}
          />
        )}
      </div>
    </section>
  );
}
