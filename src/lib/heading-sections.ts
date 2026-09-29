import type { Root, Element, RootContent } from "hast";

/** Group actual heading elements, never heading-like text in code blocks. */
export function readingHeadingSections() {
  return (tree: Root) => {
    const group = (parent: Root | Element) => {
      const original = [...parent.children];
      // Process containers independently, so quoted/list headings cannot consume outside text.
      for (const child of original) {
        if (
          child.type === "element" &&
          !["pre", "code"].includes(child.tagName)
        )
          group(child);
      }
      const result: RootContent[] = [];
      const stack: { level: number; body: Element }[] = [];
      for (const child of original) {
        const level =
          child.type === "element" && /^h[1-6]$/.test(child.tagName)
            ? Number(child.tagName[1])
            : 0;
        if (level) {
          while (stack.length && stack.at(-1)!.level >= level) stack.pop();
          const body: Element = {
            type: "element",
            tagName: "div",
            properties: {},
            children: [],
          };
          const section: Element = {
            type: "element",
            tagName: "section",
            properties: { dataHeadingSection: true },
            children: [child as Element, body],
          };
          (stack.at(-1)?.body.children ?? result).push(section);
          stack.push({ level, body });
        } else (stack.at(-1)?.body.children ?? result).push(child);
      }
      parent.children = result as Element["children"];
    };
    group(tree);
  };
}
