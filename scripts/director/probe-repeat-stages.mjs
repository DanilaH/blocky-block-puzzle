// Observe production flow-v4 without changing its decisions or shipping hooks.
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import ts from "typescript";
import { createServer } from "vite";
const out = process.argv[2] || "docs/qa/preplay46/repeat-stages.json";
let source = await fs.readFile("src/core/flow-dealer.ts", "utf8");
const inject = (needle, replacement) => {
  assert.equal(
    source.split(needle).length,
    2,
    `Instrumentation anchor: ${needle}`,
  );
  source = source.replace(needle, replacement);
};
source = source
  .replaceAll('from "./rhythm"', 'from "/src/core/rhythm"')
  .replaceAll('from "./rules"', 'from "/src/core/rules"');
source = "export let audit: any;\n" + source;
inject(
  "  let rng = seed;",
  "  audit = {depths:[], blocked:0};\n  let rng = seed;",
);
inject(
  "  const order = options()",
  "  Object.assign(audit,{support,maxSize,generous,occupiedAtDeal});\n  const order = options()",
);
inject(
  "    const candidates: Node[] = [];",
  "    const rawBags = new Set<string>();\n    const candidates: Node[] = [];",
);
inject(
  "          const repeated =",
  '          const bag = [...parent.path,op].map(p=>SHAPES[p.shape]!.family).sort().join(",");\n          rawBags.add(bag);\n          const repeated =',
);
inject(
  "            continue;\n          const value =",
  "            {audit.blocked++; continue;}\n          const value =",
);
inject(
  "    candidates.push(...seen.values());",
  '    candidates.push(...seen.values());\n    audit.depths.push({rawBags:rawBags.size,states:candidates.length,bags:new Set(candidates.map(n=>n.path.map(p=>SHAPES[p.shape]!.family).sort().join(","))).size});',
);
inject(
  "  const shuffle = [0, 1, 2]",
  '  audit.beam = beam.map(n=>({bag:n.path.map(p=>SHAPES[p.shape]!.family).sort().join(","),value:n.value,lines:n.lines,clears:n.clears}));\n  audit.finalists = finalists.map(n=>n.path.map(p=>SHAPES[p.shape]!.family).sort().join(","));\n  audit.selectable = audit.finalists.slice(0,generous?3:8);\n  const shuffle = [0, 1, 2]',
);
const server = await createServer({
  server: { middlewareMode: true },
  plugins: [
    {
      name: "flow-observer",
      resolveId(id) {
        if (id === "virtual:flow-probe") return "\0flow-probe";
      },
      load(id) {
        if (id === "\0flow-probe")
          return ts.transpileModule(source, {
            compilerOptions: {
              target: ts.ScriptTarget.ES2022,
              module: ts.ModuleKind.ESNext,
            },
          }).outputText;
      },
    },
  ],
});
try {
  const R = await server.ssrLoadModule("/src/core/rules.ts"),
    H = await server.ssrLoadModule("/src/core/rhythm.ts"),
    P = await server.ssrLoadModule("/scripts/difficulty/players.ts"),
    F = await server.ssrLoadModule("virtual:flow-probe");
  const bag = (t) =>
    t
      .map((s) => R.shapeById(s.shapeId).family)
      .sort()
      .join(",");
  const rows = [],
    runs = [];
  for (const style of ["clear", "plausible", "three"])
    for (const seed of [191001, 191002, 191003, 191004]) {
      let g = R.newGame(seed, `repeat-probe-${seed}`, "flow-v4"),
        last = bag(g.tray),
        streak = 1,
        maxStreak = 1;
      while (g.status === "playing" && g.moves < 120) {
        const move = P.choose(
          g.board,
          g.tray,
          style,
          R.random(seed + g.moves).value,
        );
        if (!move) break;
        const result = R.applyMove(g, move, g.revision);
        assert.ok(result);
        if (g.tray.filter((s) => !s.used).length === 1) {
          const rhythm = H.advanceRhythmV4(
            g.rhythm,
            result.state.board,
            result.lines,
            result.allClear,
            R.random(g.rngState).value,
          );
          const d = F.flowDeal(
            result.state.board,
            g.rngState,
            g.moves + 1,
            bag(g.tray),
            rhythm,
          );
          if (d) {
            assert.deepEqual(d.tray, result.state.tray);
            assert.equal(d.rngState, result.state.rngState);
          }
          const chosen = bag(result.state.tray),
            history = rhythm.recentBags ?? [];
          streak = chosen === last ? streak + 1 : 1;
          maxStreak = Math.max(maxStreak, streak);
          last = chosen;
          rows.push({
            style,
            seed,
            move: g.moves + 1,
            chosen,
            repeat: history.includes(chosen),
            consecutive: streak,
            history: [...history],
            fallback: !d,
            ...structuredClone(F.audit),
          });
        }
        g = result.state;
      }
      runs.push({
        style,
        seed,
        moves: g.moves,
        score: g.score,
        status: g.status,
        maxStreak,
      });
    }
  const summary = ["clear", "plausible", "three"].map((style) => {
    const a = rows.filter((r) => r.style === style),
      n = a.length;
    const mean = (fn) => a.reduce((s, r) => s + fn(r), 0) / n;
    return {
      style,
      deals: n,
      repeats: a.filter((r) => r.repeat).length,
      fallbacks: a.filter((r) => r.fallback).length,
      oneSelectableBag: a.filter((r) => new Set(r.selectable ?? []).size === 1)
        .length,
      rawFinalBagsMean: mean((r) => r.depths[2]?.rawBags ?? 0),
      dedupFinalBagsMean: mean((r) => r.depths[2]?.bags ?? 0),
      beamBagsMean: mean((r) => new Set(r.beam?.map((n) => n.bag)).size),
      selectableBagsMean: mean((r) => new Set(r.selectable).size),
      maxConsecutive: Math.max(...a.map((r) => r.consecutive)),
      topBags: Object.entries(
        a.reduce((m, r) => ((m[r.chosen] = (m[r.chosen] ?? 0) + 1), m), {}),
      )
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6),
    };
  });
  await fs.mkdir(out.slice(0, out.lastIndexOf("/")), { recursive: true });
  await fs.writeFile(
    out,
    JSON.stringify(
      {
        note: "Instrumented source; each non-null output tray and RNG checked against production applyMove. Counts are search-stage family diversity, not uniform probabilities or human balance.",
        runs,
        summary,
        rows,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify(summary, null, 2));
} finally {
  await server.close();
}
