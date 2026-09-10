"use client";
import { useState } from "react";
import { socialCategories, type SocialRow } from "@/lib/social";
import { Modal } from "../ui";
import {
  Avatar,
  OnlineStatus,
  Report,
  Status,
  useAction,
  useSocial,
} from "./common";

export default function Profile({ id }: { id?: string }) {
  const q = useSocial("profile", id),
    a = useAction();
  const [edit, setEdit] = useState(false),
    [report, setReport] = useState(false),
    [request, setRequest] = useState(false),
    [intro, setIntro] = useState("");
  const d = q.data,
    p = d?.profile;
  return (
    <section className="social-page">
      <OnlineStatus />
      <Status error={q.error || a.error} loading={q.loading} retry={q.reload} />
      {d && (
        <>
          <div className="social-heading">
            <div>
              <span className="eyebrow">YOUR STUDY COMMUNITY</span>
              <h1>{d.mine ? "Your profile" : p?.username}</h1>
            </div>
            {d.mine && (
              <button className="primary" onClick={() => setEdit(true)}>
                {p ? "Edit profile" : "Create profile"}
              </button>
            )}
          </div>
          {p ? (
            <article className="social-card">
              <div className="social-row">
                <Avatar profile={p} />
                <div>
                  <h2>@{p.username}</h2>
                  <span>
                    {p.public ? "Public profile" : "Private profile"} ·{" "}
                    {d.followers} followers
                  </span>
                </div>
              </div>
              <p className="social-body">
                {p.bio || "Ready to learn something new."}
              </p>
              <div className="social-row">
                {p.interests.map((s: string) => (
                  <span className="social-tag" key={s}>
                    {s}
                  </span>
                ))}
              </div>
              <div className="social-row">
                {p.links.map((s: SocialRow, i: number) => (
                  <a
                    key={i}
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                  >
                    {s.label} ↗
                  </a>
                ))}
              </div>
              {d.mine && (
                <label>
                  Profile link
                  <input
                    readOnly
                    value={
                      typeof window !== "undefined"
                        ? `${window.location.origin}/author/${d.id}`
                        : ""
                    }
                    onFocus={(e) => e.target.select()}
                  />
                </label>
              )}
              {!d.mine && d.viewer && (
                <div className="social-row">
                  <button
                    disabled={a.busy}
                    onClick={() =>
                      a.run(
                        "follow",
                        { target: d.id, enabled: !d.following },
                        q.reload,
                      )
                    }
                  >
                    {d.following ? "Unfollow" : "Follow"}
                  </button>
                  {d.canRequest && (
                    <button onClick={() => setRequest(true)}>
                      Request conversation
                    </button>
                  )}
                  <button onClick={() => setReport(true)}>Report</button>
                  <button
                    disabled={a.busy}
                    onClick={() =>
                      a.run("block", { target: d.id, enabled: true }, q.reload)
                    }
                  >
                    Block
                  </button>
                </div>
              )}
            </article>
          ) : (
            <p>
              Create your community identity. Your profile starts private, and
              your personal workspace stays private.
            </p>
          )}
          {d.mine && (
            <>
              <h2>
                Account statistics <small>Only you can see these</small>
              </h2>
              <div className="social-stats">
                {Object.entries(d.stats || {}).map(([label, value]) => (
                  <div className="social-card" key={label}>
                    <strong>{String(value)}</strong>
                    <span>
                      {(
                        {
                          saved: "Saved posts",
                          savedPublications: "Saved publications",
                          downloads: "People who downloaded your work",
                          downloaded: "Publications you downloaded",
                          sharedCollections: "Shared collections",
                          comments: "Comments on your posts",
                        } as Record<string, string>
                      )[label] || label}
                    </span>
                  </div>
                ))}
              </div>
              <p className="muted">
                Downloads count unique signed-in accounts requesting an export.
              </p>
            </>
          )}
          <h2>Published work</h2>
          <p>Only snapshots explicitly published by this author appear here.</p>
          <div className="social-grid">
            {d.publications.map(({ payload: s }: SocialRow) => (
              <article className="social-card" key={s.publicationId}>
                <h3>
                  <a href={"/p/" + s.publicationId}>{s.title}</a>
                </h3>
                <p>{s.description}</p>
                <span>
                  {s.notes?.length || 0} notes · version {s.version}
                </span>
              </article>
            ))}
          </div>
          {!d.publications.length && <p>No published work yet.</p>}
          {d.mine && d.blocked?.length > 0 && (
            <>
              <h2>Blocked accounts</h2>
              {d.blocked.map((b: SocialRow) => (
                <div className="social-row" key={b.id}>
                  <span>@{b.username}</span>
                  <button
                    disabled={a.busy}
                    onClick={() =>
                      a.run("block", { target: b.id, enabled: false }, q.reload)
                    }
                  >
                    Unblock
                  </button>
                </div>
              ))}
            </>
          )}
          {edit && (
            <EditProfile
              profile={p}
              onClose={() => setEdit(false)}
              saved={() => {
                setEdit(false);
                q.reload();
              }}
            />
          )}
          {report && (
            <Report kind="profile" id={d.id} onClose={() => setReport(false)} />
          )}
          {request && (
            <Modal
              title="Request a conversation"
              onClose={() => setRequest(false)}
              description="Send one introduction. You can send more messages after they accept."
            >
              <form
                className="social-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void a.run("request", { target: d.id, body: intro }, () => {
                    setRequest(false);
                    setIntro("");
                    window.location.assign("/w/messages");
                  });
                }}
              >
                <label>
                  Your introduction
                  <textarea
                    required
                    maxLength={8000}
                    value={intro}
                    onChange={(e) => setIntro(e.target.value)}
                  />
                </label>
                <Status error={a.error} />
                <button className="primary" disabled={a.busy}>
                  Send request
                </button>
              </form>
            </Modal>
          )}
        </>
      )}
    </section>
  );
}
function EditProfile({
  profile,
  onClose,
  saved,
}: {
  profile?: SocialRow;
  onClose: () => void;
  saved: () => void;
}) {
  const [p, setP] = useState<SocialRow>(
      profile || {
        username: "",
        bio: "",
        avatar: "",
        interests: [],
        links: [],
        public: false,
        requests: false,
        preferences: {
          messages: true,
          invitations: true,
          comments: true,
          following: true,
        },
      },
    ),
    [interests, setInterests] = useState((p.interests || []).join(", "));
  const a = useAction();
  const field = (key: string, value: unknown) => setP({ ...p, [key]: value });
  async function upload(file?: File) {
    if (!file) return;
    try {
      if (
        !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
        file.size > 5000000
      )
        throw new Error("Choose a PNG, JPEG or WebP smaller than 5 MB.");
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement("canvas");
      canvas.width = 200;
      canvas.height = 200;
      const size = Math.min(bitmap.width, bitmap.height);
      canvas
        .getContext("2d")!
        .drawImage(
          bitmap,
          (bitmap.width - size) / 2,
          (bitmap.height - size) / 2,
          size,
          size,
          0,
          0,
          200,
          200,
        );
      bitmap.close();
      field("avatar", canvas.toDataURL("image/webp", 0.8));
    } catch (e) {
      a.setError((e as Error).message);
    }
  }
  return (
    <Modal title="Edit your profile" onClose={onClose} wide>
      <form
        className="social-form"
        onSubmit={(e) => {
          e.preventDefault();
          void a.run(
            "profile",
            {
              ...p,
              interests: [
                ...new Set(
                  interests
                    .split(",")
                    .map((s: string) => s.trim().toLowerCase())
                    .filter(Boolean),
                ),
              ],
            },
            saved,
          );
        }}
      >
        <label>
          Public username
          <input
            required
            pattern="[a-zA-Z0-9_]{3,32}"
            maxLength={32}
            value={p.username}
            onChange={(e) => field("username", e.target.value)}
          />
        </label>
        <label>
          Avatar
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => void upload(e.target.files?.[0])}
          />
        </label>
        {p.avatar && (
          <div className="social-row">
            <Avatar profile={p} />
            <button type="button" onClick={() => field("avatar", "")}>
              Remove image
            </button>
          </div>
        )}
        <label>
          Biography
          <textarea
            maxLength={2000}
            value={p.bio}
            onChange={(e) => field("bio", e.target.value)}
          />
        </label>
        <label>
          Study interests (comma separated, up to 20)
          <input
            value={interests}
            onChange={(e) => setInterests(e.target.value)}
            placeholder="mathematics, biology, exam preparation"
          />
        </label>
        <fieldset>
          <legend>Social links</legend>
          {p.links.map((link: SocialRow, i: number) => (
            <div className="social-row" key={i}>
              <input
                aria-label={`Link ${i + 1} label`}
                required
                maxLength={60}
                value={link.label}
                placeholder="Website name"
                onChange={(e) =>
                  field(
                    "links",
                    p.links.map((s: SocialRow, j: number) =>
                      i === j ? { ...s, label: e.target.value } : s,
                    ),
                  )
                }
              />
              <input
                aria-label={`Link ${i + 1} URL`}
                required
                type="url"
                pattern="https://.*"
                maxLength={500}
                value={link.url}
                placeholder="https://…"
                onChange={(e) =>
                  field(
                    "links",
                    p.links.map((s: SocialRow, j: number) =>
                      i === j ? { ...s, url: e.target.value } : s,
                    ),
                  )
                }
              />
              <button
                type="button"
                onClick={() =>
                  field(
                    "links",
                    p.links.filter((_: unknown, j: number) => i !== j),
                  )
                }
              >
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            disabled={p.links.length >= 10}
            onClick={() => field("links", [...p.links, { label: "", url: "" }])}
          >
            Add social link
          </button>
        </fieldset>
        <label className="social-check">
          <input
            type="checkbox"
            checked={p.public}
            onChange={(e) => field("public", e.target.checked)}
          />
          Public profile
        </label>
        <p className="muted">
          Your bio, interests and social links become visible. Your workspace
          and account statistics stay private. Existing publication links remain
          public until you unpublish them.
        </p>
        <label className="social-check">
          <input
            type="checkbox"
            checked={p.requests}
            onChange={(e) => field("requests", e.target.checked)}
          />
          Accept message requests when my profile is public
        </label>
        <fieldset>
          <legend>Inbox notifications</legend>
          {["messages", "invitations", "comments", "following"].map((key) => (
            <label className="social-check" key={key}>
              <input
                type="checkbox"
                checked={p.preferences?.[key] !== false}
                onChange={(e) =>
                  field("preferences", {
                    ...p.preferences,
                    [key]: e.target.checked,
                  })
                }
              />
              {key}
            </label>
          ))}
        </fieldset>
        <Status error={a.error} />
        <button className="primary" disabled={a.busy}>
          Save profile
        </button>
      </form>
    </Modal>
  );
}
