import sharp from "sharp";
import fs from "node:fs/promises";
await fs.mkdir("public/adventure", { recursive: true });
await sharp("assets-src/adventure/cove-master.png")
  .resize(960, 960)
  .webp({ quality: 82 })
  .toFile("public/adventure/cove.webp");
const meta = await sharp("assets-src/adventure/objects-master.png").metadata();
for (const [i, name] of ["gem", "key", "locked", "open"].entries()) {
  const width = Math.floor(meta.width / 2),
    height = Math.floor(meta.height / 2);
  await sharp("assets-src/adventure/objects-master.png")
    .extract({
      left: (i % 2) * width,
      top: Math.floor(i / 2) * height,
      width,
      height,
    })
    .resize(128, 128, { fit: "contain", background: "#00000000" })
    .webp({ quality: 90, alphaQuality: 100 })
    .toFile(`public/adventure/${name}.webp`);
}
