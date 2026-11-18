// Exploratory ablation only: final board color is retained, its fade is omitted.
// This changes intermediate appearance and is not a shipping implementation.
import fs from "node:fs/promises";
import assert from "node:assert/strict";

let source = await fs.readFile(
  new URL("./probe-reward-057.mjs", import.meta.url),
  "utf8",
);
function replaceOnce(old, replacement) {
  assert.equal(
    source.split(old).length,
    2,
    `Missing/nonunique probe anchor: ${old}`,
  );
  source = source.replace(old, replacement);
}
replaceOnce(
  'const file = id.split("?")[0];',
  `const file = id.split("?")[0];
        if (file.endsWith("/src/game/BoardScene.ts")) {
          const anchor = 'board.style.transition = ';
          assert.equal(code.split(anchor).length, 2);
          return code.replace(anchor, anchor + 'new URLSearchParams(location.search).get("probe") === "no-board-css-fill" ? "none" : ');
        }`,
);
replaceOnce(
  'get("probe")); if (!layers && probeCondition)',
  'get("probe")) ?? BASELINE_LAYER; if (!layers && probeCondition)',
);
replaceOnce(
  "const selected = CLEAR_LAYERS.find((c) => c.id === condition);",
  "const selected = CLEAR_LAYERS.find((c) => c.id === condition) ?? CLEAR_LAYERS[0];",
);
for (const name of ["vite", "@playwright/test"])
  replaceOnce(
    `from "${name}"`,
    `from ${JSON.stringify(import.meta.resolve(name))}`,
  );
process.env.PROBE_CONDITIONS =
  "baseline,no-board-css-fill,no-board-css-fill,baseline";
process.env.PROBE_OUTPUT =
  process.env.BOARD_FILL_OUTPUT ||
  "docs/qa/rewards-057/board-fill-ablation.json";
await import(`data:text/javascript,${encodeURIComponent(source)}`);
