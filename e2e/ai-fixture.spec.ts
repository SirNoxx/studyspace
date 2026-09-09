import { test, expect } from "@playwright/test";
test("AI fixture: explicit rewrite acceptance, hidden quiz answers, and resumable private responses", async ({
  page,
}) => {
  await page.goto("/demo?sample=1");
  await expect(page.locator(".save-state")).toContainText("Saved");
  await page.getByRole("tab", { name: "AI Study Guide", exact: true }).click();
  await page.getByRole("button", { name: "Chat options", exact: true }).click();
  await page
    .getByLabel(
      "Allow sending this selected context to the configured AI provider.",
    )
    .check();
  await page.route("**/api/ai", async (route) => {
    const request = route.request().postDataJSON();
    const text =
      request.action === "quiz"
        ? JSON.stringify({
            questions: [
              {
                question: "TEST FIXTURE — What does a tool call request?",
                answer: "A structured request to an external capability.",
              },
              {
                question: "TEST FIXTURE — Why validate inputs?",
                answer: "To check arguments before execution.",
              },
            ],
          })
        : "## TEST FIXTURE — provider was not called\n\nReview this proposed explanation.";
    await route.fulfill({
      status: 200,
      contentType: "application/x-ndjson",
      body: JSON.stringify({ type: "complete", text, evidence: [] }) + "\n",
    });
  });
  await page.getByRole("button", { name: "Chat options", exact: true }).click();
  await page
    .getByRole("button", { name: "Explain in more detail", exact: false })
    .click();
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await page.getByRole("button", { name: "Review & save response" }).click();
  await expect(page.getByRole("dialog")).toContainText("TEST FIXTURE");
  await page.screenshot({
    path: "docs/screenshots/ai-rewrite-FIXTURE.png",
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Reject", exact: true }).click();
  await page.getByRole("button", { name: "Chat options", exact: true }).click();
  await page.getByLabel("Chat action").selectOption("quiz");
  await page.getByLabel("Chat message", { exact: true }).fill("Test me");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.locator(".quiz-session")).toBeVisible();
  await expect(
    page.getByText("A structured request to an external capability.", {
      exact: true,
    }),
  ).toHaveCount(0);
  await page
    .getByLabel("Your answer", { exact: true })
    .fill("My private test response");
  await page
    .getByRole("button", { name: "Reveal answer & evidence", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Needs practice", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Next question", exact: true })
    .click();
  await expect(page.locator(".save-state")).toContainText("Saved");
  await page.reload();
  await page.getByRole("tab", { name: "AI Study Guide", exact: true }).click();
  await page.getByRole("button", { name: "Previous", exact: true }).click();
  await expect(page.getByLabel("Your answer", { exact: true })).toHaveValue(
    "My private test response",
  );
});
