import type { ITextRun, ITextStyle } from "@univerjs/core";
/** Preserve existing styles outside a newly formatted substring. */
export function formatTextRuns(
  text: string,
  runs: ITextRun[],
  from: number,
  to: number,
  style: Partial<ITextStyle>,
): ITextRun[] {
  const points = [
    ...new Set([
      0,
      text.length,
      from,
      to,
      ...runs.flatMap((r) => [r.st, r.ed]),
    ]),
  ]
    .filter((p) => p >= 0 && p <= text.length)
    .sort((a, b) => a - b);
  const result: ITextRun[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const st = points[i],
      ed = points[i + 1];
    let ts: Partial<ITextStyle> = {};
    for (const run of runs)
      if (run.st <= st && run.ed >= ed) ts = { ...ts, ...run.ts };
    if (st >= from && ed <= to) ts = { ...ts, ...style };
    if (Object.keys(ts).length) result.push({ st, ed, ts });
  }
  return result;
}
