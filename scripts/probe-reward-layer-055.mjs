// Diagnostic source/CSS ablations only. No production code or phone timing claims.
import { createServer } from "vite";
import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import assert from "node:assert/strict";

const guard = 'if (phoneLayers && diagnosticLayer?.skipRewardDom) return;';
const scoreGlow = 'animate(\n                    el("score"),\n                    [\n                      { textShadow:';
const server = await createServer({
  cacheDir: "/tmp/blocky-reward-layer-055-probe",
  plugins: [{
    name: "local-reward-probe", enforce: "pre",
    transform(code, id) {
      if (!id.split("?")[0].endsWith("/src/main.ts")) return;
      assert(code.includes(guard) && code.includes(scoreGlow), "Missing source probe anchors");
      return code.replace(guard, `${guard}\n    if (new URLSearchParams(location.search).get("probe") === "no-theme-notice" && tier === "theme") return;`)
        .replace(scoreGlow, `if (new URLSearchParams(location.search).get("probe") !== "no-score-glow") ${scoreGlow}`);
    },
  }],
  server: {host: "127.0.0.1", port: 5198, strictPort: true},
});
await server.listen();
const browser = await chromium.launch({headless: true});
const variants = ["no-theme-notice", "no-letters", "no-reward-filter", "no-score-glow", "no-enamel-local", "no-color-fades"];
const order = ["baseline", ...variants, "baseline", "baseline", ...[...variants].reverse(), "baseline"];
const output = process.env.PROBE_OUTPUT || "docs/qa/layers-055/reward-probe.json";
const css = {
  "no-letters": ".reward-praise i{animation:none!important}",
  "no-reward-filter": ".reward-praise{filter:none!important}",
  "no-enamel-local": ".best,.icon,.hint,.secondary{transition-property:color!important}",
  "no-color-fades": ".score,.best,.campaign-entry,.board-caption,.tray-label,.score-title,#combo-title,#combo-stock,.icon,.hint,.secondary{transition:none!important}",
};
const results = [];
try {
  for (const [index, condition] of order.entries()) {
    const context = await browser.newContext({viewport:{width:392,height:872},deviceScaleFactor:2.75,isMobile:true,hasTouch:true});
    const page = await context.newPage(), errors = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.goto(`http://127.0.0.1:5198/?clearTrace=1&probe=${condition}`);
    await page.waitForFunction(() => document.querySelector("#phone-clear-start")?.disabled === false);
    if (css[condition]) await page.addStyleTag({content:css[condition]});
    await page.evaluate(() => {
      window.__probeNodes = [];
      const observer = new MutationObserver(records => {
        for (const record of records) for (const node of record.addedNodes)
          if (node instanceof HTMLElement && (node.classList.contains("hud-notice") || node.classList.contains("reward-event")))
            window.__probeNodes.push({class:node.className,tier:node.dataset.tier,text:node.textContent});
      });
      observer.observe(document.body,{subtree:true,childList:true});
    });
    const cdp = await context.newCDPSession(page);
    await cdp.send("Tracing.start",{categories:"blink,blink.user_timing,v8,toplevel,devtools.timeline",transferMode:"ReturnAsStream"});
    await page.locator("#phone-clear-start").click();
    await page.waitForFunction(() => document.querySelector("#phone-clear-export")?.disabled === false, null, {timeout:35000});
    const done = new Promise(resolve => cdp.once("Tracing.tracingComplete",resolve));
    await cdp.send("Tracing.end");
    const {stream} = await done;
    let raw = "";
    for (;;) {
      const r = await cdp.send("IO.read",{handle:stream});
      raw += r.base64Encoded ? Buffer.from(r.data,"base64").toString() : r.data;
      if(r.eof) break;
    }
    await cdp.send("IO.close",{handle:stream});
    const es = JSON.parse(raw).traceEvents;
    const download = page.waitForEvent("download");
    await page.locator("#phone-clear-export").click();
    const report = JSON.parse(await fs.readFile(await (await download).path(),"utf8"));
    assert(report.completed && report.episodes.length===3 && errors.length===0);
    const episodes = report.episodes.map(e => {
      assert.equal(e.state.game.score,1574); assert.equal(e.state.wardrobe.selected,5);
      const mark = es.find(x => x.name===`blocky-clear:${e.kind}:committed`);
      assert(mark,`Missing ${e.kind} mark`);
      const metrics = Object.fromEntries(["Blink.Style.UpdateTime","Blink.ForcedStyleAndLayout.UpdateTime","Blink.Layout.UpdateTime","LocalFrameView::RunPaintLifecyclePhase","FrameRequestCallbackCollection::ExecuteFrameCallbacks"].map(name => {
        const xs = es.filter(x => x.ph==="X" && x.tid===mark.tid && x.name===name && x.ts>=mark.ts+320000 && x.ts<mark.ts+1400000);
        return [name,{count:xs.length,wallMs:xs.reduce((a,x)=>a+x.dur/1000,0),threadCpuMs:xs.reduce((a,x)=>a+(x.tdur||0)/1000,0),maxMs:Math.max(0,...xs.map(x=>x.dur/1000))}];
      }));
      return {kind:e.kind,score:e.state.game.score,theme:e.state.wardrobe.selected,metrics};
    });
    const nodes = await page.evaluate(() => window.__probeNodes);
    const record = {condition,index,round:index<8?0:1,episodes,nodes,errors};
    results.push(record);
    await fs.writeFile(output,JSON.stringify({environment:"Linux Chromium mobile emulation / software graphics; not POCO performance",windowMs:[320,1400],allEpisodesCdpTraced:true,results},null,2)+"\n");
    console.log(JSON.stringify({index,condition,styleMs:episodes.map(e=>+e.metrics["Blink.Style.UpdateTime"].wallMs.toFixed(2)),paintMs:episodes.map(e=>+e.metrics["LocalFrameView::RunPaintLifecyclePhase"].wallMs.toFixed(2)),nodes:nodes.length}));
    await context.close();
  }
} finally {
  await browser.close(); await server.close();
}
