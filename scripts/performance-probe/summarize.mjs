// Run after the audit batches. Preserve rAF series and evidence without giant traces.
import fs from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import path from "node:path";
import { createHash } from "node:crypto";
const root = path.resolve("docs/qa/performance-probe-047");
const names = [
  "screen-dev",
  "textures-dev",
  "layers-dev",
  "layers-production",
  "traced",
];
const studies = [];
for (const name of names) {
  const file = path.join(root, name + ".raw.json");
  const bytes = await fs.readFile(file);
  const data = JSON.parse(bytes);
  if (!data.manifest.completed) throw Error("Incomplete study: " + name);
  const results = data.results.map((row) => {
    const { gameId, ...game } = row.final.game;
    return {
      condition: row.condition,
      round: row.round,
      repeat: row.repeat,
      firstInContext: row.cold,
      durationMs: row.end - row.start,
      manifest: row.manifest,
      summary: row.summary,
      metrics: row.metrics,
      gl: row.gl,
      marks: row.marks.map((mark) => ({ ...mark, at: mark.at - row.start })),
      rafSeries: row.raf.map((x) => [
        Math.round((x.at - row.start) * 1000) / 1000,
        Math.round(x.ms * 1000) / 1000,
      ]),
      long: row.long.map((x) => ({ ...x, at: x.at - row.start })),
      phaseBins: [
        [0, 320],
        [320, 650],
        [650, 1500],
        [1500, 2300],
        [2300, 3600],
      ].map(([lo, hi]) => {
        const samples = row.raf.filter(
          (x) => lo <= x.at - row.start && x.at - row.start < hi,
        );
        return {
          endTimeRangeMs: [lo, hi],
          samples: samples.length,
          over25: samples.filter((x) => x.ms > 25).length,
        };
      }),
      outcome: {
        moves: game.moves,
        score: game.score,
        streak: game.streak,
        status: game.status,
        occupied: game.board.filter(Boolean).length,
        shownTheme: row.final.shownTheme,
        wardrobe: row.final.wardrobe,
      },
      gameplayHashWithoutGameId: createHash("sha256")
        .update(JSON.stringify(game))
        .digest("hex"),
      pageErrors: row.errors,
    };
  });
  studies.push({
    name,
    manifest: data.manifest,
    rawSha256: createHash("sha256").update(bytes).digest("hex"),
    results,
  });
}
await fs.writeFile(
  path.join(root, "measurements.json"),
  JSON.stringify({
    schemaVersion: 1,
    note: "Raw trace captures are temporary. This committed dataset preserves per-episode settings, rAF time series, statistics, GL counters, marks and outcomes. over25 is an operational 60Hz test threshold, not a universal device threshold. First-in-context does not clear the browser/OS shader cache. Trace-enabled studies are not pooled with untraced comparisons.",
    studies,
  }) + "\n",
);
for (const study of studies) {
  const groups = new Map();
  for (const row of study.results.filter((r) => r.repeat === 1)) {
    const key = JSON.stringify(row.condition);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  console.log(study.name, study.results.length);
  for (const [key, rows] of groups)
    console.log(
      key,
      JSON.stringify({
        p95: rows.map((r) => Math.round(r.summary.raf.p95 * 10) / 10),
        over25: rows.map((r) => r.summary.raf.over25),
        rafCount: rows.map((r) => r.summary.raf.count),
        maxDrawCalls: rows.map((r) => r.summary.maxDrawCallsPerRender),
      }),
    );
}

// Trace totals are nested wall-time spans, not additive CPU/GPU execution time.
const traced = JSON.parse(
  await fs.readFile(path.join(root, "traced.raw.json"), "utf8"),
);
const traces = [];
for (const row of traced.results) {
  const events = JSON.parse(
    gunzipSync(await fs.readFile(path.join(root, row.traceFile))),
  ).traceEvents;
  const start = events.find((e) => e.name === "probe:start").ts;
  const threads = new Map(
    events
      .filter((e) => e.name === "thread_name")
      .map((e) => [e.pid + ":" + e.tid, e.args?.name]),
  );
  const commits = events.filter((e) => e.ph === "X" && e.name === "Commit");
  const waits = events.filter(
    (e) =>
      e.ph === "X" && e.name === "CommandBufferProxyImpl::WaitForGetOffset",
  );
  const inside = waits.filter((w) =>
    commits.some(
      (c) =>
        c.pid === w.pid &&
        c.tid === w.tid &&
        c.ts <= w.ts &&
        w.ts + w.dur <= c.ts + c.dur + 1,
    ),
  ).length;
  const groups = new Map();
  for (const e of events) {
    if (e.ph !== "X" || !e.dur || e.ts < start || e.ts >= start + 3500000)
      continue;
    const thread = threads.get(e.pid + ":" + e.tid) || String(e.tid);
    if (
      ![
        "Commit",
        "ImplementationBase::WaitForCmd",
        "CommandBufferProxyImpl::WaitForGetOffset",
      ].includes(e.name) &&
      !(thread === "CrGpuMain" && e.name === "RunTask")
    )
      continue;
    const key = thread + "|" + e.name;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e.dur / 1000);
  }
  const bins = [
    [0, 320],
    [320, 650],
    [650, 1500],
    [1500, 3500],
  ].map(([lo, hi]) => {
    const values = waits
      .filter((e) => lo <= (e.ts - start) / 1000 && (e.ts - start) / 1000 < hi)
      .map((e) => e.dur / 1000);
    return {
      phaseMs: [lo, hi],
      count: values.length,
      maxMs: Number(Math.max(0, ...values).toFixed(3)),
      totalMs: Number(values.reduce((a, b) => a + b, 0).toFixed(3)),
    };
  });
  traces.push({
    condition: row.condition,
    repeat: row.repeat,
    windowMs: 3500,
    waitSpansInsideCommit: { inside, total: waits.length },
    events: [...groups].map(([key, v]) => ({
      thread: key.split("|")[0],
      name: key.split("|")[1],
      count: v.length,
      totalMs: Number(v.reduce((a, b) => a + b, 0).toFixed(3)),
      maxMs: Number(Math.max(...v).toFixed(3)),
    })),
    waitPhaseBins: bins,
    note: "Nested trace spans; totals are not additive. Trace-enabled run is separate from performance comparison.",
  });
}
await fs.writeFile(
  path.join(root, "trace-summary.json"),
  JSON.stringify(traces, null, 2) + "\n",
);
