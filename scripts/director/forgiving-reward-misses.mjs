import fs from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { mixedRuntime } from "./mixed-runtime.mjs";
const { server, R, A } = await mixedRuntime();
const data = JSON.parse(
    gunzipSync(await fs.readFile("docs/qa/director-forgiving/results.json.gz")),
  ),
  examples = [];
const counts = {
  constructed: 0,
  matchedNext: 0,
  replannedNext: 0,
  lostNext: 0,
  superseded: 0,
  endedBeforeNext: 0,
  earnedWithinTwoTrays: 0,
};
try {
  for (const r of data.runs) {
    if (r.mode !== "candidate" || r.style !== "bounded") continue;
    for (let i = 0; i < r.deals.length; i++) {
      const d = r.deals[i];
      if (d.diagnostic.source !== "constructed-setup" || d.move >= r.moves)
        continue;
      counts.constructed++;
      const next = r.deals[i + 1];
      if (!next) {
        counts.endedBeforeNext++;
        continue;
      }
      const status = next.diagnostic.planStatus;
      if (status === "matched") counts.matchedNext++;
      else if (status === "replanned") counts.replannedNext++;
      else if (status === "lost") counts.lostNext++;
      else counts.superseded++;
      counts.earnedWithinTwoTrays += Number(
        r.events.slice(d.move, Math.min(d.move + 6, r.moves)).some((e) => e[1]),
      );
      if (status === "matched" || examples.length >= 8) continue;
      let board = A.toBoard(d.board);
      const actions = r.actions
        .slice(d.move, d.move + 3)
        .map(([slot, x, y]) => ({ slot, x, y }));
      for (const m of actions)
        board = R.place(
          board,
          R.shapeById(d.tray[m.slot].shapeId),
          m.x,
          m.y,
        ).board;
      examples.push({
        split: r.split,
        seed: r.seed,
        move: d.move,
        setup: {
          board: d.board,
          tray: d.tray,
          witness: d.witness,
          prepared: d.outputDirector.prepared,
        },
        actual: { actions, rows: A.toRows(board) },
        next: {
          requested: next.diagnostic.requested,
          actual: next.diagnostic.actual,
          planStatus: status,
          goalFound: next.diagnostic.goalFound,
          goalConstructed: next.diagnostic.goalConstructed,
        },
      });
    }
  }
  const result = { counts, examples };
  await fs.writeFile(
    "docs/qa/director-forgiving/reward-misses.json",
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(JSON.stringify(counts));
} finally {
  await server.close();
}
