import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("five main tabs retain Library links, history and responsive navigation", async ({
  page,
}) => {
  await page.goto("/demo?sample=1");
  const main = page.getByRole("navigation", {
    name: "Main navigation",
    exact: true,
  });
  await expect(main.locator(".ribbon-main button")).toHaveCount(5);
  await expect(main.locator(".ribbon-main button")).toHaveText([
    "Collections",
    "Quick notes",
    "Journal",
    "Weekly checkups",
    "Library",
  ]);
  await main.getByRole("button", { name: "Library", exact: true }).click();
  await expect(page).toHaveURL(/\/demo\/library$/);
  const sections = page.getByRole("navigation", { name: "Library sections" });
  await expect(
    sections.getByRole("button", { name: "Discover", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await sections
    .getByRole("button", { name: "Bookmarks", exact: true })
    .click();
  await expect(page).toHaveURL(/\/demo\/bookmarks$/);
  await expect(
    main.getByRole("button", { name: "Library", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await page.reload();
  await expect(
    sections.getByRole("button", { name: "Bookmarks", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await sections
    .getByRole("button", { name: "Shared with me", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Shared collections", exact: true }),
  ).toBeVisible();
  await page.goBack();
  await expect(
    sections.getByRole("button", { name: "Bookmarks", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await page.goForward();
  await expect(
    sections.getByRole("button", { name: "Shared with me", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  expect(
    (await new AxeBuilder({ page }).include(".workspace-section-nav").analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({
    path: "test-results/navigation-library-desktop.png",
    animations: "disabled",
    timeout: 30000,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await main.getByRole("button", { name: "Library", exact: true }).click();
  await sections
    .getByRole("button", { name: "Bookmarks", exact: true })
    .click();
  await expect(
    sections.getByRole("button", { name: "Bookmarks", exact: true }),
  ).toBeInViewport();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/navigation-library-mobile.png",
    animations: "disabled",
    timeout: 30000,
  });
  await page.goto("/demo/discover");
  await expect(
    main.getByRole("button", { name: "Library", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    sections.getByRole("button", { name: "Discover", exact: true }),
  ).toHaveAttribute("aria-current", "page");
});

test("Card Review belongs to Library and global search clears a collection scope", async ({
  page,
}) => {
  await page.goto("/demo?sample=1");
  const main = page.getByRole("navigation", {
    name: "Main navigation",
    exact: true,
  });
  await expect(
    main.getByRole("button", { name: "Collections", exact: true }),
  ).toBeVisible();
  const fixture = await page.evaluate(async () => {
    return new Promise<{ id: string; title: string }>((resolve, reject) => {
      const req = indexedDB.open("studyspace-device-v1");
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction("workspaces");
        const read = tx.objectStore("workspaces").get("demo");
        read.onsuccess = () => {
          const collection = read.result.containers.find(
            (c: { system?: string; kind: string }) =>
              !c.system && c.kind !== "folder",
          );
          resolve({ id: collection.id, title: collection.title });
        };
        tx.oncomplete = () => db.close();
      };
    });
  });
  await page.goto(`/demo/collection/${fixture.id}`);
  await page
    .getByRole("navigation", { name: "Collections sections" })
    .getByRole("button", { name: "Review", exact: true })
    .click();
  await expect(
    main.getByRole("button", { name: "Library", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  const library = page.getByRole("navigation", { name: "Library sections" });
  await expect(
    library.getByRole("button", { name: "Card Review", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await library.getByRole("button", { name: "Bookmarks", exact: true }).click();
  await library.getByRole("button", { name: "Card Review", exact: true }).click();
  await expect(page).toHaveURL(/\/demo\/review$/);
  await page.reload();
  await expect(
    library.getByRole("button", { name: "Card Review", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    page.getByRole("combobox", { name: "Review collection", exact: true }),
  ).toHaveValue(fixture.id);
  await page
    .getByRole("combobox", { name: "Review collection", exact: true })
    .selectOption("all");
  await main.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page).toHaveURL(/\/demo\/search$/);
  await expect(
    page.getByText("All my collections", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("All my collections", { exact: true }),
  ).toBeVisible();
  await main
    .getByRole("button", { name: "Weekly checkups", exact: true })
    .click();
  await page.keyboard.press("Control+Shift+f");
  await expect(page).toHaveURL(/\/demo\/search$/);
  await expect(
    page.getByRole("textbox", { name: "Search workspace", exact: true }),
  ).toBeFocused();
});
