import { createServer } from "vite";
import { chromium } from "playwright";
import fs from "node:fs/promises";
const server = await createServer({
  server: { port: 5197, host: "127.0.0.1" },
});
await server.listen();
const browser = await chromium.launch({
  args: ["--autoplay-policy=no-user-gesture-required"],
});
try {
  const page = await browser.newPage();
  await page.goto("http://127.0.0.1:5197");
  const result = await page.evaluate(async () => {
    const { GameAudio } = await import("/src/game/audio.ts");
    const audio = new GameAudio();
    audio.configure(1, 1);
    await audio.unlock();
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    for (let i = 0; i < 200 && !audio.music.source; i++) await wait(50);
    if (!audio.music.source) throw Error("Music did not start");
    const c = audio.context,
      an = c.createAnalyser();
    an.fftSize = 2048;
    audio.output.connect(an);
    const samples = new Float32Array(2048);
    let peak = 0,
      maxVoices = 0;
    for (let i = 0; i < 30; i++) {
      audio.play(i % 3 === 0 ? "allClear" : "combo", i + 1, 1800, 1);
      for (let j = 0; j < 5; j++) {
        await wait(20);
        an.getFloatTimeDomainData(samples);
        for (const x of samples) peak = Math.max(peak, Math.abs(x));
        maxVoices = Math.max(maxVoices, audio.voices.size);
      }
    }
    const b = audio.music.buffer;
    let seam = 0;
    for (let ch = 0; ch < b.numberOfChannels; ch++) {
      const d = b.getChannelData(ch);
      seam = Math.max(seam, Math.abs(d[0] - d[d.length - 1]));
    }
    for (let i = 0; i < 10; i++) {
      audio.stop();
      if (audio.music.source || audio.voices.size)
        throw Error("Stopped audio still active");
      await audio.unlock();
      await wait(30);
      if (!audio.music.source) throw Error("Resume failed");
    }
    audio.stop();
    return {
      peak,
      maxVoices,
      cycles: 10,
      duration: b.duration,
      sampleRate: b.sampleRate,
      decodedBytes: b.length * b.numberOfChannels * 4,
      seamDelta: seam,
      stopped: c.state,
    };
  });
  await page.locator("#lesson-skip").click();
  await page.locator("#pause").click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "docs/qa/music-0.32/settings.png" });
  await fs.writeFile(
    "docs/qa/music-0.32/audio-check.json",
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(JSON.stringify(result));
  if (
    result.peak >= 1 ||
    result.peak <= 0 ||
    result.maxVoices > 18 ||
    result.seamDelta > 0.03 ||
    result.stopped !== "suspended"
  )
    process.exitCode = 1;
} finally {
  await browser.close();
  await server.close();
}
