// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  formatClipboard,
  formatPastedMarkdown,
} from "../src/lib/clipboard-formatting";
import { studyCodeBlocks } from "../src/lib/code-blocks";

const source = `flowchart LR
    A[GuiGrid chat and agents] --> B[GuiGrid native bridge]
    B --> C[Ollama on localhost:11434]
    C --> D[Model running on CPU or GPU]
    D --> C
    C --> B
    B --> A
    A --> E[GuiGrid tools: Calculator, Notes, apps]`;
const fenced = "```mermaid\n" + source + "\n```";

describe("Mermaid clipboard formatting", () => {
  it("turns the supplied flowchart into a live block without altering its source", () => {
    const result = formatPastedMarkdown("Before\n\n" + fenced + "\n\nAfter");
    expect(studyCodeBlocks(result)).toMatchObject([
      { language: "mermaid", code: source },
    ]);
    expect(result).toMatch(/^Before\n\n/);
    expect(result).toMatch(/\n\nAfter$/);
    expect(formatPastedMarkdown(result)).toBe(result);
  });

  it("handles multiple diagrams, tilde fences, Windows newlines and mixed tables", () => {
    const result = formatPastedMarkdown(
      fenced +
        "\n\n~~~Mermaid\r\nsequenceDiagram\r\n  A->>B: Hello\r\n~~~\n\n| A | B |\n| --- | --- |\n| x | y |",
    );
    const blocks = studyCodeBlocks(result);
    expect(blocks.map((b) => b.language)).toEqual([
      "mermaid",
      "mermaid",
      "module",
    ]);
    expect(new Set(blocks.map((b) => b.id)).size).toBe(3);
    expect(blocks[1].code).toContain("A->>B: Hello");
  });

  it("preserves diagrams when accompanying clipboard HTML loses language metadata", () => {
    expect(
      studyCodeBlocks(
        formatClipboard(fenced, "<pre><code>flattened text</code></pre>"),
      )[0].code,
    ).toBe(source);
  });

  it("recognizes rich HTML Mermaid code with surrounding prose", () => {
    const result = formatClipboard(
      "",
      '<h2>Architecture</h2><pre><code class="language-mermaid">flowchart LR\n  A --&gt; B</code></pre><p>After</p>',
    );
    expect(result).toMatch(/^## Architecture/);
    expect(studyCodeBlocks(result)[0]).toMatchObject({
      language: "mermaid",
      code: "flowchart LR\n  A --> B",
    });
    expect(result).toMatch(/After$/);
  });

  it("leaves unfinished, nested, quoted and unrelated code examples literal", () => {
    for (const text of [
      "```mermaid\nflowchart LR\nA --> B",
      "````markdown\n" + fenced + "\n````",
      fenced
        .split("\n")
        .map((line) => "> " + line)
        .join("\n"),
      "```javascript\nconst mermaid = true;\n```",
    ])
      expect(formatPastedMarkdown(text)).toBe(text);
  });

  it("preserves invalid diagram text for editing instead of dropping the block", () => {
    const result = formatPastedMarkdown(
      "```mermaid\nflowchart LR\nA[unfinished\n```",
    );
    expect(studyCodeBlocks(result)[0].code).toBe("flowchart LR\nA[unfinished");
  });
});
