const fs = require("node:fs/promises");
const path = require("node:path");
const sharp = require("sharp");
(async () => {
  const dir = path.resolve(__dirname, "../build"),
    svg = await fs.readFile(path.join(dir, "icon.svg"));
  await sharp(svg).resize(512, 512).png().toFile(path.join(dir, "icon.png"));
  const sizes = [16, 24, 32, 48, 64, 128, 256],
    images = await Promise.all(
      sizes.map((size) => sharp(svg).resize(size, size).png().toBuffer()),
    );
  const header = Buffer.alloc(6 + 16 * sizes.length);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(sizes.length, 4);
  let offset = header.length;
  images.forEach((bytes, i) => {
    const at = 6 + i * 16;
    header[at] = sizes[i] === 256 ? 0 : sizes[i];
    header[at + 1] = header[at];
    header.writeUInt16LE(1, at + 4);
    header.writeUInt16LE(32, at + 6);
    header.writeUInt32LE(bytes.length, at + 8);
    header.writeUInt32LE(offset, at + 12);
    offset += bytes.length;
  });
  await fs.writeFile(
    path.join(dir, "icon.ico"),
    Buffer.concat([header, ...images]),
  );
  console.log("Studyspace desktop icons generated.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
