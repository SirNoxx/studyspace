import { z } from "zod";
import { codeFence } from "./code-blocks";

const unit = z.number().finite().min(0).max(1);
export const pdfAnnotationSchema = z.object({
  id: z.string().uuid(),
  page: z.number().int().min(1).max(2000),
  kind: z.enum(["pen", "highlight", "text", "correction"]),
  x: unit,
  y: unit,
  width: unit,
  height: unit,
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  size: z.number().finite().min(1).max(96),
  text: z.string().max(10000).optional(),
  points: z
    .array(z.tuple([unit, unit]))
    .max(5000)
    .optional(),
});
export const pdfModuleSchema = z.object({
  version: z.literal(1),
  kind: z.literal("pdf"),
  source: z.string().max(1000),
  annotations: z.array(pdfAnnotationSchema).max(2000),
});
export type PDFModuleData = z.infer<typeof pdfModuleSchema>;
export type PDFAnnotation = z.infer<typeof pdfAnnotationSchema>;
export type PDFImportMode = "module" | "markdown";
export function pdfModule(source: string, title = "PDFs") {
  return codeFence({
    id: crypto.randomUUID(),
    language: "module",
    title,
    collapsed: false,
    code: JSON.stringify({
      version: 1,
      kind: "pdf",
      source,
      annotations: [],
    } satisfies PDFModuleData),
  });
}
export function pdfOverlayPlacement(
  box: { x: number; y: number; width: number; height: number },
  rotation: number,
) {
  const angle = ((rotation % 360) + 360) % 360;
  const { x, y, width: w, height: h } = box;
  if (angle === 90) return { x: x + w, y, width: h, height: w, angle };
  if (angle === 180) return { x: x + w, y: y + h, width: w, height: h, angle };
  if (angle === 270) return { x, y: y + h, width: h, height: w, angle };
  return { x, y, width: w, height: h, angle: 0 };
}
