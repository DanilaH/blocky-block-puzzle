import fs from "node:fs/promises";
import assert from "node:assert/strict";
import {
  createLab,
  openCase,
  prepare,
  runEpisode,
  validateEpisode,
  frameMetrics,
  measurementMs,
} from "./two-phase-lab.mjs";
const output =
  process.env.TWO_PHASE_OUTPUT ||
  "docs/qa/two-phase-clear/browser-comparison.json";
const lab = await createLab(),
  results = [];
const scenarios = [
  { width: 392, height: 872 },
  { width: 872, height: 392 },
].flatMap((viewport) => [0, 1, 2].map((variant) => ({ viewport, variant })));
const passes = process.env.TWO_PHASE_SHORT ? [0] : [0, 1];
function tasks(events, mark, low, high) {
  const spans = events
    .filter(
      (e) =>
        e.ph === "X" &&
        e.pid === mark.pid &&
        e.tid === mark.tid &&
        e.name === "ThreadControllerImpl::RunTask" &&
        e.ts >= mark.ts + low * 1000 &&
        e.ts < mark.ts + high * 1000,
    )
    .sort((a, b) => a.ts - b.ts || b.dur - a.dur);
  const outer = [];
  let end = -Infinity;
  for (const e of spans)
    if (e.ts + e.dur > end) {
      outer.push(e);
      end = e.ts + e.dur;
    }
  return {
    rawCount: spans.length,
    outerCount: outer.length,
    wallMs: outer.reduce((n, e) => n + e.dur / 1000, 0),
    threadCpuMs: outer.reduce((n, e) => n + (e.tdur || 0) / 1000, 0),
    maxTaskMs: Math.max(0, ...outer.map((e) => e.dur / 1000)),
  };
}
try {
  for (const pass of passes)
    for (const scenario of pass ? scenarios.toReversed() : scenarios) {
      const modes = pass ? ["staged", "legacy"] : ["legacy", "staged"];
      for (const mode of modes) {
        const { context, page, errors } = await openCase(
          lab.browser,
          mode,
          scenario.viewport,
          scenario.variant,
        );
        await prepare(page);
        validateEpisode(await runEpisode(page, "warmup"), mode);
        await prepare(page);
        const cdp = await context.newCDPSession(page);
        await cdp.send("Tracing.start", {
          categories: "blink,blink.user_timing,v8,toplevel,devtools.timeline",
          transferMode: "ReturnAsStream",
        });
        const episode = await runEpisode(page, "measured");
        const done = new Promise((resolve) =>
          cdp.once("Tracing.tracingComplete", resolve),
        );
        await cdp.send("Tracing.end");
        const { stream } = await done;
        let raw = "";
        for (;;) {
          const x = await cdp.send("IO.read", { handle: stream });
          raw += x.base64Encoded
            ? Buffer.from(x.data, "base64").toString()
            : x.data;
          if (x.eof) break;
        }
        await cdp.send("IO.close", { handle: stream });
        validateEpisode(episode, mode);
        assert.deepEqual(errors, []);
        const events = JSON.parse(raw).traceEvents;
        const start = events.find((e) => e.name === "measured:start"),
          committed = events.find((e) => e.name === "measured:committed"),
          end = events.find((e) => e.name === "measured:end");
        assert(start && committed && end);
        const wholeTasks = tasks(events, start, 0, (end.ts - start.ts) / 1000);
        assert.equal(
          wholeTasks.rawCount,
          wholeTasks.outerCount,
          "Nested tasks must not be counted twice",
        );
        const windows = [
          [0, 2400],
          [2400, measurementMs],
          [0, measurementMs],
        ].map(([low, high]) => {
          const costs = Object.fromEntries(
            [
              "Blink.Style.UpdateTime",
              "Blink.ForcedStyleAndLayout.UpdateTime",
              "Blink.Layout.UpdateTime",
              "LocalFrameView::RunPaintLifecyclePhase",
              "FrameRequestCallbackCollection::ExecuteFrameCallbacks",
            ].map((name) => {
              const xs = events.filter(
                (e) =>
                  e.ph === "X" &&
                  e.pid === committed.pid &&
                  e.tid === committed.tid &&
                  e.name === name &&
                  e.ts >= committed.ts + low * 1000 &&
                  e.ts < committed.ts + high * 1000,
              );
              return [
                name,
                {
                  count: xs.length,
                  wallMs: xs.reduce((n, e) => n + e.dur / 1000, 0),
                  maxMs: Math.max(0, ...xs.map((e) => e.dur / 1000)),
                },
              ];
            }),
          );
          return {
            afterCommitMs: [low, high],
            frames: frameMetrics(episode.sample, low, high),
            tasks: tasks(events, committed, low, high),
            costs,
          };
        });
        const rollingCpu = [];
        for (let low = 0; low <= measurementMs - 1000; low += 250)
          rollingCpu.push(
            tasks(events, committed, low, low + 1000).threadCpuMs,
          );
        results.push({
          pass,
          ...scenario,
          mode,
          errors,
          state: episode.state,
          wholeTasks,
          maxOneSecondCpuMs: Math.max(...rollingCpu),
          windows,
        });
        await fs.writeFile(
          output,
          JSON.stringify(
            {
              environment:
                "Linux Chromium/SwiftShader. Not a POCO FPS claim. Video captured separately.",
              measurementMs,
              warmupMs: measurementMs,
              allMeasuredEpisodesCdpTraced: true,
              metricRule:
                "RAF intervals overlap the window; task categories selected by start; nested categories not added",
              results,
            },
            null,
            2,
          ) + "\n",
        );
        console.log(
          JSON.stringify({
            page: results.length,
            pass,
            mode,
            ...scenario,
            cpu: wholeTasks.threadCpuMs,
            peakCpu: Math.max(...rollingCpu),
            frames: windows.at(-1).frames,
            themeAt: episode.state.clearPresentation?.events.find(
              (e) => e.name === "theme-start",
            )?.at,
          }),
        );
        await context.close();
      }
    }
} finally {
  await lab.close();
}
