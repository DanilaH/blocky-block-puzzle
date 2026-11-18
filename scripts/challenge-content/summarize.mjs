import fs from "node:fs/promises";
import assert from "node:assert/strict";
const input = process.argv[2];
assert(input);
const data = JSON.parse(await fs.readFile(input, "utf8")),
  sum = (rows, key) => rows.reduce((n, r) => n + r[key], 0);
const rate = (n, d) => (d ? n / d : 0),
  p95 = (xs) =>
    [...xs].sort((a, b) => a - b)[Math.ceil(xs.length * 0.95) - 1] ?? 0;
function aggregate(rows) {
  return {
    runs: rows.length,
    moves: sum(rows, "moves"),
    meanCappedMoves: rate(sum(rows, "moves"), rows.length),
    early: rows.filter((r) => r.ended && r.moves <= 36).length,
    censored: rows.filter((r) => !r.ended).length,
    ordinaryRate: rate(sum(rows, "ordinary"), sum(rows, "moves")),
    rewardRate: rate(sum(rows, "allClears"), sum(rows, "moves")),
    rewardGames: rows.filter((r) => r.allClears).length,
    allClears: sum(rows, "allClears"),
    deals: sum(rows, "deals"),
    eligibleDeals: sum(rows, "eligibleDeals"),
    chain: sum(rows, "chain"),
    choice: sum(rows, "choice"),
    content: sum(rows, "content"),
    contentRate: rate(sum(rows, "content"), sum(rows, "eligibleDeals")),
    unknown: sum(rows, "unknown"),
    proofUnknowns: rows.reduce((n,r)=>n+(r.proofUnknowns??0),0),
    focus: sum(rows, "focus"),
    selected: sum(rows, "selected"),
    changed: sum(rows, "changed"),
    novelChain: sum(rows, "novelChain"),
    novelChoice: sum(rows, "novelChoice"),
    fallback: sum(rows, "fallback"),
    maxWork: Math.max(...rows.flatMap((r) => r.work), 0),
    p95Ms: p95(rows.flatMap((r) => r.generationMs)),
    maxStateBytes: Math.max(...rows.map((r) => r.maxStateBytes), 0),
  };
}
assert.equal(data.games.length, data.expectedRuns??128, "Incomplete factorial");
const styles = ["bounded", "clear", "three", "lapse"],
  arms = ["control", "starts", "tasks", "full"];
const byArm = Object.fromEntries(
  arms.map((arm) => [arm, aggregate(data.games.filter((r) => r.arm === arm))]),
);
const byStyle = Object.fromEntries(
  styles.map((style) => [
    style,
    Object.fromEntries(
      arms.map((arm) => [
        arm,
        aggregate(data.games.filter((r) => r.arm === arm && r.style === style)),
      ]),
    ),
  ]),
);
const gates = [];
const check = (name, ok, actual, limit) =>
  gates.push({ name, pass: ok, actual, limit });
for (const [candidate, control] of [
  ["tasks", "control"],
  ["full", "starts"],
]) {
  const a = byArm[candidate],
    b = byArm[control],
    minimum = b.contentRate + Math.max(0.01, b.contentRate * 0.2);
  check(
    `${candidate}:content`,
    a.contentRate >= minimum,
    a.contentRate,
    minimum,
  );
  check(`${candidate}:new-chain`, a.novelChain >= 1, a.novelChain, 1);
  check(`${candidate}:new-choice`, a.novelChoice >= 1, a.novelChoice, 1);
  check(`${candidate}:work`, a.maxWork <= 24000, a.maxWork, 24000);
  check(
    `${candidate}:p95`,
    a.p95Ms <= b.p95Ms * 1.25 + 2,
    a.p95Ms,
    b.p95Ms * 1.25 + 2,
  );
  for (const style of styles) {
    const x = byStyle[style][candidate],
      y = byStyle[style][control];
    const allowance=x.runs/8;
    check(
      `${candidate}/${style}:ordinary`,
      x.ordinaryRate >= y.ordinaryRate * 0.85,
      x.ordinaryRate,
      y.ordinaryRate * 0.85,
    );
    if (style !== "bounded")
      check(
        `${candidate}/${style}:rewards`,
        x.rewardRate >= y.rewardRate * 0.75,
        x.rewardRate,
        y.rewardRate * 0.75,
      );
    else
      check(
        `${candidate}/${style}:reward-games`,
        x.rewardGames >= y.rewardGames - allowance,
        x.rewardGames,
        y.rewardGames - allowance,
      );
    check(
      `${candidate}/${style}:early`,
      x.early <= y.early + allowance,
      x.early,
      y.early + allowance,
    );
    if (["clear", "lapse"].includes(style))
      check(
        `${candidate}/${style}:tail`,
        x.meanCappedMoves <= y.meanCappedMoves * 1.1,
        x.meanCappedMoves,
        y.meanCappedMoves * 1.1,
      );
    check(
      `${candidate}/${style}:fallback`,
      x.fallback <= y.fallback * 2 + allowance,
      x.fallback,
      y.fallback * 2 + allowance,
    );
  }
}
const summary = {
  provenance: "Synthetic only; aggregate factorial, no player recordings",
  stage: data.stage,
  runs: data.games.length,
  cap: data.cap,
  durations: data.durations,
  byArm,
  byStyle,
  gates,
  pass: gates.every((g) => g.pass),
};
const destination = process.argv[3] ?? input.replace(".json", ".summary.json");
await fs.writeFile(destination, JSON.stringify(summary, null, 2) + "\n");
console.log(
  JSON.stringify(
    {
      stage: data.stage,
      pass: summary.pass,
      byArm,
      failed: gates.filter((g) => !g.pass),
    },
    null,
    2,
  ),
);
if (!summary.pass) process.exitCode = 2;
