import { studyCodeBlocks, codeFence } from "../code-blocks";
import { parseModule } from "../modules";
export function workbookReferences(body: string) {
  return studyCodeBlocks(body).flatMap((block) => {
    const data = block.language === "module" ? parseModule(block.code) : null;
    return data?.kind === "spreadsheet" ? [{ block, data }] : [];
  });
}
export function remapWorkbooks(body: string, ids: Map<string, string>) {
  let next = body;
  for (const { block, data } of workbookReferences(body).reverse()) {
    const id = ids.get(data.workbookId);
    if (id)
      next =
        next.slice(0, block.from) +
        codeFence({
          ...block,
          code: JSON.stringify({ ...data, workbookId: id }),
        }) +
        next.slice(block.to);
  }
  return next;
}
/** Publication copies include explicit values only, never private resource IDs,
 * unselected worksheets, seed data, formula source or hidden dependencies. */
export function publicSpreadsheetPreviews(body: string) {
  let next = body;
  const escape = (value: string) =>
    value.replace(/[\\`*_{}\[\]()#+.!|<>]/g, "\\$&").replace(/\r?\n/g, " ");
  for (const { block, data } of workbookReferences(body).reverse()) {
    const rows = data.preview?.rows;
    const text = rows?.length
      ? `**${escape(data.preview!.sheet)} · ${escape(data.preview!.range)}**\n\n| ${rows[0].map((_, i) => `Column ${i + 1}`).join(" | ")} |\n| ${rows[0].map(() => "---").join(" | ")} |\n` +
        rows.map((row) => "| " + row.map(escape).join(" | ") + " |").join("\n")
      : "> Spreadsheet omitted: no range was selected for publication.";
    next = next.slice(0, block.from) + text + next.slice(block.to);
  }
  return next;
}
