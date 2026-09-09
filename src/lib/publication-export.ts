import { Zip, ZipPassThrough, strToU8 } from "fflate";
import type { Attachment, Snapshot } from "./model";
import { sha256 } from "./transfer";

/** Pull-driven ZIP: only one permitted attachment is loaded at a time. */
export function publicationExport(
  snapshot: Snapshot,
  load: (asset: Attachment) => Promise<Uint8Array>,
) {
  const paths = new Map(
    (snapshot.attachments ?? []).map((a) => [
      a.id,
      `assets/${a.id}-${a.filename
        .split(/[\\/]/)
        .at(-1)!
        .replace(/[^\p{L}\p{N}._-]/gu, "_")}`,
    ]),
  );
  const portable = (text: string) =>
    text.replace(
      /attachment:([\w-]+)/g,
      (original, id) => paths.get(id) ?? original,
    );
  async function* entries(): AsyncGenerator<[string, Uint8Array]> {
    for (const [i, note] of snapshot.notes.entries())
      yield [
        `${String(i + 1).padStart(3, "0")}-${note.title.replace(/[^\p{L}\p{N}._-]/gu, "_")}.md`,
        strToU8(portable(note.body)),
      ];
    yield [
      "Dictionary.md",
      strToU8(
        snapshot.definitions
          .map((d) => `## ${d.term}\n\n${portable(d.definition)}`)
          .join("\n\n"),
      ),
    ];
    yield [
      "Sources.md",
      strToU8(
        snapshot.sources
          .map((s) => `- [${s.title}](${portable(s.canonical)})`)
          .join("\n"),
      ),
    ];
    yield [
      "publication.json",
      strToU8(
        JSON.stringify(
          {
            ...snapshot,
            notes: snapshot.notes.map((n) => ({
              ...n,
              body: portable(n.body),
            })),
            attachments: (snapshot.attachments ?? []).map((a) => ({
              ...a,
              key: "",
              path: paths.get(a.id),
            })),
          },
          null,
          2,
        ),
      ),
    ];
    for (const asset of snapshot.attachments ?? []) {
      const bytes = await load(asset);
      if (bytes.length !== asset.size || (await sha256(bytes)) !== asset.hash)
        throw new Error("Published attachment checksum mismatch.");
      yield [paths.get(asset.id)!, bytes];
    }
  }
  async function* archive() {
    let chunks: Uint8Array[] = [];
    let failure: Error | null = null;
    const zip = new Zip((error, data) => {
      if (error) failure = error;
      else chunks.push(data);
    });
    try {
      for await (const [path, bytes] of entries()) {
        const entry = new ZipPassThrough(path);
        zip.add(entry);
        for (let offset = 0; offset < bytes.length; offset += 65536) {
          entry.push(bytes.subarray(offset, offset + 65536), false);
          if (failure) throw failure;
          for (const chunk of chunks) yield chunk;
          chunks = [];
        }
        entry.push(new Uint8Array(), true);
        for (const chunk of chunks) yield chunk;
        chunks = [];
      }
      zip.end();
      if (failure) throw failure;
      for (const chunk of chunks) yield chunk;
    } finally {
      zip.terminate();
    }
  }
  const iterator = archive();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await iterator.next();
        if (next.done) controller.close();
        else controller.enqueue(next.value);
      } catch (error) {
        controller.error(error);
      }
    },
    async cancel() {
      await iterator.return(undefined);
    },
  });
}
