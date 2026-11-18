import { createServer } from "vite";
import fs from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
const server = await createServer({ server: { middlewareMode: true } });
try {
  const R = await server.ssrLoadModule("/src/core/rules.ts");
  const P = await server.ssrLoadModule("/scripts/difficulty/players.ts");
  const B = await server.ssrLoadModule("/scripts/director/resilience.ts");
  const G = await server.ssrLoadModule("/scripts/director/geometry.ts");
  const modes = ["baseline", "diversity", "recovery", "reward", "challenge"];
  const key = (t) =>
    t
      .map((s) => s.shapeId)
      .sort()
      .join(",");
  const overlap = (t, h) =>
    h.length
      ? h.reduce((sum, old) => {
          const ids = old.map((s) => s.shapeId);
          let n = 0;
          for (const s of t) {
            const i = ids.indexOf(s.shapeId);
            if (i >= 0) {
              n++;
              ids.splice(i, 1);
            }
          }
          return sum + n / 3;
        }, 0) / h.length
      : 0;
  const results = [];
  const corpus = [];
  for (const [split, offset] of [
    ["development", 71000],
    ["confirmation", 81000],
  ]) {
    for (let si = 1; si <= 4; si++)
      for (const collector of ["clear", "space", "three", "plausible"]) {
        const seed = offset + si;
        let g = R.newGame(seed, "actuator-" + seed, "flow-v4"),
          history = [],
          targets = [12, 30, 60];
        while (g.status === "playing" && g.moves <= 63 && targets.length) {
          if (g.tray.every((s) => !s.used)) {
            if (g.moves >= targets[0]) {
              targets.shift();
              const id = `${split}-${seed}-${collector}-${g.moves}`;
              corpus.push({
                id,
                split,
                seed,
                collector,
                state: structuredClone(g),
                history: structuredClone(history),
              });
            }
            history = [...history, structuredClone(g.tray)].slice(-4);
          }
          const move = P.choose(
            g.board,
            g.tray,
            collector,
            R.random(seed + g.moves).value,
          );
          if (!move) break;
          g = R.applyMove(g, move, g.revision).state;
        }
      }
  }
  for (const p of corpus) {
    const before = JSON.stringify(p);
    const start = performance.now();
    let rng = (p.seed ^ Math.imul(p.state.moves + 1, 2654435761)) >>> 0 || 1;
    const next = () => {
      const r = R.random(rng);
      rng = r.state;
      return r.value;
    };
    const pool = [{ tray: p.state.tray, source: "baseline" }];
    for (let i = 0; i < 3; i++)
      pool.push({
        tray: R.deal(
          p.state.board,
          Math.floor(next() * 4294967295) || 1,
          "flow-v4",
          p.state.moves,
          "",
          p.state.rhythm,
        ).tray,
        source: "flow",
      });
    const total = R.SHAPES.reduce((n, s) => n + s.weight, 0);
    for (let i = 0; i < 4; i++)
      pool.push({
        source: "weighted",
        tray: Array.from({ length: 3 }, () => {
          let v = next() * total;
          let shape = R.SHAPES.at(-1);
          for (const s of R.SHAPES) {
            v -= s.weight;
            if (v < 0) {
              shape = s;
              break;
            }
          }
          return { shapeId: shape.id, used: false, color: 1 };
        }),
      });
    const unique = pool.filter(
      (x, i) => pool.findIndex((y) => key(x.tray) === key(y.tray)) === i,
    );
    for (const c of unique) {
      c.witness = R.proveTray(p.state.board, c.tray, 20000);
      c.models = ["lines", "space"].map((t) =>
        B.resilience(p.state.board, c.tray, t),
      );
      c.known = c.models.every((m) => m.complete);
      c.success = c.known ? Math.min(...c.models.map((m) => m.success)) : null;
      c.lines = c.known
        ? c.models.reduce((n, m) => n + m.expectedLines, 0) / 2
        : null;
      c.occupied = c.known
        ? c.models.reduce((n, m) => n + m.expectedOccupied, 0) / 2
        : null;
      c.repeat = overlap(c.tray, p.history);
      if (c.witness) {
        let b = p.state.board;
        const used = new Set();
        for (const m of c.witness) {
          if (
            used.has(m.slot) ||
            !R.fits(b, R.shapeById(c.tray[m.slot].shapeId), m.x, m.y)
          )
            throw Error("invalid proof");
          used.add(m.slot);
          b = R.place(b, R.shapeById(c.tray[m.slot].shapeId), m.x, m.y).board;
        }
        if (used.size !== 3) throw Error("incomplete proof");
      }
    }
    const base = unique[0];
    const selections = { baseline: base };
    for (const mode of modes.slice(1)) {
      let eligible = unique.filter(
        (c) =>
          c.witness &&
          c.known &&
          base.known &&
          c.success >= (mode === "challenge" ? 0.65 : base.success),
      );
      const value = (c) =>
        mode === "diversity"
          ? -c.repeat
          : mode === "recovery"
            ? -c.occupied
            : mode === "reward"
              ? c.lines
              : -c.success;
      eligible.sort((a, b) => value(b) - value(a));
      selections[mode] =
        eligible.length && value(eligible[0]) > value(base) + 1e-9
          ? eligible[0]
          : base;
    }
    const selectMs = performance.now() - start;
    const outcomes = [];
    for (const mode of modes) {
      const c = selections[mode];
      for (const style of P.styles) {
        const o = P.playTray(
          p.state.board,
          c.tray,
          style,
          p.seed + p.state.moves,
        );
        let board = p.state.board;
        for (const m of o.moves) {
          if (!R.fits(board, R.shapeById(c.tray[m.slot].shapeId), m.x, m.y))
            throw Error("illegal evaluation");
          board = R.place(
            board,
            R.shapeById(c.tray[m.slot].shapeId),
            m.x,
            m.y,
          ).board;
        }
        if (board.filter(Boolean).length !== o.endOccupied)
          throw Error("replay mismatch");
        outcomes.push({
          mode,
          style,
          changed: c !== base,
          source: c.source,
          repeat: c.repeat,
          ...o,
          geometry: G.geometry(board),
        });
      }
    }
    if (before !== JSON.stringify(p)) throw Error("mutated input");
    results.push({
      id: p.id,
      split: p.split,
      collector: p.collector,
      occupied: p.state.board.filter(Boolean).length,
      selectMs,
      pool: unique,
      outcomes,
    });
    if (results.length % 12 === 0)
      console.log(`evaluated ${results.length}/${corpus.length}`);
  }
  const summaries = [];
  for (const split of ["development", "confirmation"])
    for (const style of ["all", ...P.styles])
      for (const mode of modes) {
        const pairs = results
          .filter((r) => r.split === split)
          .flatMap((r) =>
            r.outcomes
              .filter(
                (o) =>
                  o.mode === mode && (style === "all" || o.style === style),
              )
              .map((o) => ({
                o,
                b: r.outcomes.find(
                  (b) => b.mode === "baseline" && b.style === o.style,
                ),
              })),
          );
        const mean = (f) => pairs.reduce((n, p) => n + f(p), 0) / pairs.length;
        const successful = pairs.filter((p) => p.o.success && p.b.success);
        const sum = (f) => pairs.reduce((n, p) => n + f(p), 0);
        const delta = mean((p) => Number(p.o.success) - Number(p.b.success));
        const linesRatio = sum((p) => p.o.lines) / sum((p) => p.b.lines);
        const repeatRatio = mean((p) => p.o.repeat) / mean((p) => p.b.repeat);
        const occupiedDelta = successful.length
          ? successful.reduce(
              (n, p) => n + p.o.endOccupied - p.b.endOccupied,
              0,
            ) / successful.length
          : null;
        const changed = mean((p) => Number(p.o.changed));
        const pass =
          changed >= 0.2 &&
          delta >= (mode === "challenge" ? -0.1 : -0.02) &&
          (mode === "diversity"
            ? repeatRatio <= 0.8 && linesRatio >= 0.9
            : mode === "recovery"
              ? occupiedDelta !== null &&
                occupiedDelta <= -2 &&
                linesRatio >= 0.9
              : mode === "reward"
                ? linesRatio >= 1.1 &&
                  sum((p) => p.o.allClears) >= sum((p) => p.b.allClears)
                : mode === "challenge"
                  ? delta <= -0.02 && linesRatio >= 0.9
                  : false);
        summaries.push({
          split,
          style,
          mode,
          n: pairs.length,
          changed,
          success: mean((p) => Number(p.o.success)),
          successDelta: delta,
          linesRatio,
          repeatRatio,
          occupiedDelta,
          successfulPairs: successful.length,
          allClears: sum((p) => p.o.allClears),
          baseAllClears: sum((p) => p.b.allClears),
          pass,
        });
      }
  const times = results.map((r) => r.selectMs).sort((a, b) => a - b);
  const summary = {
    positions: corpus.length,
    replays: results.length * modes.length * P.styles.length,
    unknownCandidates: results.reduce(
      (n, r) => n + r.pool.filter((c) => !c.known).length,
      0,
    ),
    unprovenCandidates: results.reduce(
      (n, r) => n + r.pool.filter((c) => !c.witness).length,
      0,
    ),
    selectMs: {
      p50: times[Math.floor(times.length * 0.5)],
      p95: times[Math.floor(times.length * 0.95)],
      max: times.at(-1),
    },
    accepted: modes
      .slice(1)
      .filter((m) =>
        summaries.filter((s) => s.mode === m).every((s) => s.pass),
      ),
    summaries,
  };
  const dir = "docs/qa/director-actuators";
  const hash = createHash("sha256")
    .update(await fs.readFile("scripts/director/actuators.mjs"))
    .digest("hex");
  await fs.writeFile(
    `${dir}/evidence.json.gz`,
    gzipSync(JSON.stringify({ scriptSha256: hash, corpus, results })),
  );
  await fs.writeFile(
    `${dir}/summary.json`,
    JSON.stringify(summary, null, 2) + "\n",
  );
  console.log(
    JSON.stringify(
      {
        ...summary,
        summaries: summary.summaries.filter((s) => s.style === "all"),
      },
      null,
      2,
    ),
  );
} finally {
  await server.close();
}
