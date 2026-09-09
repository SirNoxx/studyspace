import { it, expect } from "vitest";
import { unzipSync, strFromU8 } from "fflate";
import { emptyWorkspace, uid, now } from "../src/lib/model";
import { createNote, prepareSnapshot } from "../src/lib/domain";
import { sha256 } from "../src/lib/transfer";
import { publicationExport } from "../src/lib/publication-export";
it("streams approved file bytes and portable links without private storage paths", async () => {
  const w = emptyWorkspace(),
    n = createNote(w),
    bytes = new TextEncoder().encode("PUBLIC TEST BYTES"),
    a = {
      id: uid(),
      filename: "test.pdf",
      key: "PRIVATE-OWNER/secret",
      hash: await sha256(bytes),
      size: bytes.length,
      mime: "application/pdf",
      createdAt: now(),
    };
  w.attachments.push(a);
  n.body = "[Evidence](attachment:" + a.id + ")";
  const snapshot = prepareSnapshot(
    w,
    [n.id],
    { allowDownload: true },
    { attachmentIds: [a.id] },
  );
  const zip = unzipSync(
    new Uint8Array(
      await new Response(
        publicationExport(snapshot, async () => bytes),
      ).arrayBuffer(),
    ),
  );
  const assetPath = Object.keys(zip).find((p) => p.startsWith("assets/"))!;
  expect(zip[assetPath]).toEqual(bytes);
  expect(
    strFromU8(zip[Object.keys(zip).find((p) => /^001-/.test(p))!]),
  ).toContain(assetPath);
  expect(strFromU8(zip["publication.json"])).not.toContain("PRIVATE-OWNER");
  await expect(
    new Response(
      publicationExport(snapshot, async () => new Uint8Array([1])),
    ).arrayBuffer(),
  ).rejects.toThrow("checksum");
});
