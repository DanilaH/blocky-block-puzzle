// Local, reversible source/CSS prototype. No shipping code or POCO timing claim.
import { createServer } from "vite";
import { chromium } from "@playwright/test";
import sharp from "sharp";
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { gunzipSync } from "node:zlib";

const output = process.env.PROBE_OUTPUT || "/workspace/scratch/03c53152a52e/analysis059/compositor-prototype";
await fs.mkdir(output, { recursive: true });
const motifs = [
  ["all-clear", 704, "50,0 60,35 85,15 65,40 100,50 65,60 85,85 60,65 50,100 40,65 15,85 35,60 0,50 35,40 15,15 40,35", ["#fff0a6", "#ffdc49", "#ffffff", "#ffdc49"], [0, .4392156863, .6274509804, 0]],
  ["series", 560, "50,0 100,50 50,100 0,50 50,0 50,12 12,50 50,88 88,50 50,12", ["#45caff", "#b6f6ff", "#45caff"], [.1333333333, .6, 0]],
];
let imageCss = "";
const imageUrls = [];
for (const [tier, size, points, colors, opacity] of motifs) {
  const stops = colors.map((color, i) => `<stop offset="${i / (colors.length - 1)}" stop-color="${color}" stop-opacity="${opacity[i]}"/>`).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100"><defs><linearGradient id="g" x1="0" y1="1" x2="1" y2="0">${stops}</linearGradient></defs><polygon points="${points}" fill="url(#g)"/></svg>`;
  const bitmap = await sharp(Buffer.from(svg)).webp({ lossless: true }).toBuffer();
  const url = `data:image/webp;base64,${bitmap.toString("base64")}`;
  imageUrls.push(url);
  imageCss += `:root[data-presentation=classic] .reward-event[data-tier="${tier}"]::before{clip-path:none;background-image:url("${url}");background-size:100% 100%;background-repeat:no-repeat}\n`;
}
const oldGlow = `const glow = animate(
                      el("score"),
                      [
                        { textShadow: "0 0 18px #8edaff" },
                        { textShadow: "0 2px 2px #00000026" },
                      ],
                      600,
                    );`;
const server = await createServer({
  cacheDir: "/tmp/blocky-compositor-prototype",
  plugins: [{ name: "reward-compositor-probe", enforce: "pre", transform(code, id) {
    if (!id.split("?")[0].endsWith("/src/main.ts")) return;
    assert(code.includes(oldGlow) && code.includes('  const rewardAnchor = document.createElement("div");'));
    code = code.replace('  const rewardAnchor = document.createElement("div");', `
  const useHalo = ["halo", "both"].includes(new URLSearchParams(location.search).get("compositorProbe") || "");
  const useFilter = ["filter", "filter-image", "filter-unpromoted"].includes(new URLSearchParams(location.search).get("compositorProbe") || "");
  let scoreGlowGeneration = 0;
  const prototypeVariant = new URLSearchParams(location.search).get("compositorProbe");
  if (["filter", "filter-image"].includes(prototypeVariant || "")) el("score").style.willChange = "transform,filter";
  if (prototypeVariant === "prepromote") el("score").style.willChange = "transform";
  if (useHalo) {
    const score = el("score"), ink = document.createElement("span"), halo = document.createElement("span");
    ink.id = "score-value"; ink.textContent = score.textContent;
    halo.id = "score-glow"; halo.setAttribute("aria-hidden", "true");
    score.replaceChildren(ink, halo);
    score.style.position = "relative"; score.style.isolation = "isolate"; score.style.willChange = "transform";
    halo.style.cssText = "position:absolute;inset:-14px -26px;z-index:-1;pointer-events:none;opacity:0;background:radial-gradient(ellipse closest-side,#8edaffa0, #8edaff40 55%,#8edaff00);border-radius:50%";
  }
  const rewardAnchor = document.createElement("div");`);
    code = code.replace('el("score").textContent = Math.round(n).toLocaleString("ru");', '(useHalo ? el("score-value") : el("score")).textContent = Math.round(n).toLocaleString("ru");');
    code = code.replace('el("score").textContent = scoreTarget.toLocaleString("ru");', '(useHalo ? el("score-value") : el("score")).textContent = scoreTarget.toLocaleString("ru");');
    code = code.replace(oldGlow, `const glow = useFilter ? (() => {
                      const target = el("score"), generation = ++scoreGlowGeneration;
                      target.style.textShadow = "none";
                      const effect = animate(target, [
                        { filter: "drop-shadow(0 0 9px #8edaff)" },
                        { filter: "drop-shadow(0 2px 1px #00000026)" },
                      ], 600);
                      const cleanup = () => {if (generation === scoreGlowGeneration) target.style.removeProperty("text-shadow")};
                      if (effect) {effect.addEventListener("finish",cleanup,{once:true});effect.addEventListener("cancel",cleanup,{once:true})} else cleanup();
                      return effect;
                    })() : animate(
                      useHalo ? el("score-glow") : el("score"),
                      useHalo ? [{opacity:1},{opacity:0}] : [
                        { textShadow: "0 0 18px #8edaff" },
                        { textShadow: "0 2px 2px #00000026" },
                      ], 600);`);
    return code;
  }}],
  server: { host: "127.0.0.1", port: 5199, strictPort: true },
});
await server.listen();
const browser = await chromium.launch({ headless: true });
const variants = (process.env.PROBE_VARIANTS || "baseline,image,halo,both").split(",");
const order = process.env.PROBE_QUICK ? variants : [...variants, ...variants.slice().reverse()];
const results = [];
try {
  for (const [index, variant] of order.entries()) {
    const context = await browser.newContext({ viewport: { width: 392, height: 872 }, deviceScaleFactor: 2.75, isMobile: true, hasTouch: true });
    const page = await context.newPage(), errors = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.goto(`http://127.0.0.1:5199/?clearTrace=full&compositorProbe=${variant}`);
    await page.waitForFunction(() => !!window.__blockyFullDiagnostic);
    if (["image", "both", "filter-image"].includes(variant)) {
      await page.addStyleTag({ content: imageCss });
      await page.evaluate(async urls => {
        await Promise.all(urls.map(async url => { const img = new Image(); img.src = url; await img.decode(); }));
      }, imageUrls);
    }
    const measure = () => page.evaluate(async () => {
      const d = window.__blockyFullDiagnostic;
      await d.prepare("baseline");
      return d.measure(8000);
    });
    for (let n = 0; n < 2; n++) {
      const row = await measure();
      assert(row.valid, JSON.stringify(row.validation));
      assert.equal(row.state.proof.festival.activeParticles, 0);
    }
    const untraced = [];
    for (let n = 0; n < (process.env.PROBE_QUICK ? 1 : 2); n++) {
      const row = await measure();
      assert(row.valid, JSON.stringify(row.validation));
      untraced.push({ metrics: row.metrics, proof: row.state.proof });
    }
    await page.evaluate(() => window.__blockyFullDiagnostic.prepare("baseline"));
    const cdp = await context.newCDPSession(page), layers = [];
    await cdp.send("DOM.enable");
    cdp.on("LayerTree.layerTreeDidChange", p => layers.push(p));
    await cdp.send("LayerTree.enable");
    const initial = await cdp.send("DOM.getDocument", { depth: -1, pierce: true });
    await cdp.send("Tracing.start", { categories: "toplevel,blink.user_timing,devtools.timeline,disabled-by-default-devtools.timeline,blink,cc,gpu", transferMode: "ReturnAsStream", streamCompression: "gzip" });
    const row = await page.evaluate(async () => {
      performance.mark("compositor-probe:start");
      const r = await window.__blockyFullDiagnostic.measure(8000);
      performance.mark("compositor-probe:end");
      return r;
    });
    assert(row.valid, JSON.stringify(row.validation));
    assert.equal(row.state.proof.shownScore, 1574);
    assert.equal(row.state.proof.festival.activeParticles, 0);
    assert.equal(row.state.proof.festival.activeReveals, 0);
    const done = new Promise(resolve => cdp.once("Tracing.tracingComplete", resolve));
    await cdp.send("Tracing.end");
    const complete = await done;
    assert.equal(complete.dataLossOccurred, false);
    const chunks = [];
    for (;;) {
      const x = await cdp.send("IO.read", { handle: complete.stream, size: 262144 });
      chunks.push(Buffer.from(x.data, x.base64Encoded ? "base64" : "utf8"));
      if (x.eof) break;
    }
    await cdp.send("IO.close", { handle: complete.stream });
    const binary = Buffer.concat(chunks);
    await fs.writeFile(path.join(output, `${index}-${variant}.json.gz`), binary);
    const events = JSON.parse((complete.streamCompression === "gzip" ? gunzipSync(binary) : binary).toString()).traceEvents;
    const start = events.find(e => e.name === "compositor-probe:start").ts, end = events.find(e => e.name === "compositor-probe:end").ts;
    const nodes = new Map();
    function visit(node, parent = "") {
      const a = Object.fromEntries((node.attributes || []).reduce((a, v, i, arr) => i % 2 ? a : [...a, [v, arr[i + 1]]], []));
      const label = parent + ">" + node.nodeName + (a.id ? "#" + a.id : "") + (a.class ? "." + a.class : "");
      if (node.backendNodeId) nodes.set(node.backendNodeId, label);
      for (const child of [...node.children || [], ...node.pseudoElements || []]) visit(child, label);
    }
    visit(initial.root);
    const layerNodes = new Map(layers.flatMap(e => (e.layers || []).map(l => [l.layerId, l.backendNodeId])));
    const raster = new Map(), paint = new Map();
    for (const e of events) {
      if (e.ts < start || e.ts > end) continue;
      let target, map;
      if (e.name === "RasterTask") { target = nodes.get(layerNodes.get(String(e.args?.tileData?.layerId))) || String(e.args?.tileData?.layerId); map = raster; }
      else if (e.name === "Paint") { target = nodes.get(e.args?.data?.nodeId) || e.args?.data?.nodeName || String(e.args?.data?.nodeId); map = paint; }
      else continue;
      const bucket = map.get(target) || { count: 0, wallMs: 0, maxMs: 0 };
      bucket.count++; bucket.wallMs += (e.dur || 0) / 1000; bucket.maxMs = Math.max(bucket.maxMs, (e.dur || 0) / 1000); map.set(target, bucket);
    }
    const scored = [...raster].filter(([name]) => name.includes("#score") || name.includes("score-panel"));
    const record = { index, variant, untraced, rowProof: row.state.proof, tracedWindowMs: (end - start) / 1000, scoreRasterWorkerWallMs: scored.reduce((a, [, b]) => a + b.wallMs, 0), raster: Object.fromEntries(raster), paint: Object.fromEntries(paint), layerIds: layerNodes.size, errors };
    assert.equal(errors.length, 0, errors.join("\n"));
    results.push(record);
    await fs.writeFile(path.join(output, "result.json"), JSON.stringify({ environment: "Linux Chromium mobile emulation, software graphics. Not POCO performance. Traced data is resource attribution, not FPS A/B.", results }, null, 2));
    console.log(JSON.stringify({ index, variant, scoreRasterWorkerWallMs: record.scoreRasterWorkerWallMs, untraced: untraced.map(x => x.metrics), errors }));
    await context.close();
  }
} finally { await browser.close(); await server.close(); }
