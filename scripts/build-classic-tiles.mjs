import fs from "node:fs/promises";
import sharp from "sharp";
import {
  prepareImageAsset,
  validatePreparedImage,
} from "../tools/vendor/mini-games-kit/pipeline.ts";
import { inspectRuntimeImageBudget } from "../tools/vendor/mini-games-kit/runtime-images.ts";
const rows = [];
for (const [row, material] of ["plastic", "enamel", "chrome"].entries())
  for (let color = 1; color <= 6; color++) {
    const crop = await sharp("assets-src/classic-tiles/master.png")
      .extract({
        left: [24, 318, 612, 905, 1198, 1491][color - 1],
        top: [20, 308, 597][row],
        width: 278,
        height: 276,
      })
      .png()
      .toBuffer();
    const prepared = await prepareImageAsset(crop, {
      canvas: 128,
      padding: 2,
      webpQuality: 90,
      backgroundRemoval: "preserve",
    });
    const check = await validatePreparedImage(prepared.buffer, {
      canvas: 128,
      minTransparentPadding: 1,
    });
    if (check.errors.length) throw Error(check.errors.join(","));
    const file = `public/assets/classic-tiles/${material}-${color}.webp`;
    await fs.writeFile(file, prepared.buffer);
    rows.push({ id: `${material}-${color}`, file, category: material });
  }
const budget = await inspectRuntimeImageBudget(rows);
if (budget.encodedBytes > 100000 || budget.estimatedRgbaBytes > 1200000)
  throw Error("Classic tile budget exceeded");
await fs.writeFile(
  "assets-src/classic-tiles/budget.json",
  JSON.stringify(budget, null, 2) + "\n",
);
console.log(budget);
