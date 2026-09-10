import { test, expect, type Page } from "@playwright/test";
async function openChat(page: Page) {
  await page.goto("/demo?sample=1");
  await page.getByRole("button", { name: "Open AI Chat", exact: true }).click();
  await page.getByRole("button", { name: "Chat options", exact: true }).click();
  await page
    .getByLabel(
      "Allow sending this selected context to the configured AI provider.",
    )
    .check();
  await page.getByRole("button", { name: "Chat options", exact: true }).click();
}
test("failed chat messages remain visible, survive reopening and can be retried", async ({
  page,
}) => {
  await openChat(page);
  await page.route("**/api/ai", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ error: "Sign in to continue." }),
    }),
  );
  await page
    .getByLabel("Chat message", { exact: true })
    .fill("Keep this question in my history");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.getByRole("log")).toContainText(
    "Keep this question in my history",
  );
  await expect(page.getByRole("log")).toContainText("Sign in to continue.");
  await expect(
    page.getByRole("button", { name: "Retry message", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".save-state")).toContainText(
    "Saved on this device",
  );
  await page.reload();
  await page.getByRole("button", { name: "Open AI Chat", exact: true }).click();
  await expect(page.getByRole("log")).toContainText(
    "Keep this question in my history",
  );
  await page.getByRole("button", { name: "New chat", exact: true }).click();
  await page.getByRole("button", { name: "Chat history", exact: true }).click();
  const history = page.getByRole("dialog", { name: "Chat history" });
  await history.getByLabel("Search chat history").fill("Keep this question");
  await history
    .getByRole("button")
    .filter({ hasText: "Keep this question" })
    .click();
  await page
    .getByRole("button", { name: "Retry message", exact: true })
    .click();
  await expect(page.getByLabel("Chat message", { exact: true })).toHaveValue(
    "Keep this question in my history",
  );
  await page.screenshot({ path: "docs/screenshots/ai-message-retry.png" });
});

test("folder summaries and hard study cards can be reviewed, saved and reopened", async ({
  page,
}) => {
  await openChat(page);
  const requests: any[] = [];
  await page.route("**/api/ai", (route) => {
    const request = route.request().postDataJSON();
    requests.push(request);
    return route.fulfill({
      status: 200,
      contentType: "application/x-ndjson",
      body:
        JSON.stringify({
          type: "complete",
          text:
            request.action === "cards"
              ? JSON.stringify({
                  questions: [
                    {
                      question:
                        "A system receives an unknown request. Infer what should happen before execution and justify it.",
                      answer:
                        "Validate the arguments against the schema before execution.",
                    },
                    {
                      question:
                        "A response includes unsupported details despite retrieved passages. Diagnose the problem.",
                      answer:
                        "Grounding failed: the claims must be checked against supplied evidence.",
                    },
                  ],
                })
              : "Summary of all selected research notes.",
          coverage: { notes: 3, sections: 1 },
          evidence: [],
        }) + "\n",
    });
  });
  await page
    .getByLabel("Study material", { exact: true })
    .selectOption("folder");
  await page
    .getByRole("button", {
      name: "Select study material: Coding contents",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Study Tools", exact: true }).click();
  await page.getByRole("menuitem", { name: "Summarize", exact: true }).click();
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.getByRole("log")).toContainText(
    "Summary of all selected research notes.",
  );
  await page.getByRole("button", { name: "Study Tools", exact: true }).click();
  await page
    .getByRole("menuitem", { name: "Make study cards", exact: true })
    .click();
  await page
    .getByLabel("Study card difficulty", { exact: true })
    .selectOption("hard");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  const cards = page.getByRole("region", { name: "Generated study cards" });
  await expect(cards).toContainText("2 study cards");
  expect(requests[0].scope).toBe("folder");
  expect(requests[1]).toMatchObject({
    action: "cards",
    difficulty: "hard",
    containerId: requests[0].containerId,
  });
  await cards.locator("summary").first().click();
  await cards
    .getByLabel("Card 1 question", { exact: true })
    .fill(
      "Explain why validation must precede execution in an unfamiliar system.",
    );
  await cards
    .getByRole("button", { name: "Save all 2 cards to Review", exact: true })
    .click();
  await expect(
    cards.getByRole("button", { name: "Saved to Review", exact: true }),
  ).toBeDisabled();
  await expect(page.locator(".save-state")).toContainText(
    "Saved on this device",
  );
  await page.reload();
  await page.getByRole("button", { name: "Open AI Chat", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Saved to Review", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Chat history", exact: true }).click();
  await page.screenshot({ path: "docs/screenshots/ai-chat-history.png" });
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.screenshot({ path: "docs/screenshots/ai-folder-cards.png" });
});
