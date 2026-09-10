"use client";
import { useState } from "react";
import {
  socialCategories,
  socialCursor,
  socialQuery,
  type SocialRow,
} from "@/lib/social";
import { Modal } from "../ui";
import {
  Avatar,
  DateLabel,
  OnlineStatus,
  Report,
  Status,
  useAction,
  useSocial,
} from "./common";

export default function CommunityFeed() {
  const [feed, setFeed] = useState("latest"),
    [search, setSearch] = useState(""),
    [category, setCategory] = useState(""),
    [people, setPeople] = useState(false),
    [compose, setCompose] = useState(false),
    [selected, setSelected] = useState<SocialRow | null>(null),
    [report, setReport] = useState<SocialRow | null>(null),
    [older, setOlder] = useState<SocialRow[]>([]),
    [topic, setTopic] = useState("");
  const q = useSocial(people ? "people" : "feed", null, {
      q: search,
      category,
      feed,
    }),
    a = useAction();
  const items = [...(q.data?.items || []), ...older];
  const reset = () => {
    setOlder([]);
    q.reload();
  };
  return (
    <section className="social-page">
      <OnlineStatus />
      <div className="social-heading">
        <div>
          <span className="eyebrow">LEARN TOGETHER</span>
          <h1>Discover</h1>
          <p>Research, ideas and people who share your curiosity.</p>
        </div>
        <button className="primary" onClick={() => setCompose(true)}>
          Create a post
        </button>
      </div>
      <div className="social-tabs" aria-label="Discovery feeds">
        {["latest", "following", "interests", "saved", "people"].map((tab) => (
          <button
            aria-pressed={tab === "people" ? people : !people && feed === tab}
            key={tab}
            onClick={() => {
              setPeople(tab === "people");
              if (tab !== "people") setFeed(tab);
              setOlder([]);
            }}
          >
            {tab}
          </button>
        ))}
      </div>
      <div className="social-row">
        <input
          aria-label="Search community"
          placeholder={
            people
              ? "Find people by username or interest"
              : "Search ideas, materials or topics"
          }
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setOlder([]);
          }}
        />
        {!people && (
          <select
            aria-label="Community category"
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setOlder([]);
            }}
          >
            <option value="">All categories</option>
            {socialCategories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        )}
      </div>
      {feed === "following" && !people && (
        <form
          className="social-row"
          onSubmit={(e) => {
            e.preventDefault();
            void a.run(
              "topic",
              { topic: topic.trim().toLowerCase(), enabled: true },
              () => {
                setTopic("");
                reset();
              },
            );
          }}
        >
          <input
            aria-label="Topic to follow"
            placeholder="Follow a topic, e.g. biology"
            maxLength={60}
            required
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
          />
          <button disabled={a.busy}>Follow topic</button>
          {q.data?.topics?.map((t: string) => (
            <button
              type="button"
              key={t}
              disabled={a.busy}
              onClick={() =>
                a.run("topic", { topic: t, enabled: false }, reset)
              }
            >
              #{t} ×
            </button>
          ))}
        </form>
      )}
      <Status loading={q.loading} error={q.error || a.error} retry={reset} />
      {!q.loading && !items.length && (
        <p>No results yet. Try another topic or share your first idea.</p>
      )}
      <div className="social-grid">
        {items.map((p) =>
          people ? (
            <a className="social-card" key={p.id} href={"/author/" + p.id}>
              <Avatar profile={p} />
              <h2>@{p.username}</h2>
              <p>{p.interests.join(" · ")}</p>
            </a>
          ) : (
            <article className="social-card" key={p.id}>
              <a className="social-row" href={"/author/" + p.owner_id}>
                <Avatar profile={p} />@{p.username}
              </a>
              <small>
                {p.kind.replace("-", " ")} · {p.category} ·{" "}
                <DateLabel value={p.created_at} />
              </small>
              <h2>{p.title}</h2>
              <p className="social-body">{p.body}</p>
              <div className="social-row">
                {p.tags.map((t: string) => (
                  <button
                    key={t}
                    onClick={() => {
                      setSearch(t);
                      setOlder([]);
                    }}
                  >
                    #{t}
                  </button>
                ))}
              </div>
              {p.publication_id && (
                <a href={"/p/" + p.publication_id}>Open published material ↗</a>
              )}
              <div className="social-row">
                <button onClick={() => setSelected(p)}>
                  Comments ({p.comments})
                </button>
                <button
                  disabled={a.busy}
                  onClick={() =>
                    a.run("save", { id: p.id, enabled: !p.saved }, reset)
                  }
                >
                  {p.saved ? "Unsave" : "Save"}
                </button>
                {p.owner_id === q.data?.viewer ? (
                  <>
                    <button
                      onClick={() => setSelected({ ...p, editing: true })}
                    >
                      Edit
                    </button>
                    <button
                      disabled={a.busy}
                      onClick={() => a.run("post-delete", { id: p.id }, reset)}
                    >
                      Delete post
                    </button>
                  </>
                ) : (
                  <button onClick={() => setReport({ id: p.id, kind: "post" })}>
                    Report
                  </button>
                )}
              </div>
            </article>
          ),
        )}
      </div>
      {!people &&
        items.length > 0 &&
        (older.length
          ? older.length % 30 === 0
          : q.data?.items?.length === 30) && (
          <button
            onClick={async () => {
              try {
                const more = await socialQuery("feed", null, {
                  q: search,
                  category,
                  feed,
                  ...socialCursor(items),
                });
                setOlder([...older, ...more.items]);
              } catch (e) {
                a.setError((e as Error).message);
              }
            }}
          >
            Load more posts
          </button>
        )}
      {compose && (
        <PostForm
          onClose={() => setCompose(false)}
          saved={() => {
            setCompose(false);
            reset();
          }}
        />
      )}
      {selected?.editing ? (
        <PostForm
          post={selected}
          onClose={() => setSelected(null)}
          saved={() => {
            setSelected(null);
            reset();
          }}
        />
      ) : (
        selected && (
          <Comments
            post={selected}
            onClose={() => {
              setSelected(null);
              reset();
            }}
          />
        )
      )}
      {report && (
        <Report
          kind={report.kind}
          id={report.id}
          onClose={() => setReport(null)}
        />
      )}
    </section>
  );
}
function PostForm({
  post,
  onClose,
  saved,
}: {
  post?: SocialRow;
  onClose: () => void;
  saved: () => void;
}) {
  const [p, setP] = useState<SocialRow>(
      post || {
        kind: "idea",
        title: "",
        body: "",
        category: "General study",
        tags: [],
        publication_id: "",
      },
    ),
    [tags, setTags] = useState(p.tags.join(", "));
  const me = useSocial("profile"),
    a = useAction();
  const field = (k: string, v: string) => setP({ ...p, [k]: v });
  return (
    <Modal
      title={post ? "Edit post" : "Share with the community"}
      onClose={onClose}
      wide
      description="Only what you enter here and an optional published snapshot will be shared."
    >
      <form
        className="social-form"
        onSubmit={(e) => {
          e.preventDefault();
          void a.run(
            post ? "post-edit" : "post",
            {
              id: post?.id,
              kind: p.kind,
              title: p.title,
              body: p.body,
              category: p.category,
              tags: [
                ...new Set(
                  tags
                    .split(",")
                    .map((t: string) => t.trim().toLowerCase())
                    .filter(Boolean),
                ),
              ],
              publication: p.publication_id || null,
            },
            saved,
          );
        }}
      >
        <Status error={me.error || a.error} />
        {me.data && !me.data.profile?.public && (
          <p className="social-error">
            Create a public profile before posting.{" "}
            <a href="/w/profile">Open profile</a>
          </p>
        )}
        {!post && (
          <div className="social-row">
            <label>
              Post type
              <select
                value={p.kind}
                onChange={(e) => field("kind", e.target.value)}
              >
                {["research", "material", "idea", "study-request"].map((t) => (
                  <option key={t} value={t}>
                    {t.replace("-", " ")}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Category
              <select
                value={p.category}
                onChange={(e) => field("category", e.target.value)}
              >
                {socialCategories.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
          </div>
        )}
        <label>
          Title
          <input
            required
            maxLength={160}
            value={p.title}
            onChange={(e) => field("title", e.target.value)}
          />
        </label>
        <label>
          Your post
          <textarea
            required
            rows={8}
            maxLength={20000}
            value={p.body}
            onChange={(e) => field("body", e.target.value)}
          />
        </label>
        {!post && (
          <>
            <label>
              Topics (comma separated, up to 10)
              <input value={tags} onChange={(e) => setTags(e.target.value)} />
            </label>
            <label>
              Attach published work
              <select
                value={p.publication_id}
                onChange={(e) => field("publication_id", e.target.value)}
              >
                <option value="">No attachment</option>
                {me.data?.publications.map(({ payload: s }: SocialRow) => (
                  <option key={s.publicationId} value={s.publicationId}>
                    {s.title}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        <button
          className="primary"
          disabled={a.busy || !me.data?.profile?.public}
        >
          {post ? "Save changes" : "Publish post"}
        </button>
      </form>
    </Modal>
  );
}
function Comments({ post, onClose }: { post: SocialRow; onClose: () => void }) {
  const q = useSocial("comments", post.id),
    a = useAction();
  const [body, setBody] = useState(""),
    [edit, setEdit] = useState<string | null>(null),
    [older, setOlder] = useState<SocialRow[]>([]),
    [report, setReport] = useState<string | null>(null);
  const items = [...(q.data?.items || []), ...older];
  return (
    <Modal title={post.title} onClose={onClose} wide>
      <div className="social-page">
        <Status error={q.error || a.error} loading={q.loading} />
        {items.map((c) => (
          <article className="social-card" key={c.id}>
            <a href={"/author/" + c.owner_id}>@{c.username}</a>
            <p className="social-body">{c.body}</p>
            <div className="social-row">
              <DateLabel value={c.created_at} />
              {c.owner_id === q.data?.viewer ? (
                <>
                  <button
                    onClick={() => {
                      setEdit(c.id);
                      setBody(c.body);
                    }}
                  >
                    Edit
                  </button>
                  <button
                    disabled={a.busy}
                    onClick={() =>
                      a.run("comment-delete", { id: c.id }, () => {
                        setOlder([]);
                        q.reload();
                      })
                    }
                  >
                    Delete
                  </button>
                </>
              ) : (
                <button onClick={() => setReport(c.id)}>Report</button>
              )}
            </div>
          </article>
        ))}
        {items.length > 0 && items.length % 30 === 0 && (
          <button
            onClick={async () => {
              try {
                const more = await socialQuery(
                  "comments",
                  post.id,
                  socialCursor(items),
                );
                setOlder([...older, ...more.items]);
              } catch (e) {
                a.setError((e as Error).message);
              }
            }}
          >
            Older comments
          </button>
        )}
        <form
          className="social-form"
          onSubmit={(e) => {
            e.preventDefault();
            void a.run(
              edit ? "comment-edit" : "comment",
              { id: edit || post.id, body },
              () => {
                setBody("");
                setEdit(null);
                setOlder([]);
                q.reload();
              },
            );
          }}
        >
          <label>
            {edit ? "Edit comment" : "Join the discussion"}
            <textarea
              required
              maxLength={4000}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </label>
          <button disabled={a.busy}>{edit ? "Save comment" : "Comment"}</button>
          {edit && (
            <button
              type="button"
              onClick={() => {
                setEdit(null);
                setBody("");
              }}
            >
              Cancel edit
            </button>
          )}
        </form>
      </div>
      {report && (
        <Report kind="comment" id={report} onClose={() => setReport(null)} />
      )}
    </Modal>
  );
}
