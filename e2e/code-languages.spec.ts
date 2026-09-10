import { test, expect } from "@playwright/test";

const examples = [
  {
    language: "javascript",
    code: 'console.log("JS result", 6 * 7);',
    result: "JS result 42",
  },
  {
    language: "typescript",
    code: 'enum Choice { First = 42 }; const answer: number = Choice.First; console.log("TS result", answer);',
    result: "TS result 42",
  },
  {
    language: "python",
    code: 'import math\nprint("Python result", math.factorial(5))',
    result: "Python result 120",
  },
  {
    language: "sql",
    code: "CREATE TABLE scores (value INTEGER); INSERT INTO scores VALUES (21), (21); SELECT SUM(value) AS answer FROM scores;",
    result: "42",
  },
  {
    language: "c",
    code: '#include <stdio.h>\nint main(void) { printf("C result %d\\n", 6*7); return 0; }',
    result: "C result 42",
  },
  {
    language: "cpp",
    code: '#include <iostream>\n#include <vector>\n#include <numeric>\nint main() { std::vector<int> a{20,22}; std::cout << "C++ result " << std::accumulate(a.begin(), a.end(), 0) << std::endl; }',
    result: "C++ result 42",
  },
  { language: "json", code: '{"answer":42}', result: "Valid JSON." },
];
for (const example of examples)
  test(`${example.language} executes real code and can run again`, async ({
    page,
  }) => {
    test.setTimeout(180000);
    await page.goto("/demo?sample=1");
    await page
      .getByRole("textbox", { name: "Markdown editor", exact: true })
      .click({ button: "right" });
    await page
      .getByRole("menuitem", { name: "Add code block", exact: true })
      .click();
    const cell = page.getByRole("region", { name: "Code block", exact: true });
    await cell.getByLabel("Code language").selectOption(example.language);
    await cell
      .getByRole("textbox", { name: "Code editor", exact: true })
      .fill(example.code);
    for (let run = 0; run < 2; run++) {
      await cell.getByRole("button", { name: "Run", exact: true }).click();
      await expect(cell.getByLabel("Code output")).toContainText(
        example.result,
        { timeout: 120000 },
      );
      await expect(
        cell.getByRole("button", { name: "Stop", exact: true }),
      ).toHaveCount(0);
    }
  });

test("HTML and CSS render isolated previews without executing embedded scripts", async ({
  page,
}) => {
  await page.goto("/demo?sample=1");
  await page
    .getByRole("textbox", { name: "Markdown editor", exact: true })
    .click({ button: "right" });
  await page
    .getByRole("menuitem", { name: "Add code block", exact: true })
    .click();
  const cell = page.getByRole("region", { name: "Code block", exact: true });
  await cell.getByLabel("Code language").selectOption("html");
  await cell
    .getByRole("textbox", { name: "Code editor", exact: true })
    .fill(
      '<h1>My HTML lesson</h1><script>parent.document.body.innerHTML="unsafe";</script><a href="https://example.invalid">Link</a>',
    );
  await cell.getByRole("button", { name: "Run", exact: true }).click();
  const frame = page.frameLocator('iframe[title="Code preview"]');
  await expect(
    frame.getByRole("heading", { name: "My HTML lesson" }),
  ).toBeVisible();
  await expect(frame.locator("script")).toHaveCount(0);
  await expect(frame.locator("a")).not.toHaveAttribute("href");
  await cell.getByLabel("Code language").selectOption("css");
  await cell
    .getByRole("textbox", { name: "Code editor", exact: true })
    .fill("h1 { color: rgb(255, 0, 0); }");
  await cell.getByRole("button", { name: "Run", exact: true }).click();
  await expect(frame.getByRole("heading", { name: "CSS preview" })).toHaveCSS(
    "color",
    "rgb(255, 0, 0)",
  );
});

test("stdin, compiler errors and sandbox recovery work across runtimes", async ({
  page,
}) => {
  test.setTimeout(180000);
  await page.goto("/demo?sample=1");
  await page
    .getByRole("textbox", { name: "Markdown editor", exact: true })
    .click({ button: "right" });
  await page
    .getByRole("menuitem", { name: "Add code block", exact: true })
    .click();
  const cell = page.getByRole("region", { name: "Code block", exact: true });
  const editor = cell.getByLabel("Code editor", { exact: true });
  const output = cell.getByLabel("Code output");
  await cell.getByText("Program input (stdin)", { exact: true }).click();
  await cell.getByLabel("Program input", { exact: true }).fill("21");
  for (const [language, code] of [
    ["python", "print(int(input()) * 2)"],
    [
      "c",
      '#include <stdio.h>\nint main(void){int n; scanf("%d", &n); printf("%d", n*2); return 0;}',
    ],
    [
      "cpp",
      "#include <iostream>\nint main(){int n; std::cin >> n; std::cout << n*2;}",
    ],
  ]) {
    await cell.getByLabel("Code language").selectOption(language);
    await editor.fill(code);
    await cell.getByRole("button", { name: "Run", exact: true }).click();
    await expect(output).toHaveText("42", { timeout: 120000 });
  }
  await editor.fill("int main() { this is not valid C++; }");
  await cell.getByRole("button", { name: "Run", exact: true }).click();
  await expect(output).toContainText("error:", { timeout: 120000 });
  await cell.getByLabel("Code language").selectOption("javascript");
  await editor.fill(
    `console.log(typeof document, typeof process); for (const url of ['https://example.invalid/', '${new URL(page.url()).origin}/api/workspace']) { try { await fetch(url); console.log('UNEXPECTED NETWORK'); } catch { console.log('Blocked'); } }`,
  );
  await cell.getByRole("button", { name: "Run", exact: true }).click();
  await expect(output).toHaveText("undefined undefined\nBlocked\nBlocked");
  await editor.fill("while(true) {}");
  await cell.getByRole("button", { name: "Run", exact: true }).click();
  await cell.getByRole("button", { name: "Stop", exact: true }).click();
  await expect(output).toContainText("Stopped.");
  await editor.fill('console.log("Recovered");');
  await cell.getByRole("button", { name: "Run", exact: true }).click();
  await expect(output).toHaveText("Recovered");
});
