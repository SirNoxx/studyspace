import { test, expect, type Page } from "@playwright/test";
import * as Y from "yjs";
import {
  legacyWorkspace,
  writeWorkspace,
  encode,
  toBase64,
  fromBase64,
  readWorkspace,
} from "../src/lib/shared/document";
const collection = "20000000-0000-4000-8000-000000000001",
  folder = "30000000-0000-4000-8000-000000000001",
  note = "40000000-0000-4000-8000-000000000001";
function fixture() {
  const doc = new Y.Doc();
  let revision = 1;
  const offline = new Set<string>(),
    revoked = new Set<string>();
  writeWorkspace(
    doc,
    legacyWorkspace({
      collection: {
        id: collection,
        title: "Computer science together",
        revision: 1,
      },
      nodes: [
        {
          id: folder,
          kind: "folder",
          title: "Git examples",
          parent_id: null,
          body: "",
          revision: 1,
        },
        {
          id: note,
          kind: "note",
          title: "Team notes",
          parent_id: folder,
          body: "Shared material.",
          revision: 1,
        },
      ],
    }),
  );
  return {
    doc,
    offline,
    revoked,
    async connect(page: Page, role = "editor", viewer = crypto.randomUUID()) {
      await page.route("**/api/session", (r) =>
        r.fulfill({
          json: { user: { id: viewer, email: "fixture@example.invalid" } },
        }),
      );
      await page.route("**/api/collaboration**", (r) =>
        r.fulfill({ json: { viewer, invitations: [], connections: [] } }),
      );
      await page.route("**/api/social**", (r) => {
        const kind = new URL(r.request().url()).searchParams.get("kind");
        return r.fulfill({
          json:
            kind === "shared"
              ? {
                  viewer,
                  items: [
                    {
                      id: collection,
                      title: "Computer science together",
                      role,
                      member_count: 2,
                    },
                  ],
                  invitations: [],
                }
              : { viewer, items: [], unread: 0, requests: 0 },
        });
      });
      await page.route("**/api/shared/live**", (r) => {
        const req = r.request();
        if (offline.has(viewer)) return r.abort();
        if (revoked.has(viewer))
          return r.fulfill({
            status: 403,
            json: { error: "Access to this collection was revoked." },
          });
        if (req.method() === "POST") {
          if (role === "viewer")
            return r.fulfill({ status: 403, json: { error: "Viewer access" } });
          Y.applyUpdate(doc, fromBase64(req.postDataJSON().update));
          revision++;
        }
        const url = new URL(req.url());
        if (req.method() === "GET" && url.searchParams.has("offset")) {
          const state = toBase64(encode(doc)),
            offset = Number(url.searchParams.get("offset"));
          return r.fulfill({
            json: {
              part: state.slice(offset, offset + 1000),
              length: state.length,
              offset,
              role,
              revision,
              viewer,
            },
          });
        }
        const vector =
          req.method() === "POST"
            ? req.postDataJSON().vector
            : new URL(req.url()).searchParams.get("vector");
        return r.fulfill({
          json: {
            state: toBase64(
              encode(doc, vector ? fromBase64(vector) : undefined),
            ),
            role,
            revision,
            viewer,
          },
        });
      });
      await page.goto("/demo?sample=1");
      await page
        .getByRole("button", { name: "Shared collections", exact: true })
        .click();
      await page
        .locator("#shared-explorer-slot")
        .getByRole("button", { name: /Computer science together/ })
        .click();
      const shell = page.locator(".shared-workspace-overlay");
      await expect(
        shell.getByText("SHARED COLLECTIONS", { exact: true }),
      ).toBeVisible();
      return shell;
    },
  };
}
test("shared workspace reuses inline folders, context menus and modules", async ({
  page,
}) => {
  const f = fixture(),
    shell = await f.connect(page);
  const editor = shell.getByRole("textbox", {
    name: "Markdown editor",
    exact: true,
  });
  await expect(editor).toHaveText("Shared material.");
  await shell
    .getByRole("button", {
      name: "Collapse Git examples contents",
      exact: true,
    })
    .click({ button: "right" });
  await shell
    .getByRole("menuitem", { name: "New folder", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const rename = shell.getByRole("textbox", {
    name: "Folder name",
    exact: true,
  });
  await rename.fill("Nested examples");
  await rename.press("Enter");
  await expect(
    shell.getByText("Nested examples", { exact: true }),
  ).toBeVisible();
  await expect
    .poll(
      () =>
        readWorkspace(f.doc).containers.find(
          (c) => c.title === "Nested examples",
        )?.parentId,
    )
    .toBe(folder);
  await shell.getByRole("button", { name: "Modules", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByText("Whiteboard", { exact: true }).last(),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/shared-regular-workspace.png" });
});
test("two editors merge live typing and viewers receive read-only updates", async ({
  browser,
}) => {
  const f = fixture();
  const contexts = await Promise.all([
    browser.newContext(),
    browser.newContext(),
    browser.newContext(),
  ]);
  try {
    const pages = await Promise.all(contexts.map((c) => c.newPage()));
    const a = await f.connect(pages[0]),
      b = await f.connect(pages[1]),
      v = await f.connect(pages[2], "viewer");
    const ae = a.getByRole("textbox", { name: "Markdown editor", exact: true }),
      be = b.getByRole("textbox", { name: "Markdown editor", exact: true });
    await expect(
      v.getByRole("textbox", { name: "Markdown editor", exact: true }),
    ).toHaveCount(0);
    await Promise.all([ae.press("Control+End"), be.press("Control+End")]);
    await Promise.all([
      ae.pressSequentially(" Alice learns Git."),
      be.pressSequentially(" Bob learns branches."),
    ]);
    await expect
      .poll(() => readWorkspace(f.doc).notes[0].body.length)
      .toBe("Shared material. Alice learns Git. Bob learns branches.".length);
    const body = readWorkspace(f.doc).notes[0].body;
    await expect(ae).toHaveText(body);
    await expect(be).toHaveText(body);
    // Each character survives concurrent edits even if the typing interleaves.
    expect(body.length).toBe(
      "Shared material. Alice learns Git. Bob learns branches.".length,
    );
    await expect(v.locator(".writing-area").first()).toContainText(body);
    await expect(a.locator(".save-state")).toContainText("Live");
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
    f.doc.destroy();
  }
});

test("unsynced shared edits survive reopening and revoked access stops editing", async ({
  page,
}) => {
  const f = fixture(),
    user = crypto.randomUUID();
  let shell = await f.connect(page, "editor", user);
  let editor = shell.getByRole("textbox", {
    name: "Markdown editor",
    exact: true,
  });
  f.offline.add(user);
  await editor.press("Control+End");
  await editor.pressSequentially(" Recovery survives.");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          Object.keys(localStorage).filter((k) => k.includes(":draft:")).length,
      ),
    )
    .toBeGreaterThan(0);
  f.offline.delete(user);
  // Reopening must merge the durable delta and acknowledge it before clearing recovery.
  await page.reload();
  shell = page.locator(".shared-workspace-overlay");
  editor = shell.getByRole("textbox", { name: "Markdown editor", exact: true });
  await expect(editor).toContainText("Recovery survives.");
  await expect
    .poll(() => readWorkspace(f.doc).notes[0].body)
    .toContain("Recovery survives.");
  f.revoked.add(user);
  await expect(
    shell.getByRole("textbox", { name: "Markdown editor", exact: true }),
  ).toHaveCount(0);
  await expect(
    shell.getByText("Access to this collection was revoked.", { exact: true }),
  ).toBeVisible();
});
