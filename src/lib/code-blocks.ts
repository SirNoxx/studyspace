export interface StudyCodeBlock {
  id: string;
  language: string;
  code: string;
  collapsed: boolean;
  title?: string;
  from: number;
  to: number;
}
export type BlockAction = "save" | "publish" | "add" | "study" | "delete";
export function downloadBlock(block: StudyCodeBlock) {
  const extensions: Record<string, string> = {
    javascript: "js",
    typescript: "ts",
    c: "c",
    cpp: "cpp",
    python: "py",
    sql: "sql",
    html: "html",
    css: "css",
    json: "json",
    whiteboard: "md",
    module: "md",
  };
  const text = ["whiteboard", "module"].includes(block.language)
    ? codeFence(block)
    : block.code;
  const url = URL.createObjectURL(
    new Blob([text], { type: "text/plain;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download =
    (
      block.title || (block.language === "whiteboard" ? "Whiteboard" : "Code")
    ).replace(/[<>:"/\\|?*]/g, "-") +
    "." +
    (extensions[block.language] ?? "txt");
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Walk whole fences so examples containing a nested Studyspace fence stay literal.
export function studyCodeBlocks(body: string): StudyCodeBlock[] {
  const blocks: StudyCodeBlock[] = [];
  const opening = /^ {0,3}(`{3,}|~{3,})([^\n]*)\n/gm;
  let match: RegExpExecArray | null;
  while ((match = opening.exec(body))) {
    const close = new RegExp(
      "^ {0,3}" + match[1][0] + "{" + match[1].length + ",}[ \\t]*$",
      "gm",
    );
    close.lastIndex = opening.lastIndex;
    const end = close.exec(body);
    if (!end) break;
    const info =
      /^(\w+)\s+studyspace:([a-zA-Z0-9-]+)(?:\s+(collapsed))?(?:\s+title:(\S+))?\s*$/.exec(
        match[2].trim(),
      );
    let title: string | undefined;
    if (info?.[4]) {
      try {
        title = decodeURIComponent(info[4]).slice(0, 120);
      } catch {
        title = info[4].slice(0, 120);
      }
    }
    if (info)
      blocks.push({
        id: info[2],
        language: info[1],
        collapsed: !!info[3],
        ...(title ? { title } : {}),
        code: body.slice(opening.lastIndex, end.index).replace(/\n$/, ""),
        from: match.index,
        to: end.index + end[0].length,
      });
    opening.lastIndex = end.index + end[0].length;
  }
  return blocks;
}

export function codeFence(
  block: Pick<
    StudyCodeBlock,
    "id" | "language" | "code" | "collapsed" | "title"
  >,
) {
  const fence = "`".repeat(
    Math.max(
      3,
      ...Array.from(block.code.matchAll(/`+/g), (m) => m[0].length + 1),
    ),
  );
  return `${fence}${block.language} studyspace:${block.id}${block.collapsed ? " collapsed" : ""}${block.title ? " title:" + encodeURIComponent(block.title.slice(0, 120)) : ""}\n${block.code}\n${fence}`;
}

export function newCodeBlock() {
  return (
    "\n\n" +
    codeFence({
      id: crypto.randomUUID(),
      language: "javascript",
      collapsed: false,
      code: 'console.log("Hello, Studyspace!");',
    }) +
    "\n\n"
  );
}
