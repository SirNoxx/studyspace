import { test, expect } from "@playwright/test";

test("files edit independently side by side and restore after reload", async ({
  page,
}) => {
  await page.goto("/demo?sample=1");
  const left = page.locator(".main-workspace");
  const original = await left
    .getByLabel("Note title", { exact: true })
    .inputValue();
  await page
    .locator(".note-row")
    .filter({ hasText: "Learning roadmap" })
    .click({ button: "right" });
  await page
    .getByRole("menuitem", { name: "Open file to the right", exact: true })
    .click();
  const right = page.getByRole("region", { name: "Right file pane" });
  await expect(right.getByLabel("Right note title")).toHaveValue(
    "Learning roadmap",
  );
  await right.getByLabel("Right note title").fill("Right pane saved title");
  await expect(left.getByLabel("Note title", { exact: true })).toHaveValue(
    original,
  );
  await right
    .getByRole("textbox", { name: "Markdown editor", exact: true })
    .fill("Right pane independent content");
  await expect(page.locator(".save-state")).toContainText(
    "Saved on this device",
  );
  await page.reload();
  await expect(right.getByLabel("Right note title")).toHaveValue(
    "Right pane saved title",
  );
  await expect(
    right.getByRole("textbox", { name: "Markdown editor", exact: true }),
  ).toContainText("Right pane independent content");
  await expect(
    left.getByRole("textbox", { name: "Markdown editor", exact: true }),
  ).toContainText("Tool calling");
  await page.screenshot({ path: "docs/screenshots/files-side-by-side.png" });
  await right.getByRole("button", { name: "Close right file pane" }).click();
  await expect(right).toHaveCount(0);
});

test("active panes receive file opens and keep independent back and forward histories", async ({
  page,
}) => {
  await page.goto("/demo?sample=1");
  const left = page.getByRole("main", { name: "Left file pane" }),
    right = page.getByRole("region", { name: "Right file pane" });
  await page
    .locator(".note-row")
    .filter({ hasText: "Learning roadmap" })
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: "Open file to the right" }).click();
  await right.getByLabel("Right note title").click();
  await page
    .locator(".note-row")
    .filter({ hasText: "Retrieval augmented generation" })
    .click();
  await expect(right.getByLabel("Right note title")).toHaveValue(
    "Retrieval augmented generation",
  );
  await expect(left.getByLabel("Note title", { exact: true })).toHaveValue(
    "Tool calling",
  );
  await expect(right).toHaveClass(/active-file-pane/);
  await right.getByRole("button", { name: "Back to previous note" }).click();
  await expect(right.getByLabel("Right note title")).toHaveValue(
    "Learning roadmap",
  );
  await right.getByRole("button", { name: "Forward to next note" }).click();
  await left.getByLabel("Note title", { exact: true }).click();
  await page
    .locator(".note-row")
    .filter({ hasText: "Learning roadmap" })
    .click();
  await expect(left.getByLabel("Note title", { exact: true })).toHaveValue(
    "Learning roadmap",
  );
  await expect(right.getByLabel("Right note title")).toHaveValue(
    "Retrieval augmented generation",
  );
  await left.getByRole("button", { name: "Back to previous note" }).click();
  await expect(left.getByLabel("Note title", { exact: true })).toHaveValue(
    "Tool calling",
  );
  await expect(
    left.getByRole("button", { name: "Forward to next note" }),
  ).toBeEnabled();
  await page
    .locator(".note-row")
    .filter({ hasText: "Retrieval augmented generation" })
    .click();
  await expect(
    left.getByRole("button", { name: "Forward to next note" }),
  ).toBeDisabled();
  for (let i = 0; i < 6; i++)
    await left.getByRole("button", { name: "New note", exact: true }).click();
  const tabs = left.getByRole("region", { name: "Open file tabs" });
  expect(await tabs.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(
    true,
  );
  expect(await tabs.evaluate((el) => getComputedStyle(el).scrollbarWidth)).toBe(
    "thin",
  );
  await tabs.evaluate((el) => {
    el.scrollLeft = 200;
  });
  expect(await tabs.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
});

test("chat tools stay compact and generated text respects the reader's scroll position", async ({
  page,
}) => {
  await page.goto("/demo?sample=1");
  await page.getByRole("button", { name: "Open AI Chat", exact: true }).click();
  await expect(page.getByLabel("Study card difficulty")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Make study cards", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Study Tools", exact: true }).click();
  await page
    .getByRole("menuitem", { name: "Make study cards", exact: true })
    .click();
  await expect(page.getByLabel("Study card difficulty")).toBeVisible();
  await page.getByRole("button", { name: "Study Tools", exact: true }).click();
  await page
    .getByRole("menuitem", { name: "Ask a question", exact: true })
    .click();
  await expect(page.getByLabel("Study card difficulty")).toHaveCount(0);
  await page.getByRole("button", { name: "Chat options", exact: true }).click();
  await page
    .getByLabel(
      "Allow sending this selected context to the configured AI provider.",
    )
    .check();
  await page.getByRole("button", { name: "Chat options", exact: true }).click();
  await page.evaluate(() => {
    const original = window.fetch;
    window.fetch = async (input, init) => {
      if (input === "/api/ai")
        return new Response(
          new ReadableStream({
            start(controller) {
              (window as any).testChatStream = controller;
            },
          }),
          { headers: { "Content-Type": "application/x-ndjson" } },
        );
      return original(input, init);
    };
  });
  await page
    .getByLabel("Chat message", { exact: true })
    .fill("Help me read this slowly");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  const text = Array.from(
    { length: 70 },
    (_, i) =>
      `Paragraph ${i + 1}. A detailed explanation for reading at my own pace.`,
  ).join("\n\n");
  await page.evaluate(
    (text) =>
      (window as any).testChatStream.enqueue(
        new TextEncoder().encode(
          JSON.stringify({ type: "delta", text }) + "\n",
        ),
      ),
    text,
  );
  const log = page.getByRole("log");
  await expect(log).toContainText("Paragraph 70");
  expect(await log.evaluate((el) => el.scrollTop)).toBe(0);
  await log.evaluate((el) => {
    el.scrollTop = 220;
  });
  await page.evaluate(
    (text) =>
      (window as any).testChatStream.enqueue(
        new TextEncoder().encode(
          JSON.stringify({
            type: "delta",
            text: text + "\n\nMore generated text",
          }) + "\n",
        ),
      ),
    text,
  );
  await expect(log).toContainText("More generated text");
  expect(await log.evaluate((el) => el.scrollTop)).toBe(220);
  await page.getByRole("button", { name: "Scroll to bottom of chat" }).click();
  await expect
    .poll(() =>
      log.evaluate((el) =>
        Math.abs(el.scrollHeight - el.clientHeight - el.scrollTop),
      ),
    )
    .toBeLessThan(2);
  await page.evaluate((text) => {
    (window as any).testChatStream.enqueue(
      new TextEncoder().encode(
        JSON.stringify({ type: "complete", text, evidence: [] }) + "\n",
      ),
    );
    (window as any).testChatStream.close();
  }, text + "\n\nMore generated text");
});

