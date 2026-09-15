import { test, expect } from "@playwright/test";
test("sidebars follow Journal, Review and Quick notes while common actions remain", async ({
  page,
}) => {
  await page.goto("/demo?sample=1");
  await expect(
    page.getByRole("button", { name: "Planner", exact: true }),
  ).toBeVisible();
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open("studyspace-device-v1");
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const db = req.result,
          tx = db.transaction("workspaces", "readwrite"),
          store = tx.objectStore("workspaces"),
          read = store.get("demo");
        read.onsuccess = () => {
          const w = read.result;
          if (!w) {
            reject(Error("Missing demo fixture"));
            return;
          }
          const base = w.notes[0];
          const make = (
            title: string,
            kind: string,
            extra: Record<string, unknown> = {},
          ) => ({
            ...base,
            id: crypto.randomUUID(),
            title,
            kind,
            body: title + " body",
            tags: [],
            history: [],
            trashed: false,
            ...extra,
          });
          w.notes.push(
            make("January reflection", "journal", {
              journalDate: "2026-01-12",
            }),
            make("February reflection", "journal", {
              journalDate: "2026-02-05",
            }),
            make("Sidebar quick one", "quick"),
            make("Sidebar quick two", "quick"),
          );
          const groupId = crypto.randomUUID();
          w.settings.cardGroups = [
            { id: groupId, title: "Command line skills" },
          ];
          w.review = [
            {
              ...w.review[0],
              id: crypto.randomUUID(),
              groupId,
              front: "What does npm install do?",
              back: "Installs dependencies.",
            },
          ];
          store.put(w, "demo");
        };
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
    });
  });
  await page.reload();
  await page
    .getByRole("button", { name: "Journal", exact: true })
    .first()
    .click();
  const journal = page.getByRole("navigation", {
    name: "Journal entries by month",
    exact: true,
  });
  await expect(journal).toBeVisible();
  await expect(
    page.getByRole("tree", { name: "All collections", exact: true }),
  ).toHaveCount(0);
  await journal.getByRole("button", { name: /January 2026/ }).click();
  await journal.getByRole("button", { name: /January reflection/ }).click();
  await expect(
    page.getByLabel("Journal entry title", { exact: true }),
  ).toHaveValue("January reflection");
  await page.getByRole("button", { name: "Review", exact: true }).click();
  const review = page.getByRole("navigation", {
    name: "Review study groups",
    exact: true,
  });
  await review
    .getByRole("button", { name: "Expand Command line skills", exact: true })
    .click();
  await expect(
    review.getByRole("button", {
      name: "What does npm install do?",
      exact: true,
    }),
  ).toBeVisible();
  await review
    .getByRole("button", { name: "Command line skills 1", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Study group", exact: true }),
  ).not.toHaveValue("all");
  await review
    .getByRole("button", { name: "What does npm install do?", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "What does npm install do?",
  );
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Quick notes", exact: true })
    .first()
    .click();
  const quick = page.getByRole("navigation", {
    name: "Quick notes",
    exact: true,
  });
  await expect(quick).toContainText("Sidebar quick one");
  await expect(quick).toContainText("Sidebar quick two");
  await expect(
    page.getByRole("tree", { name: "All collections", exact: true }),
  ).toHaveCount(0);
  const sidebar = page.getByRole("complementary", {
    name: "Quick notes explorer",
  });
  await expect(
    sidebar.getByRole("button", { name: "Planner", exact: true }),
  ).toBeVisible();
  await expect(
    sidebar.getByRole("button", { name: "Calendar", exact: true }),
  ).toBeVisible();
  await expect(
    sidebar.getByRole("button", { name: "Quick actions", exact: true }),
  ).toBeVisible();
  // Opening a quick note uses the normal editor while preserving its navigation section.
  await page
    .locator(".quick-notes-list")
    .getByRole("button", { name: /^Sidebar quick one/ })
    .click();
  const editor = page.getByRole("textbox", {
    name: "Markdown editor",
    exact: true,
  });
  await expect(editor).toContainText("Sidebar quick one body");
  await expect(
    quick.getByRole("button", { name: "Sidebar quick one", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    page.getByRole("navigation",{name:"Main navigation"}).getByRole("button", { name: "Quick notes", exact: true }),
  ).toHaveClass(/active/);
  await expect(
    page.getByRole("tree", { name: "All collections", exact: true }),
  ).toHaveCount(0);
  await quick
    .getByRole("button", { name: "Sidebar quick two", exact: true })
    .click();
  await expect(page.getByLabel("Note title", { exact: true })).toHaveValue(
    "Sidebar quick two",
  );
  await expect(
    quick.getByRole("button", { name: "Sidebar quick two", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    quick.getByRole("button", { name: "Sidebar quick one", exact: true }),
  ).not.toHaveAttribute("aria-current", "page");
  await page.reload();
  await expect(editor).toContainText("Sidebar quick two body");
  await expect(
    quick.getByRole("button", { name: "Sidebar quick two", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await page.goBack();
  await expect(
    quick.getByRole("button", { name: "Sidebar quick one", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await page.screenshot({ path: "test-results/contextual-sidebar.png" });
  await page.getByRole("button", { name: "Collections", exact: true }).click();
  await expect(
    page.getByRole("tree", { name: "All collections", exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/demo\/?$/);
  await expect(
    page.getByRole("navigation", { name: "Quick notes", exact: true }),
  ).toHaveCount(0);
});

