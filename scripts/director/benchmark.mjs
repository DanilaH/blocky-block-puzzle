import { createServer } from "vite";
import fs from "node:fs/promises";
import { gzipSync } from "node:zlib";
const out = process.env.DIRECTOR_OUT || "docs/qa/director-package2",
  seeds = Number(process.env.DIRECTOR_SEEDS || 6),
  offset = Number(process.env.DIRECTOR_OFFSET || 0),
  limit = Number(process.env.DIRECTOR_LIMIT || 180);
const styles = (process.env.DIRECTOR_STYLES || "clear,three,plausible").split(
  ",",
);
const policy = process.env.DIRECTOR_POLICY || "qualified-v5";
const policyPath = {
  "qualified-v5": "policy.ts",
  "geometry-v4": "policy-v4.ts",
  "recipes-v3": "policy-v3.ts",
  "guarded-v2": "policy-v2.ts",
  "unguarded-v1": "policy-v1.ts",
}[policy];
if (!policyPath) throw Error("Unknown experiment policy");
const server = await createServer({ server: { middlewareMode: true } });
try {
  const R = await server.ssrLoadModule("/src/core/rules.ts"),
    M = await server.ssrLoadModule("/src/core/monetization.ts"),
    P = await server.ssrLoadModule("/scripts/difficulty/players.ts"),
    D = await server.ssrLoadModule("/scripts/director/" + policyPath);
  const games = [];
  for (const style of styles)
    for (let n = 1; n <= seeds; n++)
      for (const variant of ["baseline", "director"]) {
        const seed = (offset + n) * 1777;
        let g = {
            ...R.newGame(seed, "experiment", "flow-v4"),
            scoringVersion: "festival-v4",
            seriesBonusVersion: 1,
          },
          director = D.initialDirector(seed),
          difficulty = null;
        let linesInTray = 0,
          clearInTray = false,
          clears = 0,
          rewardMoves = 0,
          dry = 0,
          maxDry = 0,
          repeat = 0,
          lastBag = "",
          rng = seed ^ 1234;
        const timings = [],
          deals = [],
          opening = [];
        function replace() {
          const t = performance.now(),
            s = D.select(g, director);
          timings.push(performance.now() - t);
          director = s.director;
          difficulty = s.difficulty;
          g = { ...g, tray: s.tray };
          // Replace the just-recorded baseline bag with the actual experimental bag.
          if (g.rhythm?.recentBags?.length)
            g = {
              ...g,
              rhythm: {
                ...g.rhythm,
                recentBags: [
                  ...g.rhythm.recentBags.slice(0, -1),
                  g.tray
                    .map((s) => R.shapeById(s.shapeId).family)
                    .sort()
                    .join(","),
                ],
              },
            };
          deals.push({
            move: g.moves,
            ...s.diagnostic,
            skill: director.skill,
            evidence: director.evidence,
          });
        }
        if (variant === "director") replace();
        while (g.status === "playing" && g.moves < limit) {
          if (g.tray.every((s) => !s.used)) {
            const bag = g.tray
              .map((s) => R.shapeById(s.shapeId).family)
              .sort()
              .join(",");
            repeat += Number(bag === lastBag);
            lastBag = bag;
          }
          const r = R.random(rng);
          rng = r.state;
          const move = P.choose(g.board, g.tray, style, r.value);
          if (!move) throw Error("No move");
          const refill = g.tray.filter((s) => !s.used).length === 1;
          const v = R.applyMove(g, move, g.revision);
          g = v.state;
          if (g.moves <= 12) opening.push({ board: g.board, score: g.score });
          linesInTray += v.lines;
          clearInTray ||= v.allClear;
          clears += Number(v.allClear);
          rewardMoves += Number(v.lines > 0);
          dry = v.lines ? 0 : dry + 1;
          maxDry = Math.max(maxDry, dry);
          if (refill || g.status === "over") {
            director = D.observe(director, {
              success: g.status === "playing",
              lines: linesInTray,
              allClear: clearInTray,
              occupied: g.board.filter(Boolean).length,
              difficulty,
            });
            linesInTray = 0;
            clearInTray = false;
            if (refill && g.status === "playing" && variant === "director")
              replace();
          }
        }
        const end = g;
        let recovery = null;
        if (g.status === "over") {
          const plan = M.revivePlan(g);
          if (plan) {
            g = plan.game;
            director = D.revived(director);
            let survived = 0,
              reward = 0,
              recoveryLines = 0,
              recoveryClear = false;
            while (g.status === "playing" && survived < 18) {
              const r = R.random(rng);
              rng = r.state;
              const move = P.choose(g.board, g.tray, style, r.value);
              if (!move) throw Error("No revive move");
              const refill = g.tray.filter((s) => !s.used).length === 1;
              const v = R.applyMove(g, move, g.revision);
              g = v.state;
              survived++;
              reward += Number(v.lines > 0);
              recoveryLines += v.lines;
              recoveryClear ||= v.allClear;
              if (refill) {
                director = D.observe(director, {
                  success: g.status === "playing",
                  lines: recoveryLines,
                  allClear: recoveryClear,
                  occupied: g.board.filter(Boolean).length,
                  difficulty: 0,
                });
                recoveryLines = 0;
                recoveryClear = false;
                if (g.status === "playing" && variant === "director") replace();
              }
            }
            recovery = {
              moves: survived,
              rewardMoves: reward,
              dead: g.status === "over",
            };
          }
        }
        games.push({
          seed,
          style,
          variant,
          moves: end.moves,
          dead: end.status === "over",
          score: end.score,
          clears,
          rewardMoves,
          maxDry,
          repeat,
          opening,
          recovery,
          deals,
          timings,
        });
        console.log(
          JSON.stringify({
            style,
            seed,
            variant,
            moves: end.moves,
            dead: end.status === "over",
            clears,
          }),
        );
      }
  const summary = [];
  const median = (a) => {
    a = [...a].sort((a, b) => a - b);
    return (
      (a[Math.floor((a.length - 1) / 2)] + a[Math.floor(a.length / 2)]) / 2
    );
  };
  for (const style of styles)
    for (const variant of ["baseline", "director"]) {
      const a = games.filter((g) => g.style === style && g.variant === variant),
        moves = a.reduce((n, g) => n + g.moves, 0),
        times = a.flatMap((g) => g.timings).sort((a, b) => a - b);
      summary.push({
        style,
        variant,
        n: a.length,
        deaths: a.filter((g) => g.dead).length,
        medianMoves: median(a.map((g) => g.moves)),
        moves,
        clears: a.reduce((n, g) => n + g.clears, 0),
        rewardRate: a.reduce((n, g) => n + g.rewardMoves, 0) / moves,
        repeat: a.reduce((n, g) => n + g.repeat, 0),
        maxDry: Math.max(...a.map((g) => g.maxDry)),
        p95Selection: times[Math.floor(times.length * 0.95)] ?? null,
        recovery: a.filter((g) => g.recovery).map((g) => g.recovery),
      });
    }
  let openingMatches = 0;
  for (const g of games.filter((g) => g.variant === "baseline")) {
    const p = games.find(
      (p) =>
        p.style === g.style && p.seed === g.seed && p.variant === "director",
    );
    if (JSON.stringify(g.opening) === JSON.stringify(p.opening))
      openingMatches++;
  }
  const result = {
    policy,
    schema: 1,
    seeds,
    offset,
    limit,
    openingMatches,
    summary,
  };
  await fs.mkdir(out, { recursive: true });
  await fs.writeFile(
    out + "/summary.json",
    JSON.stringify(result, null, 2) + "\n",
  );
  await fs.writeFile(out + "/games.json.gz", gzipSync(JSON.stringify(games)));
  console.log(JSON.stringify(result));
} finally {
  await server.close();
}
