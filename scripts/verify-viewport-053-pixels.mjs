// Diagnostic only: actual scoped cache compared to original0.52 effect modules.
// Baseline is injected only into its own Vite server; globals are untouched.
import { createServer } from "vite";
import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import { execFileSync } from "node:child_process";
const original = Object.fromEntries(
  ["atmosphere", "festival"].map((name) => [
    name,
    execFileSync("git", ["show", "78754efbd70932caf6462dc17d1241b84381c4cf:src/game/" + name + ".ts"], {
      encoding: "utf8",
    }),
  ]),
);
const servers = [];
for (const candidate of [false, true]) {
  const server = await createServer({
    server: { host: "127.0.0.1", port: candidate ? 5199 : 5198 },
    plugins: candidate
      ? []
      : [
          {
            name: "original-052-effect-viewport",
            enforce: "pre",
            transform(source, id) {
              const name = id
                .split("?")[0]
                .match(/\/src\/game\/(atmosphere|festival)\.ts$/)?.[1];
              return name ? original[name] : undefined;
            },
          },
        ],
  });
  await server.listen();
  servers.push(server);
}
const browser = await chromium.launch({ headless: true });
const results = [];
try {
for (const phase of [17,400,650,1100,1800]) {
 const pair=[];
 for(const port of [5198,5199]) {
  const context=await browser.newContext({viewport:{width:392,height:872},deviceScaleFactor:2.75,isMobile:true});
  const page=await context.newPage();
  await page.addInitScript(()=>{ let seed=5353;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};performance.now=()=>1000; });
  await page.goto(`http://127.0.0.1:${port}/e2e/fixtures/effect-viewport.html`);
  await page.waitForFunction(()=>!!window.effects);
  const image=await page.evaluate(async phase=>{
   const {atmosphere:a,festival:f,board}=window.effects;
   a.set(110,true,false);a.origin(board,[1]);a.impulse(3);f.setPalette(5);f.burst(board,[],2,true,false,undefined,110,2);
   for(let t=1017;t<=1000+phase;t+=17){a.draw(t);f.draw(t)}
   const hashes=[];
   for(const e of [a,f]){
    const data=e.ctx.getImageData(0,0,e.canvas.width,e.canvas.height).data;
    const hash=await crypto.subtle.digest('SHA-256',data);
    hashes.push({size:[e.canvas.width,e.canvas.height],sha256:[...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,'0')).join('')});
   }
   return {canvases:hashes,rear:f.rear.innerHTML};
  },phase);
  pair.push(image);await context.close();
 }
 if(JSON.stringify(pair[0])!==JSON.stringify(pair[1]))throw Error('Pixel difference at '+phase);
 results.push({phaseMs:phase,exactPixelsAndSvg:true,canvases:pair[1].canvases});
}
await fs.mkdir('docs/qa/viewport-053',{recursive:true});
await fs.writeFile('docs/qa/viewport-053/pixel-parity.json',JSON.stringify({scope:'Deterministic atmosphere and rain reveal canvases plus SVG rear; original0.52 versus scoped cache; same viewport/DPR/RNG/timing',results},null,2)+'\n');console.log(JSON.stringify(results));
} finally {await browser.close();await Promise.all(servers.map(s=>s.close()));}
