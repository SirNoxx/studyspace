import { describe, it, expect } from "vitest";
import {
  pdfModule,
  pdfModuleSchema,
  pdfOverlayPlacement,
} from "../src/lib/pdf-module";
import { attachmentTargets, publicMarkdown } from "../src/lib/markdown";
import {
  prepareImport,
  commitImport,
  sha256,
  exportWorkspace,
} from "../src/lib/transfer";
import { studyCodeBlocks } from "../src/lib/code-blocks";
import { emptyWorkspace, general, uid, now } from "../src/lib/model";
import { placeAttachment } from "../src/lib/attachment-placement";
import { PDFDocument } from "pdf-lib";

describe("PDF modules", () => {
  it("retains original bytes and links the imported PDF module to its attachment", async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage();
    const bytes = Uint8Array.from(await pdf.save());
    const plan = await prepareImport([new File([bytes], "Lecture.pdf")]);
    expect(plan.files.map((f) => f.kind)).toEqual(["asset", "note"]);
    expect(plan.files[0].bytes).toEqual(bytes);
    const w = emptyWorkspace(),
      id = uid();
    w.attachments.push({
      id,
      filename: "Lecture.pdf",
      mime: "application/pdf",
      size: bytes.length,
      hash: await sha256(bytes),
      key: "",
      createdAt: now(),
    });
    const result = commitImport(w, plan, general(w).id),
      data = pdfModuleSchema.parse(
        JSON.parse(studyCodeBlocks(result.notes[0].body)[0].code),
      );
    expect(data.source).toBe("attachment:" + id);
    expect(data.annotations).toEqual([]);
    expect(attachmentTargets(result.notes[0].body)).toContain(
      "attachment:" + id,
    );
    const rerun = await prepareImport(
      plan.files.map((f) => new File([Uint8Array.from(f.bytes)], f.path)),
    );
    expect(rerun.files.filter((f) => f.kind === "note")).toHaveLength(1);
    const zip = await exportWorkspace(w, {
      full: true,
      loadAsset: async () => bytes,
    });
    const restoredPlan = await prepareImport([
      new File([Uint8Array.from(zip)], "backup.zip"),
    ]);
    const fresh = emptyWorkspace(),
      newId = uid();
    fresh.attachments.push({ ...w.attachments[0], id: newId });
    const restored = commitImport(fresh, restoredPlan, general(fresh).id);
    expect(restored.imported).toBe(1);
    expect(restored.notes[0].body).toContain("attachment:" + newId);
    expect(attachmentTargets(restored.notes[0].body)).not.toContain(
      "attachment:" + id,
    );
  });
  it("asks for a mode before conversion and allows cancellation without importing", async () => {
    const names: string[][] = [];
    await expect(
      prepareImport([new File(["%PDF"], "test.pdf")], {
        choosePDFMode: async (n) => {
          names.push(n);
          return null;
        },
      }),
    ).rejects.toThrow("cancelled");
    expect(names).toEqual([["test.pdf"]]);
  });
  it("only publishes PDF modules when their attachment is explicitly selected", () => {
    const id = uid(),
      body = pdfModule("attachment:" + id);
    expect(publicMarkdown(body, new Set(), new Set())).not.toContain(id);
    expect(publicMarkdown(body, new Set(), new Set(), new Set([id]))).toBe(
      body,
    );
  });
  it("positions overlays correctly on cropped and rotated PDF pages", () => {
    const box = { x: 10, y: 20, width: 600, height: 800 };
    expect(pdfOverlayPlacement(box, 0)).toEqual({ ...box, angle: 0 });
    expect(pdfOverlayPlacement(box, 90)).toEqual({
      x: 610,
      y: 20,
      width: 800,
      height: 600,
      angle: 90,
    });
    expect(pdfOverlayPlacement(box, 180)).toEqual({
      x: 610,
      y: 820,
      width: 600,
      height: 800,
      angle: 180,
    });
    expect(pdfOverlayPlacement(box, 270)).toEqual({
      x: 10,
      y: 820,
      width: 800,
      height: 600,
      angle: 270,
    });
  });
  it("replaces a blank module without deleting concurrent note edits", () => {
    const empty = pdfModule(""),
      block = studyCodeBlocks(empty)[0],
      body = "Before\n" + empty + "\nAfter";
    const result = placeAttachment(
      "Added\n" + body,
      { body, position: 7, replaceBlockId: block.id },
      pdfModule("attachment:" + uid()),
    );
    expect(result.body).toContain("Added\nBefore");
    expect(result.body).toContain("After");
    expect(studyCodeBlocks(result.body)).toHaveLength(1);
    expect(() =>
      placeAttachment(
        body.replace('"source":""', '"source":"changed"'),
        { body, position: 7, replaceBlockId: block.id },
        "replacement",
      ),
    ).toThrow("changed during import");
  });
});
