// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  formatClipboard,
  formatPastedMarkdown,
} from "../src/lib/clipboard-formatting";
import { studyCodeBlocks } from "../src/lib/code-blocks";

const example = `Suggested order

| **PhaseGoalDepends on** | | |
| --- | --- | --- |
| 0 | One codebase, production fixed, no fake data | Nothing |
| 1 | Tool list + tool-using agents + cloud AI turned on | Phase 0 |
| 2 | App pipe + first apps (Muse Spark, ViewMax, Spotify, Gmail, the muse.ai window) | Tool list from phase 1 |
| 3 | Built-in AI engine + model downloads | Can run alongside phase 2 |
| 4 | Scheduling, backup/restore, onboarding | Phases 1–2 |
| 5 | Windows signing, hardware testing, 1.0 release candidate | Everything |`;
const tables = (text: string) =>
  studyCodeBlocks(text)
    .filter((b) => b.language === "module")
    .map((b) => JSON.parse(b.code));

describe("clipboard formatting", () => {
  it("keeps paragraphs and lists inside their original rich table cells", () => {
    const result = formatClipboard(
      "broken fallback",
      "<h2>Suggested order</h2><table><thead><tr><th><p>Phase</p></th><th><p>Goal</p></th><th><p>Depends on</p></th></tr></thead><tbody><tr><td><p>0</p></td><td><p><strong>One codebase</strong>, production fixed, no fake data</p><p>Second paragraph</p></td><td><p>Nothing</p></td></tr><tr><td><p>1</p></td><td><ul><li>Tool list</li><li>Cloud AI</li></ul></td><td><p>Phase 0</p></td></tr></tbody></table><p>After the table.</p>",
    );
    const table = tables(result)[0];
    expect(table.headers).toEqual(["Phase", "Goal", "Depends on"]);
    expect(table.rows).toEqual([
      [
        "0",
        "**One codebase**, production fixed, no fake data\n\nSecond paragraph",
        "Nothing",
      ],
      ["1", "-   Tool list\n-   Cloud AI", "Phase 0"],
    ]);
    expect(result.slice(result.lastIndexOf("```") + 3).trim()).toBe(
      "After the table.",
    );
  });
  it("retains every data row in headerless HTML tables and expands merged cells", () => {
    const result = tables(
      formatClipboard(
        "",
        '<table><tr><td rowspan="2">Group</td><td>A</td></tr><tr><td>B</td></tr></table>',
      ),
    )[0];
    expect(result.headers).toEqual(["Column 1", "Column 2"]);
    expect(result.rows).toEqual([
      ["Group", "A"],
      ["", "B"],
    ]);
  });
  it("converts the supplied example without losing rows and recovers its column labels", () => {
    const result = formatPastedMarkdown(example);
    expect(result).toMatch(/^## Suggested order/);
    expect(tables(result)).toEqual([
      {
        version: 1,
        kind: "table",
        headers: ["**Phase**", "**Goal**", "**Depends on**"],
        rows: [
          ["0", "One codebase, production fixed, no fake data", "Nothing"],
          [
            "1",
            "Tool list + tool-using agents + cloud AI turned on",
            "Phase 0",
          ],
          [
            "2",
            "App pipe + first apps (Muse Spark, ViewMax, Spotify, Gmail, the muse.ai window)",
            "Tool list from phase 1",
          ],
          [
            "3",
            "Built-in AI engine + model downloads",
            "Can run alongside phase 2",
          ],
          ["4", "Scheduling, backup/restore, onboarding", "Phases 1–2"],
          [
            "5",
            "Windows signing, hardware testing, 1.0 release candidate",
            "Everything",
          ],
        ],
      },
    ]);
  });
  it("preserves semantic HTML headings, emphasis, links and table cells", () => {
    const result = formatClipboard(
      "flattened text",
      '<h2>Suggested order</h2><table><thead><tr><th>Phase</th><th>Goal</th></tr></thead><tbody><tr><td>0</td><td><strong>One codebase</strong> with <em>care</em></td></tr></tbody></table><p><strong>Things only you can do:</strong> <a href="https://example.com">Read this</a></p>',
    );
    expect(result).toContain("## Suggested order");
    expect(tables(result)[0].rows[0]).toEqual([
      "0",
      "**One codebase** with *care*",
    ]);
    expect(result).toContain("**Things only you can do:**");
    expect(result).toContain("[Read this](https://example.com)");
  });
  it("sanitizes active content and unsafe links", () => {
    const result = formatClipboard(
      "",
      '<h2>Safe</h2><script>alert(1)</script><a href="javascript:alert(1)">Text</a><iframe src="https://example.com"></iframe>',
    );
    expect(result).toBe("## Safe\n\nText");
  });
  it("leaves source code, quoted tables and ordinary paragraphs alone", () => {
    const code = "```markdown\n" + example + "\n```";
    expect(formatPastedMarkdown(code)).toBe(code);
    const quote = example
      .split("\n")
      .map((l) => "> " + l)
      .join("\n");
    expect(formatPastedMarkdown(quote)).toBe(quote);
    expect(
      formatPastedMarkdown(
        "A normal sentence.\n\n| A | B |\n| --- | --- |\n| x | y |",
      ),
    ).toMatch(/^A normal sentence\./);
    expect(
      formatClipboard(
        "**Original**",
        '<span style="font-weight:700">**Original**</span>',
      ),
    ).toBe("**Original**");
  });
  it("keeps escaped pipes, inline code, empty cells and multiple tables", () => {
    const one = "| A | B |\n| --- | --- |\n| a\\|b | `code` |\n| | **Bold** |";
    const result = tables(formatPastedMarkdown(one + "\n\n" + one));
    expect(result).toHaveLength(2);
    expect(result[0].rows).toEqual([
      ["a|b", "`code`"],
      ["", "**Bold**"],
    ]);
  });
  it("retains oversized tables as Markdown instead of discarding content", () => {
    const large =
      "| A | B |\n| --- | --- |\n" + Array(101).fill("| x | y |").join("\n");
    expect(formatPastedMarkdown(large)).toBe(large);
  });
});
