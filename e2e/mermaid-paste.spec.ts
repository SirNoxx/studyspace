import { test, expect, type Locator } from "@playwright/test";

const source = `flowchart LR
    A[GuiGrid chat and agents] --> B[GuiGrid native bridge]
    B --> C[Ollama on localhost:11434]
    C --> D[Model running on CPU or GPU]
    D --> C
    C --> B
    B --> A
    A --> E[GuiGrid tools: Calculator, Notes, apps]`;
const fenced = "```mermaid\n" + source + "\n```";

async function paste(editor: Locator, plain: string, html = "") {
  await editor.evaluate(
    (element, { plain, html }) => {
      const data = new DataTransfer();
      data.setData("text/plain", plain);
      if (html) data.setData("text/html", html);
      element.dispatchEvent(
        new ClipboardEvent("paste", {
          clipboardData: data,
          bubbles: true,
          cancelable: true,
        }),
      );
    },
    { plain, html },
  );
}

test("pasted flowchart renders live, supports undo/editing and survives reading/reload", async ({
  page,
}) => {
  await page.goto("/demo?sample=1");
  const editor = page.getByRole("textbox", {
    name: "Markdown editor",
    exact: true,
  });
  await editor.fill("");
  await editor.press("End");
  await paste(editor, fenced);
  const block = page.getByRole("region", { name: "Mermaid diagram block" });
  await expect(block.locator("svg")).toBeVisible();
  await expect(block.locator("svg")).toContainText("GuiGrid chat and agents");
  await expect(block.locator("svg")).toContainText("Ollama on localhost:11434");
  await expect(block.locator("svg")).toContainText(
    "GuiGrid tools: Calculator, Notes, apps",
  );
  await editor.press("Control+z");
  await expect(block).toHaveCount(0);
  await editor.press("Control+y");
  await expect(block.locator("svg")).toBeVisible();
  await block.getByRole("button", { name: "Edit diagram" }).click();
  await expect(block.getByLabel("Mermaid source")).toHaveValue(source);
  await block
    .getByLabel("Mermaid source")
    .fill(source.replace("GuiGrid native bridge", "Updated native bridge"));
  await block.getByRole("button", { name: "Apply diagram" }).click();
  await expect(block.locator("svg")).toContainText("Updated native bridge");
  await page.screenshot({ path: "test-results/mermaid-paste.png" });
  await page.getByRole("button", { name: "Source", exact: true }).click();
  await expect(editor).toContainText("mermaid studyspace:");
  await expect(editor).toContainText("Updated native bridge");
  await page.getByRole("button", { name: "Reading", exact: true }).click();
  await expect(page.locator(".markdown:visible .diagram svg")).toContainText(
    "Updated native bridge",
  );
  await expect(page.locator(".save-state")).toContainText(
    "Saved on this device",
  );
  await page.reload();
  await page.getByRole("button", { name: "Live preview", exact: true }).click();
  await expect(block.locator("svg")).toContainText("Updated native bridge");
  await block.getByRole("button", { name: "Delete diagram" }).click();
  await expect(block).toHaveCount(0);
  await editor.press("Control+z");
  await expect(block.locator("svg")).toBeVisible();
});

test("rich pasted diagram recovers after a syntax error is corrected", async ({
  page,
}) => {
  await page.goto("/demo?sample=1");
  const editor = page.getByRole("textbox", {
    name: "Markdown editor",
    exact: true,
  });
  await editor.fill("");
  await editor.press("End");
  await paste(
    editor,
    "",
    '<pre><code class="language-mermaid">flowchart LR\nA[unfinished</code></pre>',
  );
  const block = page.getByRole("region", { name: "Mermaid diagram block" });
  await expect(block).toContainText("Original text is preserved");
  await block.getByRole("button", { name: "Edit diagram" }).click();
  await expect(block.getByLabel("Mermaid source")).toHaveValue(
    "flowchart LR\nA[unfinished",
  );
  await block
    .getByLabel("Mermaid source")
    .fill("flowchart LR\nA[Fixed] --> B[Works]");
  await block.getByRole("button", { name: "Apply diagram" }).click();
  await expect(block.locator("svg")).toContainText("Fixed");
  await expect(block).not.toContainText("Original text is preserved");
});
