"use client";
import { useRef, useState } from "react";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { Copy, Printer, Trash2, Info, MoreHorizontal } from "lucide-react";
import type { Attachment } from "@/lib/model";
import { Modal } from "./ui";

export default function Picture({
  src,
  alt,
  asset,
  onDelete,
  onLoad,
  bytes,
}: {
  src: string;
  alt: string;
  asset?: Attachment;
  onDelete?: () => void;
  onLoad?: () => void;
  bytes?: Blob;
}) {
  const image = useRef<HTMLImageElement>(null);
  const [open, setOpen] = useState(false);
  const [properties, setProperties] = useState(false);
  const [message, setMessage] = useState("");
  const filename =
    asset?.filename ??
    (() => {
      try {
        return decodeURIComponent(
          new URL(src, "https://studyspace.invalid").pathname
            .split("/")
            .at(-1) || "Linked image",
        );
      } catch {
        return "Linked image";
      }
    })();
  const copy = async () => {
    try {
      if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined")
        throw new Error(
          "Image copying is unavailable here. Use the browser’s image menu or save the picture first.",
        );
      // Clipboard implementations accept PNG; decode other supported image formats locally.
      const png = (async () => {
        const blob =
          bytes ??
          (await (async () => {
            const response = await fetch(src);
            if (!response.ok)
              throw new Error("Could not load this picture for copying.");
            return response.blob();
          })());
        if (blob.type === "image/png") return blob;
        const bitmap = await createImageBitmap(blob);
        try {
          const canvas = document.createElement("canvas");
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("Image copying is unavailable.");
          ctx.drawImage(bitmap, 0, 0);
          return await new Promise<Blob>((resolve, reject) =>
            canvas.toBlob(
              (value) =>
                value
                  ? resolve(value)
                  : reject(new Error("Could not copy this picture.")),
              "image/png",
            ),
          );
        } finally {
          bitmap.close();
        }
      })();
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": png }),
      ]);
      setMessage("Picture copied.");
    } catch (error) {
      setMessage(
        `${(error as Error).message}${bytes ? "" : " Linked images may restrict copying."}`,
      );
    }
  };
  const print = () => {
    const frame = document.createElement("iframe");
    frame.title = "Print picture";
    Object.assign(frame.style, {
      position: "fixed",
      width: "1px",
      height: "1px",
      left: "-10000px",
      border: "0",
    });
    document.body.appendChild(frame);
    const doc = frame.contentDocument,
      win = frame.contentWindow;
    if (!doc || !win) {
      frame.remove();
      setMessage("Could not open picture printing.");
      return;
    }
    doc.title = filename;
    const style = doc.createElement("style");
    style.textContent =
      "@page { margin: 12mm; } body { margin: 0; } img { display: block; max-width: 100%; max-height: 95vh; object-fit: contain; margin: auto; }";
    doc.head.append(style);
    const printed = doc.createElement("img");
    printed.alt = alt;
    printed.referrerPolicy = "no-referrer";
    const timeout = window.setTimeout(() => frame.remove(), 300000);
    const cleanup = () => {
      clearTimeout(timeout);
      frame.remove();
    };
    win.addEventListener("afterprint", cleanup, { once: true });
    printed.onload = () => {
      win.focus();
      win.print();
    };
    printed.onerror = () => {
      cleanup();
      setMessage("Could not load this picture for printing.");
    };
    doc.body.append(printed);
    printed.src = src;
  };
  return (
    <span
      className="note-picture"
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setOpen(true);
      }}
    >
      <img
        ref={image}
        src={src}
        alt={alt}
        loading="lazy"
        referrerPolicy="no-referrer"
        onLoad={onLoad}
      />
      <Dropdown.Root
        open={open}
        onOpenChange={(value) => {
          setOpen(value);
        }}
        modal={false}
      >
        <Dropdown.Trigger asChild>
          <button
            className="picture-options"
            aria-label={`Picture options: ${filename}`}
            title="Picture options"
          >
            <MoreHorizontal size={18} />
          </button>
        </Dropdown.Trigger>
        <Dropdown.Portal>
          <Dropdown.Content
            className="context-menu"
            sideOffset={4}
            align="start"
            onClick={(e) => e.stopPropagation()}
          >
            <Dropdown.Item className="menu-item" onSelect={() => void copy()}>
              <Copy size={15} />
              Copy picture
            </Dropdown.Item>
            <Dropdown.Item className="menu-item" onSelect={print}>
              <Printer size={15} />
              Print picture
            </Dropdown.Item>
            <Dropdown.Item
              className="menu-item"
              onSelect={() => setProperties(true)}
            >
              <Info size={15} />
              Picture properties
            </Dropdown.Item>
            {onDelete && (
              <>
                <Dropdown.Separator className="menu-separator" />
                <Dropdown.Item className="menu-item danger" onSelect={onDelete}>
                  <Trash2 size={15} />
                  Delete picture
                </Dropdown.Item>
              </>
            )}
          </Dropdown.Content>
        </Dropdown.Portal>
      </Dropdown.Root>
      {message && (
        <span className="picture-status" role="status">
          {message}
          <button
            aria-label="Dismiss picture message"
            onClick={() => setMessage("")}
          >
            ×
          </button>
        </span>
      )}
      {properties && (
        <Modal
          title="Picture properties"
          description="Details about this picture attachment."
          onClose={() => setProperties(false)}
        >
          <dl className="picture-properties">
            <dt>File name</dt>
            <dd>{filename}</dd>
            <dt>Attachment type</dt>
            <dd>
              {asset
                ? `Image · ${asset.mime}`
                : "Linked image (file type unavailable)"}
            </dd>
            <dt>Added</dt>
            <dd>
              {asset?.createdAt
                ? new Date(asset.createdAt).toLocaleString()
                : "Not recorded for linked images"}
            </dd>
            {asset && (
              <>
                <dt>Size</dt>
                <dd>{asset.size.toLocaleString()} bytes</dd>
              </>
            )}
            <dt>Dimensions</dt>
            <dd>
              {image.current?.naturalWidth || "—"} ×{" "}
              {image.current?.naturalHeight || "—"} pixels
            </dd>
          </dl>
          {onDelete && (
            <p className="muted">
              Deleting removes this picture from this note. The attachment stays
              available for other notes.
            </p>
          )}
        </Modal>
      )}
    </span>
  );
}
