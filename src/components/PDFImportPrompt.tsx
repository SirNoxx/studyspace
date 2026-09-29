"use client";
import { useEffect, useRef, useState } from "react";
import { Modal } from "./ui";
import type { PDFImportMode } from "@/lib/pdf-module";
type Request = {
  scope: string;
  handled: boolean;
  names: string[];
  resolve: (mode: PDFImportMode | null) => void;
};
export function choosePDFImport(
  names: string[],
  scope: string,
): Promise<PDFImportMode | null> {
  return new Promise((resolve) => {
    const detail: Request = { names, scope, resolve, handled: false };
    window.dispatchEvent(new CustomEvent("studyspace:pdf-import", { detail }));
    if (!detail.handled) resolve(null);
  });
}
export default function PDFImportPrompt({ scope }: { scope: string }) {
  const [request, setRequest] = useState<Request | null>(null);
  const pending = useRef<Request[]>([]);
  const finish = (mode: PDFImportMode | null) => {
    pending.current.shift()?.resolve(mode);
    setRequest(pending.current[0] ?? null);
  };
  useEffect(() => {
    const receive = (event: Event) => {
      const detail = (event as CustomEvent<Request>).detail;
      if (detail.scope !== scope || detail.handled) return;
      detail.handled = true;
      pending.current.push(detail);
      setRequest(pending.current[0]);
    };
    window.addEventListener("studyspace:pdf-import", receive);
    return () => {
      window.removeEventListener("studyspace:pdf-import", receive);
      pending.current.splice(0).forEach((r) => r.resolve(null));
    };
  }, [scope]);
  if (!request) return null;
  return (
    <Modal
      wide
      title="How would you like to import this PDF?"
      onClose={() => finish(null)}
    >
      <p className="pdf-import-filename">
        {request.names.length === 1
          ? request.names[0]
          : `${request.names.length} PDF files`}
      </p>
      <div className="pdf-import-choices">
        <button className="secondary" onClick={() => finish("module")}>
          <strong>PDF module — keep original styling</strong>
          <span>
            Preserve pages, fonts, images and layout. Read, annotate, save and
            print.
          </span>
        </button>
        <button className="secondary" onClick={() => finish("markdown")}>
          <strong>Convert to Markdown text</strong>
          <span>
            Extract editable text into a regular note. Page styling is not
            preserved; the original PDF is retained.
          </span>
        </button>
      </div>
      <button className="secondary" onClick={() => finish(null)}>
        Cancel
      </button>
    </Modal>
  );
}
