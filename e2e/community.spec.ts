import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { writeFile } from "node:fs/promises";

// Opt-in hosted smoke test. All writes and messages belong to temporary test
// accounts; admin creation sends no email. Cleanup runs even after a test fails.
test.describe("connected community with isolated accounts", () => {
  test.skip(
    process.env.RUN_COMMUNITY_HOSTED !== "1",
    "Requires explicit hosted test run",
  );
  test.describe.configure({ mode: "serial" });
  test.setTimeout(180000);
  test.use({ actionTimeout: 15000 });
  let admin: SupabaseClient;
  const accounts: {
    id: string;
    client: SupabaseClient;
    cookies: any[];
    name: string;
  }[] = [];
  let owner: BrowserContext, editor: BrowserContext, viewer: BrowserContext;
  async function command(
    index: number,
    action: string,
    data: Record<string, unknown>,
    id = randomUUID(),
  ) {
    const { data: result, error } = await accounts[index].client.rpc(
      "community_command",
      { p_action: action, p_data: data, p_request: id },
    );
    if (error) throw new Error(error.message);
    return result;
  }
  test.beforeAll(async ({ browser }) => {
    process.loadEnvFile(".env.local");
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!,
      key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    for (let i = 0; i < 3; i++) {
      const suffix = randomUUID().slice(0, 8),
        email = `community-test-${suffix}@example.invalid`,
        password = randomUUID() + "Aa1!";
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (error || !data.user) throw new Error("Test account creation failed");
      const account = {
        id: data.user.id,
        client: null as any,
        cookies: [] as any[],
        name: `test_${suffix}`,
      };
      accounts.push(account);
      const client = createServerClient(url, key, {
        auth: { autoRefreshToken: false },
        cookies: {
          getAll: () => account.cookies,
          setAll: (items) => {
            for (const item of items) {
              account.cookies = account.cookies.filter(
                (c) => c.name !== item.name,
              );
              account.cookies.push(item);
            }
          },
        },
      });
      account.client = client;
      const auth = await client.auth.signInWithPassword({ email, password });
      if (auth.error) throw new Error("Test account sign-in failed");
    }
    const contexts = [];
    for (const a of accounts) {
      const ctx = await browser.newContext();
      await ctx.addCookies(
        a.cookies.map((c) => ({
          name: c.name,
          value: c.value,
          domain: new URL(process.env.E2E_BASE_URL || "http://127.0.0.1:3000")
            .hostname,
          path: "/",
          httpOnly: false,
          secure: false,
          sameSite: "Lax" as const,
        })),
      );
      contexts.push(ctx);
    }
    [owner, editor, viewer] = contexts;
  });
  test.afterAll(async () => {
    for (const ctx of [owner, editor, viewer]) await ctx?.close();
    for (const a of accounts) {
      const { error } = await admin.auth.admin.deleteUser(a.id);
      if (error)
        throw new Error("Temporary test account cleanup failed: " + a.id);
    }
  });
  test("profile setup, privacy, community posting, responsive layout and accessibility", async () => {
    const p = await owner.newPage();
    await p.goto("/w/profile");
    await p
      .getByRole("button", { name: "Skip walkthrough", exact: true })
      .click();
    await p
      .getByRole("button", { name: "Create profile", exact: true })
      .click();
    await p.getByLabel("Public username").fill(accounts[0].name);
    await p.getByLabel("Biography").fill("Learning biology together.");
    await p.getByLabel("Study interests").fill("biology, mathematics");
    await p.getByLabel("Public profile", { exact: true }).check();
    await p.getByLabel("Accept message requests").check();
    await p.getByRole("button", { name: "Save profile", exact: true }).click();
    await expect(p.getByRole("dialog")).toHaveCount(0);
    await expect(p.getByText("Learning biology together.")).toBeVisible();
    await command(1, "profile", {
      username: accounts[1].name,
      public: true,
      requests: true,
    });
    await command(2, "profile", {
      username: accounts[2].name,
      public: false,
      requests: false,
    });
    const publicPage = await viewer.newPage();
    await publicPage.goto("/author/" + accounts[0].id);
    await expect(
      publicPage.getByText("Learning biology together."),
    ).toBeVisible();
    await expect(publicPage.getByText("Account statistics")).toHaveCount(0);
    await p.goto("/w/discover");
    await p.getByRole("button", { name: "Create a post", exact: true }).click();
    await p
      .getByLabel("Title", { exact: true })
      .fill("Biology study group " + accounts[0].name);
    await p
      .getByLabel("Your post", { exact: true })
      .fill("Looking for someone to study cells with.");
    await p.getByLabel("Topics (comma").fill("biology");
    await p.getByRole("button", { name: "Publish post", exact: true }).click();
    await expect(p.getByRole("dialog")).toHaveCount(0);
    await expect(
      p.getByRole("heading", {
        name: "Biology study group " + accounts[0].name,
      }),
    ).toBeVisible();
    await p.setViewportSize({ width: 390, height: 844 });
    await p.goto("/author/" + accounts[0].id);
    await expect(
      p.getByRole("heading", { name: "Your profile", exact: true }),
    ).toBeVisible();
    expect(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const audit = await new AxeBuilder({ page: p })
      .include(".social-page")
      .analyze();
    expect(audit.violations).toEqual([]);
    await p.screenshot({
      path: "docs/screenshots/community-profile-mobile.png",
      fullPage: true,
    });
  });
  test("shared edits retain drafts across conflicts, restore versions and enforce revocation", async () => {
    const c = await command(0, "collection", {
      title: "Biology collaboration",
    });
    const invite = randomUUID();
    await command(
      0,
      "invite",
      { collection: c.id, target: accounts[1].id, role: "editor" },
      invite,
    );
    const ep = await editor.newPage();
    await ep.goto("/w/shared");
    await ep
      .getByRole("button", { name: "Skip walkthrough", exact: true })
      .click();
    await ep
      .getByRole("button", { name: "Accept invitation", exact: true })
      .click();
    await ep
      .getByRole("button", { name: /Biology collaboration.*editor/ })
      .click();
    await ep
      .getByRole("button", { name: "New shared note", exact: true })
      .click();
    await ep.getByLabel("Name", { exact: true }).fill("Cell notes");
    await ep.getByRole("button", { name: "Create note", exact: true }).click();
    await expect(ep.getByLabel("File name", { exact: true })).toHaveValue(
      "Cell notes",
    );
    await ep.getByLabel("Note (Markdown)").fill("Original explanation");
    await ep.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(
      ep.getByText("Version 2 · Saved", { exact: true }),
    ).toBeVisible();
    const op = await owner.newPage();
    await op.goto("/w/shared");
    await op
      .getByRole("button", { name: /Biology collaboration.*owner/ })
      .click();
    await op.getByRole("button", { name: /▤ Cell notes/ }).click();
    await op.getByLabel("Note (Markdown)").fill("Owner draft stays here");
    await ep
      .getByLabel("Note (Markdown)")
      .fill("Collaborator updated explanation");
    await ep.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(
      ep.getByText("Version 3 · Saved", { exact: true }),
    ).toBeVisible();
    await expect(
      op.getByRole("button", { name: "Compare changes" }),
    ).toBeVisible({ timeout: 15000 });
    await expect(op.getByLabel("Note (Markdown)")).toHaveValue(
      "Owner draft stays here",
    );
    await op.getByRole("button", { name: "Compare changes" }).click();
    await expect(op.getByRole("dialog")).toContainText(
      "Collaborator updated explanation",
    );
    await op
      .getByLabel("Your draft", { exact: true })
      .fill("Combined reviewed explanation");
    await op
      .getByRole("button", { name: "Save reviewed draft against version 3" })
      .click();
    await expect(op.getByRole("dialog")).toHaveCount(0);
    await expect(
      op.getByText("Version 4 · Saved", { exact: true }),
    ).toBeVisible();
    await op.getByLabel("Add attachment").setInputFiles({
      name: "study.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("Only collaborators may read this"),
    });
    const link = op.getByRole("link", { name: /study.txt/ });
    await expect(link).toBeVisible();
    const asset = await link.getAttribute("href");
    expect((await editor.request.get(asset!)).status()).toBe(200);
    await command(0, "member", {
      collection: c.id,
      target: accounts[1].id,
      role: "remove",
    });
    expect((await editor.request.get(asset!)).status()).toBe(404);
    await expect(ep.getByText("You no longer have permission")).toBeVisible({
      timeout: 15000,
    });
    await op
      .getByRole("button", { name: "Version history", exact: true })
      .click();
    await expect(op.getByText("Version 1 ·", { exact: false })).toBeVisible();
    await op.screenshot({
      path: "docs/screenshots/community-shared-editor.png",
      fullPage: true,
    });
  });
  test("message requests and lost-response retries deliver only one message", async () => {
    const c = await command(1, "request", {
      target: accounts[0].id,
      body: "Can we study together?",
    });
    const op = await owner.newPage();
    await op.goto("/w/messages");
    await op
      .getByRole("button", { name: new RegExp(accounts[1].name) })
      .click();
    await op.getByRole("button", { name: "Accept", exact: true }).click();
    await expect(
      op.getByRole("button", { name: "Send message", exact: true }),
    ).toBeEnabled();
    const ep = await editor.newPage();
    await ep.goto("/w/messages");
    await ep
      .getByRole("button", { name: new RegExp(accounts[0].name) })
      .click();
    let lost = false;
    const sentIds: string[] = [];
    await ep.route("**/api/social", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      const body = route.request().postDataJSON();
      if (body.action !== "message") return route.continue();
      sentIds.push(body.requestId);
      if (!lost) {
        lost = true;
        await route.fetch();
        await route.abort("connectionfailed");
      } else await route.continue();
    });
    await ep.getByLabel("Message", { exact: true }).fill("A reliable message");
    await ep.getByRole("button", { name: "Send message", exact: true }).click();
    await expect(ep.getByRole("alert")).toBeVisible();
    await expect(ep.getByLabel("Message", { exact: true })).toHaveValue(
      "A reliable message",
    );
    await ep.getByRole("button", { name: "Send message", exact: true }).click();
    await expect(ep.getByLabel("Message", { exact: true })).toHaveValue("");
    expect(sentIds).toHaveLength(2);
    expect(sentIds[0]).toBe(sentIds[1]);
    const { data, error } = await accounts[0].client.rpc("community_query", {
      p_kind: "messages",
      p_id: c.id,
    });
    expect(error).toBeNull();
    expect(
      data.items.filter((m: any) => m.body === "A reliable message"),
    ).toHaveLength(1);
    await op.getByRole("button", { name: "Block", exact: true }).click();
    await expect(
      ep.getByRole("button", { name: "Send message", exact: true }),
    ).toBeDisabled({ timeout: 15000 });
  });
  test("bounded community load meets the staged latency target", async () => {
    const c = await command(0, "collection", {
      title: "Temporary load verification",
      nodes: Array.from({ length: 200 }, (_, i) => ({
        id: randomUUID(),
        kind: "note",
        title: `Test note ${i}`,
        body: "Study content. ".repeat(70),
      })),
    });
    const timings: number[] = [];
    const url = "/api/social?kind=collection&id=" + c.id;
    const initial = await owner.request.get(url);
    expect(initial.ok()).toBe(true);
    const node = (await initial.json()).nodes[0];
    const race = await Promise.all(
      ["A", "B"].map((body) =>
        owner.request.post("/api/social", {
          timeout: 10000,
          data: {
            action: "node-save",
            requestId: randomUUID(),
            data: {
              collection: c.id,
              id: node.id,
              revision: 1,
              title: node.title,
              body,
              parent: null,
            },
          },
        }),
      ),
    );
    expect(race.map((r) => r.status()).sort()).toEqual([200, 409]);
    for (let batch = 0; batch < 3; batch++)
      await Promise.all(
        Array.from({ length: 4 }, async () => {
          const start = performance.now();
          const r = await owner.request.get(url);
          expect(r.ok()).toBe(true);
          expect((await r.json()).nodes).toHaveLength(200);
          timings.push(performance.now() - start);
        }),
      );
    timings.sort((a, b) => a - b);
    const p95 = timings[Math.ceil(timings.length * 0.95) - 1];
    const report = {
      date: new Date().toISOString(),
      scenario: "200 shared notes, 4 concurrent readers, 12 requests",
      p95Milliseconds: Math.round(p95),
      targetMilliseconds: 5000,
    };
    await writeFile(
      "docs/community-load-results.json",
      JSON.stringify(report, null, 2) + "\n",
    );
    expect(p95).toBeLessThan(5000);
  });
});
