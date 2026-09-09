import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { emptyWorkspace, uid, now } from "../src/lib/model";
import { createContainer } from "../src/lib/domain";
test("measures a realistic 10,000-note workspace without hiding unreachable tree rows", async ({
  page,
  browserName,
}) => {
  test.setTimeout(90000);
  const w = emptyWorkspace(),
    at = now();
  for (let group = 0; group < 25; group++) {
    const c = createContainer(w, {
      title: "TEST Research collection " + group,
    });
    for (let i = 0; i < 400; i++)
      w.notes.push({
        id: uid(),
        containerId: c.id,
        title: i === 0 ? "Introduction" : "TEST Research " + group + "-" + i,
        body:
          "# TEST evidence\n\n" +
          ("Research term " + i + " links ideas to evidence. ").repeat(8),
        kind: "note",
        revision: 1,
        createdAt: at,
        updatedAt: at,
        history: [],
        tags: [],
      });
  }
  w.definitions = Array.from({ length: 3000 }, (_, i) => ({
    id: uid(),
    term: "Research term " + i,
    definition: "OBVIOUS TEST DEFINITION " + i,
    aliases: [],
    subjectIds: [w.notes[0].containerId],
    createdAt: at,
    updatedAt: at,
  }));
  await page.goto("/demo");
  await expect(page.getByText("Make room for your ideas.")).toBeVisible();
  await page.evaluate(async (state) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open("studyspace-device-v1", 1);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(
        ["workspaces", "navigation", "drafts"],
        "readwrite",
      );
      tx.objectStore("workspaces").put(state, "demo");
      tx.objectStore("navigation").clear();
      tx.objectStore("drafts").clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, w);
  await page.reload();
  await expect(page.locator(".cm-content")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Next 200", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Next 200", exact: true }).click();
  await expect(
    page.getByText("TEST Research 0-399", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Previous", exact: true }).click();
  await page.locator(".cm-content").click();
  await page.keyboard.press("Control+End");
  await page.evaluate(() => {
    (window as any).typing = [];
    document.addEventListener(
      "keydown",
      (e) => {
        if (e.key.length === 1) {
          const start = performance.now();
          requestAnimationFrame(() => {
            (window as any).typing.push(performance.now() - start);
          });
        }
      },
      true,
    );
  });
  await page.keyboard.type("A measured typing transaction.", { delay: 55 });
  const values = await page.evaluate(() => (window as any).typing as number[]);
  values.sort((a, b) => a - b);
  const start = Date.now();
  await page.getByText("TEST Research 0-1", { exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Note title" })).toHaveValue(
    "TEST Research 0-1",
  );
  const switchMs = Date.now() - start;
  await writeFile(
    process.env.E2E_BUILD_MODE === "production"
      ? "docs/evidence/browser-performance-production.json"
      : "docs/evidence/browser-performance.json",
    JSON.stringify(
      {
        date: new Date().toISOString(),
        environment:
          "Windows local Next " +
          (process.env.E2E_BUILD_MODE === "production"
            ? "production"
            : "development") +
          " server; Playwright " +
          browserName,
        notes: 10000,
        terms: 3000,
        characters: values.length,
        keydownToAnimationFrameMs: {
          p50: values[Math.floor(values.length * 0.5)],
          p95: values[Math.floor(values.length * 0.95)],
          max: values.at(-1),
        },
        cachedSwitchIncludingPlaywrightMs: switchMs,
        targets: { typingFrameMs: 16, cachedSwitchMs: 200 },
        limits:
          "Synthetic key events and local device storage; network/database latency and IME are not measured.",
      },
      null,
      2,
    ),
  );
  expect(values.length).toBeGreaterThan(20);
  expect(await page.locator("[role=treeitem]").count()).toBeLessThan(250);
});
