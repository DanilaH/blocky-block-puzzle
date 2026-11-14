/** Validate observed revive effects and saved witnesses without modifying records. */
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { createServer } from "vite";
const [output, ...inputs] = process.argv.slice(2);
if (!output || !inputs.length) throw Error("Usage: node scripts/calibration/check-revive-records.mjs OUTPUT.json INPUT.json ...");
const server = await createServer({ server: { middlewareMode: true } });
try {
  const R = await server.ssrLoadModule("/src/core/rules.ts");
  const V = await server.ssrLoadModule("/scripts/calibration/replay.ts");
  const observations = [];
  for (const input of inputs) {
    const record = JSON.parse(await fs.readFile(input, "utf8"));
    V.replayRecord(record);
    for (let i = 0; i < record.events.length; i++) {
      const event = record.events[i];
      if (event.kind !== "checkpoint" || event.reason !== "revive") continue;
      const previous = record.events.slice(0, i).reverse().find(e => e.kind === "checkpoint" && e.state.gameId === event.state.gameId && e.state.status === "over").state;
      const selection = previous.reviveOffer.selection;
      const expected = [...previous.board];
      for (let y = selection.y; y < selection.y + 3; y++) for (let x = selection.x; x < selection.x + 3; x++) expected[y * 8 + x] = 0;
      assert.deepEqual(event.state.board, expected);
      assert.deepEqual(event.state.tray, previous.tray);
      assert.equal(event.state.score, previous.score);
      let witnessState = event.state;
      for (const move of selection.witness) {
        const result = R.applyMove(witnessState, move, witnessState.revision);
        assert(result, "Saved old-tray continuation must be playable");
        witnessState = result.state;
      }
      assert.equal(witnessState.rhythm.recoveryDeals, 2);
      let playerContinued = false;
      for (const following of record.events.slice(i + 1)) {
        if (following.kind === "checkpoint" && following.state.gameId !== event.state.gameId) break;
        if (following.kind === "move") { playerContinued = true; break; }
      }
      observations.push({ atMove: event.state.moves, selection: selection.result,
        oldTrayRemaining: previous.tray.filter(s => !s.used).length,
        savedWitnessMoves: selection.witness.length, unchangedTrayAndScore: true,
        boardMatchesSaved3x3: true, oldTrayWitnessCompletes: true,
        playerContinued });
    }
  }
  await fs.writeFile(output, JSON.stringify({ observations }, null, 2) + "\n");
  console.log(JSON.stringify({ observedRevivesChecked: observations.length }));
} finally { await server.close(); }
