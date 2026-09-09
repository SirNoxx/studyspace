"use client";
import { useEffect, useState } from "react";
import type { Attachment } from "@/lib/model";
import { localDB } from "@/lib/store";
export default function AttachmentMedia({
  asset,
  demo,
  image,
  children,
  onOpen,
  publicBase,
}: {
  asset: Attachment;
  demo: boolean;
  image?: boolean;
  children?: React.ReactNode;
  onOpen?: (id: string) => void;
  publicBase?: string;
}) {
  const [url, setUrl] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    let disposed = false,
      objectUrl = "";
    const controller = new AbortController();
    setUrl("");
    setError("");
    (async () => {
      try {
        let blob: Blob;
        if (demo) {
          blob = await (await localDB()).get("assets", asset.id);
          if (!blob) throw new Error("Attachment unavailable on this device.");
        } else {
          const r = await fetch(
            (publicBase ?? "/api/attachments/") + asset.id,
            { signal: controller.signal },
          );
          if (!r.ok)
            throw new Error(
              "Attachment unavailable. Restore it from Trash or retry.",
            );
          blob = await r.blob();
        }
        if (disposed) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      } catch (e) {
        if (!disposed) setError((e as Error).message);
      }
    })();
    return () => {
      disposed = true;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [asset.id, demo, publicBase]);
  if (error)
    return (
      <span className="image-placeholder">
        {asset.filename}: {error}
      </span>
    );
  if (!url) return <span className="muted">Loading {asset.filename}…</span>;
  if (image && /^image\/(png|jpeg|webp|gif)$/.test(asset.mime))
    return (
      <img
        src={url}
        alt={typeof children === "string" ? children : asset.filename}
        loading="lazy"
      />
    );
  if (onOpen && asset.mime === "application/pdf")
    return (
      <button className="internal-link" onClick={() => onOpen(asset.id)}>
        {children ?? asset.filename}
      </button>
    );
  return (
    <a href={url} download={asset.filename.split("/").at(-1)}>
      {children ?? asset.filename}
    </a>
  );
}
export { findAttachment } from "@/lib/attachments";
