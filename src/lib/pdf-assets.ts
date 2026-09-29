import type { Attachment } from "./model";
export interface PDFAssetContext {
  attachments: Attachment[];
  demo: boolean;
  fromPath?: string;
  publicBase?: string;
  onImport?: (file: File, blockId: string) => void;
}
