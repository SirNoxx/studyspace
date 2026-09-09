import { WidgetType, type EditorView } from "@codemirror/view";
import type { Attachment } from "@/lib/model";
import { localDB } from "@/lib/store";

/** Displays the saved attachment without changing the underlying Markdown. */
export class EditorImage extends WidgetType {
  private dispose?: () => void;
  constructor(
    private asset: Attachment,
    private demo: boolean,
  ) {
    super();
  }
  eq(other: EditorImage) {
    return this.asset.id === other.asset.id && this.demo === other.demo;
  }
  toDOM(view: EditorView) {
    const wrapper = document.createElement("span");
    wrapper.className = "editor-image";
    wrapper.contentEditable = "false";
    wrapper.textContent = `Loading ${this.asset.filename}…`;
    const controller = new AbortController();
    let disposed = false;
    let url = "";
    this.dispose = () => {
      disposed = true;
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
    void (async () => {
      try {
        let blob: Blob;
        if (this.demo) {
          blob = await (await localDB()).get("assets", this.asset.id);
          if (!blob) throw new Error("Image unavailable on this device.");
        } else {
          const response = await fetch(`/api/attachments/${this.asset.id}`, {
            signal: controller.signal,
          });
          if (!response.ok)
            throw new Error(
              "Image unavailable. Restore it from Trash or retry.",
            );
          blob = await response.blob();
        }
        if (disposed) return;
        url = URL.createObjectURL(blob);
        const image = document.createElement("img");
        image.alt = this.asset.filename;
        image.onload = () => {
          if (!disposed) view.requestMeasure();
        };
        image.onerror = () => {
          if (!disposed) {
            wrapper.textContent = `${this.asset.filename}: Image unavailable.`;
            view.requestMeasure();
          }
        };
        image.src = url;
        wrapper.replaceChildren(image);
        view.requestMeasure();
      } catch (error) {
        if (!disposed) {
          wrapper.textContent = `${this.asset.filename}: ${(error as Error).message}`;
          view.requestMeasure();
        }
      }
    })();
    return wrapper;
  }
  destroy() {
    this.dispose?.();
  }
}
