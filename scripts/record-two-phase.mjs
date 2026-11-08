// Capture presentation separately from profiling. Browser video is not a POCO FPS measurement.
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { createLab, openCase, prepare } from "./two-phase-lab.mjs";
const output =
  process.env.TWO_PHASE_VIDEO_DIR || "/tmp/blocky-two-phase-review";
await fs.mkdir(output, { recursive: true });
const lab = await createLab(),
  clips = [];
try {
  for (const viewport of [
    { width: 392, height: 872 },
    { width: 872, height: 392 },
  ])
    for (const variant of [0, 1, 2])
      for (const mode of ["legacy", "staged"]) {
        const { context, page, errors } = await openCase(
          lab.browser,
          mode,
          viewport,
          variant,
          {
            recordVideo: {
              dir: output,
              size: viewport,
            },
          },
        );
        const video = page.video();
        await prepare(page);
        const result = await page.evaluate(async () => {
          const marker = document.createElement("div");
          marker.style.cssText =
            "position:fixed;z-index:99999;left:0;top:0;width:8px;height:8px;background:rgb(255,0,255);pointer-events:none";
          document.body.append(marker);
          await new Promise((resolve) => setTimeout(resolve, 200));
          const lab = window.__blockyClearLab;
          lab.begin();
          const start = performance.now();
          marker.style.background = "rgb(0,255,0)";
          await lab.commit();
          await new Promise((resolve) => setTimeout(resolve, 9000));
          const state = lab.state();
          lab.stop();
          return { elapsedMs: performance.now() - start, state };
        });
        assert.deepEqual(errors, []);
        assert.equal(result.state.proof.shownScore, 1574);
        assert.equal(result.state.proof.pendingPoints, 0);
        assert.equal(result.state.proof.festival.activeParticles, 0);
        assert.equal(result.state.proof.festival.activeReveals, 0);
        if (mode === "staged")
          assert.equal(result.state.clearPresentation.phase, "idle");
        const filename = `${viewport.width}-${variant}-${mode}.webm`;
        const original = await video.path();
        await context.close();
        await fs.rename(original, path.join(output, filename));
        const cp = result.state.clearPresentation;
        const eventStart = cp?.events.find((e) => e.name === "start")?.at;
        const completedAtMs = cp
          ? cp.events.find((e) => e.name === "complete").at - eventStart
          : null;
        clips.push({
          viewport,
          variant,
          mode,
          filename,
          elapsedMs: result.elapsedMs,
          completedAtMs,
          proof: result.state.proof,
          errors,
        });
        await fs.writeFile(
          path.join(output, "clips.json"),
          JSON.stringify(
            {
              scope:
                "Presentation only; recorded sequentially, silent; separate from measured runs",
              clips,
            },
            null,
            2,
          ) + "\n",
        );
        console.log(
          JSON.stringify({
            clip: clips.length,
            mode,
            viewport,
            variant,
            completedAtMs,
          }),
        );
      }
} finally {
  await lab.close();
}
