/** Read-only probe of the shipped opening distribution. No policy is changed. */
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { createServer } from "vite";

const output = process.argv[2];
if (!output) throw Error("Usage: node scripts/calibration/inspect-openings.mjs OUTPUT.json");
const server = await createServer({ server: { middlewareMode: true } });
try {
  const R = await server.ssrLoadModule("/src/core/rules.ts");
  const G = await server.ssrLoadModule("/src/core/goal-director.ts");
  const C = await server.ssrLoadModule("/src/core/composition-dealer.ts");
  const seeds = Array.from({ length: 128 }, (_, i) => Math.imul(i + 1, 0x9e3779b9) >>> 0);
  const policies = [];
  for (const policy of ["director-v2", "composition-v1"]) {
    const families = {}, shapes = {}, reasons = {}, rng = new Set();
    let witnessedAllClear = 0;
    for (const [index, seed] of seeds.entries()) {
      const deal = policy === "director-v2"
        ? G.goalDirectorDeal(Array(64).fill(0), seed)
        : C.compositionDeal(Array(64).fill(0), seed);
      const family = deal.tray.map(s => R.shapeById(s.shapeId).family).sort().join(",");
      const shape = deal.tray.map(s => s.shapeId).sort().join(",");
      families[family] = (families[family] ?? 0) + 1;
      shapes[shape] = (shapes[shape] ?? 0) + 1;
      const reason = deal.composition?.reason ?? deal.diagnostic.source;
      reasons[reason] = (reasons[reason] ?? 0) + 1;
      rng.add(deal.rngState);
      let state = R.newGame(seed, `opening-probe-${policy}-${index}`, policy);
      assert.deepEqual(state.tray, deal.tray);
      let cleared = false;
      for (const move of deal.witness) {
        const result = R.applyMove(state, move, state.revision);
        assert(result, "Opening witness must be playable");
        cleared ||= result.allClear;
        state = result.state;
      }
      assert.equal(deal.witness.length, 3);
      witnessedAllClear += Number(cleared);
    }
    policies.push({ policy, openings: seeds.length, distinctInputSeeds: new Set(seeds).size,
      distinctOutputRngStates: rng.size, familyBags: families, orientedShapeBags: shapes,
      reasons, openingsWithAllClearOnExistingWitness: witnessedAllClear });
  }
  const result = { source: "Shipped 0.64 policies; fixed 128-seed opening probe, not 128 full games", policies };
  await fs.writeFile(output, JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result, null, 2));
} finally { await server.close(); }
