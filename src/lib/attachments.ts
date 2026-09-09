import type { Attachment } from "./model";
export function findAttachment(
  assets: Attachment[],
  target: string,
  fromPath = "",
) {
  let decoded = target;
  try {
    decoded = decodeURIComponent(target);
  } catch {
    return undefined;
  }
  if (decoded.startsWith("attachment:"))
    return assets.find((a) => a.id === decoded.slice(11) && !a.trashed);
  const normalize = (path: string) => {
    const out: string[] = [];
    for (const p of path.split("/")) {
      if (p === "..") out.pop();
      else if (p && p !== ".") out.push(p);
    }
    return out.join("/").normalize("NFC");
  };
  const path = normalize(
    fromPath.split("/").slice(0, -1).join("/") + "/" + decoded,
  );
  const exact = assets.filter(
    (a) =>
      !a.trashed &&
      (normalize(a.filename) === path ||
        normalize(a.filename) === normalize(decoded)),
  );
  if (exact.length === 1) return exact[0];
  const named = assets.filter(
    (a) => !a.trashed && a.filename.split("/").at(-1) === decoded,
  );
  return named.length === 1 ? named[0] : undefined;
}
