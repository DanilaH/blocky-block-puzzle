import { chromium } from "playwright";
import fs from "node:fs/promises";
const b = await chromium.launch(),
  p = await b.newPage();
await p.goto("http://127.0.0.1:5185");
await p.locator("#board canvas").waitFor();
const result = await p.evaluate(async () => {
  const { GameAudio } = await import("/src/game/audio.ts");
  const a = new GameAudio();
  await a.unlock();
  const c = a.context,
    analyser = c.createAnalyser();
  a.output.connect(analyser);
  analyser.fftSize = 2048;
  const samples = new Float32Array(2048);
  let peak = 0,
    maxVoices = 0;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let n = 0; n < 20; n++) {
    a.play(n % 3 === 0 ? "allClear" : "clear", n + 1, 500, 1);
    for (let k = 0; k < 5; k++) {
      await wait(20);
      analyser.getFloatTimeDomainData(samples);
      for (const s of samples) peak = Math.max(peak, Math.abs(s));
      maxVoices = Math.max(maxVoices, a.voices.size);
    }
  }
  a.stop();
  const stopped = { voices: a.voices.size, delay: a.delay, state: c.state };
  await a.unlock();
  await wait(250);
  analyser.getFloatTimeDomainData(samples);
  const resumedSilentPeak = Math.max(...samples.map(Math.abs));
  a.enabled = false;
  a.play("clear", 9, 500, 1);
  const mutedVoices = a.voices.size;
  a.stop();
  return {
    rapidEvents: 20,
    intervalMs: 100,
    peak,
    maxVoices,
    stopped,
    resumedSilentPeak,
    mutedVoices,
  };
});
console.log(JSON.stringify(result));
await fs.writeFile(
  "docs/qa/feel-0.15/audio-stress.json",
  JSON.stringify(result, null, 2),
);
await b.close();
if (
  result.peak >= 1 ||
  result.peak <= 0 ||
  result.maxVoices > 12 ||
  result.stopped.voices ||
  result.resumedSilentPeak > 0.00001 ||
  result.mutedVoices
)
  process.exit(1);