test("pasted video links create reusable transcripts and support manual import", async ({
  page,
}) => {
  await page.goto("/demo?sample=1");
  await page.route("**/api/transcripts", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        title: "Example lecture",
        text: "A synthetic lecture explaining functions and inputs.",
        status: "ready",
        language: "en",
      }),
    }),
  );
  const editor = page.getByRole("textbox", {
    name: "Markdown editor",
    exact: true,
  });
  await editor.evaluate((el) => {
    const data = new DataTransfer();
    data.setData("text/plain", "https://youtu.be/abcdefghijk");
    el.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  const transcript = page.getByRole("button", {
    name: /Transcript for Example lecture/,
  });
  await transcript.click();
  const dialog = page.getByRole("dialog", {
    name: "Transcript for Example lecture",
  });
  await expect(dialog).toContainText(
    "A synthetic lecture explaining functions and inputs.",
  );
  await dialog
    .getByRole("button", { name: "Add text to note", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
  await expect(editor).toContainText(
    "A synthetic lecture explaining functions and inputs.",
  );
  await expect(page.locator(".save-state")).toContainText(
    "Saved on this device",
  );
  await page.reload();
  await expect(transcript).toBeVisible();
  await page.route("**/api/transcripts", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        error: "Configure a transcript provider or import manually.",
      }),
    }),
  );
  await editor.evaluate((el) => {
    const data = new DataTransfer();
    data.setData("text/plain", "https://youtu.be/lmnopqrstuv");
    el.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await page
    .getByRole("button", { name: /Transcript for YouTube video lmnopqrstuv/ })
    .click();
  await page
    .getByLabel("Video title", { exact: true })
    .fill("My imported lesson");
  await page
    .getByLabel("Paste transcript", { exact: true })
    .fill("Transcript pasted from my lecture.");
  await page
    .getByRole("button", { name: "Save transcript", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "Transcript pasted from my lecture.",
  );
  await page.screenshot({ path: "docs/screenshots/video-transcript.png" });
});

test("code blocks run, preserve code when collapsed, and share a selection with chat", async ({
  page,
}) => {
  await page.goto("/demo?sample=1");
  const editor = page.getByRole("textbox", {
    name: "Markdown editor",
    exact: true,
  });
  await editor.click({ button: "right" });
  await page
    .getByRole("menuitem", { name: "Add code block", exact: true })
    .click();
  const block = page.getByRole("region", { name: "Code block", exact: true });
  await expect(block).toBeVisible();
  const code = block.getByRole("textbox", { name: "Code editor", exact: true });
  await code.fill("const answer = 6 * 7;\nconsole.log(answer);");
  await block.getByRole("button", { name: "Run", exact: true }).click();
  await expect(block.getByLabel("Code output")).toHaveText("42");
  await code.click();
  await page.keyboard.press("Control+a");
  await block.getByRole("button", { name: "Add to Chat", exact: true }).click();
  await expect(page.locator(".chat-attached-passage")).toContainText(
    "const answer = 6 * 7;",
  );
  await block
    .getByRole("button", { name: "Collapse code block", exact: true })
    .click();
  await expect(code).toHaveCount(0);
  await expect(block).toContainText("Code preserved");
  await expect(page.locator(".save-state")).toContainText(
    "Saved on this device",
  );
  await page.reload();
  await expect(
    block.getByRole("button", { name: "Expand code block" }),
  ).toBeVisible();
  await block.getByRole("button", { name: "Expand code block" }).click();
  await expect(code).toContainText("console.log(answer)");
  await code.fill(
    "console.log(typeof document);\ntry { await fetch('https://example.com/'); } catch { console.log('Network blocked'); }",
  );
  await block.getByRole("button", { name: "Run", exact: true }).click();
  await expect(block.getByLabel("Code output")).toContainText(
    "undefined\nNetwork blocked",
  );
  await code.fill("while (true) {}");
  await block.getByRole("button", { name: "Run", exact: true }).click();
  await expect(block.getByLabel("Code output")).toContainText(
    "Stopped after 5 seconds.",
    { timeout: 8000 },
  );
  await code.fill("console.log('Ready to study');");
  await block.getByRole("button", { name: "Run", exact: true }).click();
  await expect(block.getByLabel("Code output")).toHaveText("Ready to study");
  await page.screenshot({ path: "docs/screenshots/runnable-code-block.png" });
});
