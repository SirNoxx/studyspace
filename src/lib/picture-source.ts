import { markdownLanguage } from "@codemirror/lang-markdown";

function pictures(body: string, source: string) {
  const result: { from: number; to: number }[] = [];
  markdownLanguage.parser.parse(body).iterate({
    enter(node) {
      if (node.name === "Image" && body.slice(node.from, node.to) === source)
        result.push({ from: node.from, to: node.to });
    },
  });
  return result;
}

/** Match a rendered image to its original occurrence; never remove an ambiguous embed. */
export function pictureSource(
  body: string,
  rendered: string,
  from?: number,
  to?: number,
) {
  if (from === undefined || to === undefined) return;
  const source = rendered.slice(from, to);
  const visible = pictures(rendered, source),
    original = pictures(body, source);
  if (visible.length !== original.length) return;
  const index = visible.findIndex(
    (range) => range.from === from && range.to === to,
  );
  return original[index];
}
