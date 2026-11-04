// Seeded empty board, ordinary flow-v3 deals, deterministic greedy player. No injected mid-game positions. Automated, not human playtest.
import { createServer } from "vite";
import { chromium } from "playwright";
import fs from "node:fs/promises";
const dir = process.env.CAPTURE_DIR;
if (!dir) throw Error("CAPTURE_DIR required");
await fs.mkdir(dir, { recursive: true });
const server = await createServer({
  server: { port: 5193, host: "127.0.0.1" },
});
await server.listen();
const browser = await chromium.launch();
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => {
    throw e;
  });
  await page.route("**/src/main.ts", async (route) => {
    const response = await route.fetch();
    const body = (await response.text()).replace(
      "const analytics =",
      "window.demo = {store, audio, render:()=>render()}; const analytics =",
    );
    await route.fulfill({ response, body });
  });
  if(process.env.CAPTURE_REVIVE) await page.route("**/src/platform/ads.ts", async route=>{
    const response=await route.fetch(),body=await response.text();
    const patched=body.replace(/export function nativeAds\(\) \{[\s\S]*?\n\}/, `export function nativeAds(){return {
      initialize:async()=>({enabled:true}),status:async()=>({rewarded:true,interstitial:false}),pending:async()=>({rewards:[]}),preload:async()=>{},acknowledge:async()=>{},addListener:async()=>({remove:async()=>{}}),
      geometry:async()=>({epoch:0,geometry:{webView:{x:0,y:0,width:innerWidth,height:innerHeight},root:{width:innerWidth,height:innerHeight},adHeight:52}}),banner:async()=>{},
      show:async p=>{const label=document.createElement('div');label.textContent='Тестовое подтверждение награды';label.style.cssText='position:fixed;inset:0;display:grid;place-items:center;background:#102534;color:white;z-index:9999';document.body.append(label);await new Promise(r=>setTimeout(r,1000));label.remove();return {status:'closed',shown:true,rewards:[{id:'demo-'+p.intentId,intentId:p.intentId}]};}
    };}`);
    if(patched===body)throw Error('mock bridge not installed');await route.fulfill({response,body:patched});
  });
  await page.addInitScript(() => {
    const Base = window.AudioContext;
    window.AudioContext = class extends Base {
      constructor(...args) {
        super(...args);
        window.soundTap = this.createMediaStreamDestination();
      }
      createDynamicsCompressor() {
        const n = super.createDynamicsCompressor();
        n.connect(window.soundTap);
        return n;
      }
    };
  });
  await page.goto("http://127.0.0.1:5193");
  await page.waitForFunction(
    () => window.demo && !document.querySelector("#app").inert,
  );
  await page.evaluate(async (seed) => {
    const { IndexedSave } = await import("/src/platform/save.ts");
    const p = structuredClone(window.demo.store.state);
    p.revision++;
    p.tutorialStep = 4;
    const {newGame}=await import("/src/core/rules.ts");
    p.game={...newGame(seed,"natural-capture","flow-v3"),scoringVersion:"festival-v4"};
    p.wardrobe={selected:0,unlocked:[0],discoveries:0};
    p.settings.musicVolume = 0;
    p.settings.effectsVolume = 1;
    p.settings.sound = true;
    p.settings.calm = false;
    await new IndexedSave().write(p);
  }, Number(process.env.CAPTURE_SEED || 1777));
  await page.reload();
  await page.waitForFunction(
    () => window.demo && !document.querySelector("#app").inert,
  );
  await page.locator('[data-slot="0"]').click();
  await page.waitForFunction(() => !!window.demo.audio.context);
  await page.waitForTimeout(1000);
  const cdp = await context.newCDPSession(page),
    frames = [],
    writes = [];
  cdp.on("Page.screencastFrame", (e) => {
    const file = `frame-${String(frames.length).padStart(5, "0")}.jpg`;
    frames.push({ file, t: e.metadata.timestamp });
    writes.push(fs.writeFile(dir + "/" + file, Buffer.from(e.data, "base64")));
    void cdp.send("Page.screencastFrameAck", { sessionId: e.sessionId });
  });
  await cdp.send("Page.startScreencast", {
    format: "jpeg",
    quality: 90,
    maxWidth: 390,
    maxHeight: 844,
    everyNthFrame: 1,
  });
  const start = await page.evaluate(
    () =>
      new Promise((resolve) => {
        window.soundChunks = [];
        window.soundRecorder = new MediaRecorder(window.soundTap.stream, {
          mimeType: "audio/webm;codecs=opus",
          audioBitsPerSecond: 192000,
        });
        window.soundRecorder.ondataavailable = (e) =>
          window.soundChunks.push(e.data);
        window.soundRecorder.onstart = () => resolve(Date.now() / 1000);
        window.soundRecorder.start();
      }),
  );
  const events=[];
  for(let turn=0;turn<Number(process.env.CAPTURE_MOVES || 36);turn++) {
    const move=await page.evaluate(async()=>{
      const R=await import('/src/core/rules.ts'),g=window.demo.store.state.game;
      if(g.status!=='playing')return null;
      const options=g.tray.flatMap((s,slot)=>s.used?[]:R.placements(g.board,R.shapeById(s.shapeId)).map(p=>({slot,...p})));
      let best=-Infinity,choice=null;
      for(const m of options){
        const shape=R.shapeById(g.tray[m.slot].shapeId),r=R.place(g.board,shape,m.x,m.y);let edges=0;
        for(let i=0;i<64;i++)if(r.board[i]){if(i%8<7&&!r.board[i+1])edges++;if(i<56&&!r.board[i+8])edges++;}
        const score=r.lines*200-r.board.filter(Boolean).length-edges*3;
        if(score>best){best=score;choice={...m,width:shape.width,height:shape.height,revision:g.revision,allClear:r.board.every(c=>!c),lines:r.lines};}
      }return choice;
    });
    if(!move){
      await page.waitForTimeout(2000);
      if(process.env.CAPTURE_REVIVE && await page.locator('#revive-offer').count()){
        await page.waitForTimeout(1200);await page.locator('#revive-offer').click();await page.waitForTimeout(700);await page.locator('#watch-reward').click();await page.waitForFunction(()=>window.demo.store.state.game.status==='playing');
        events.push({kind:'revive',mockReward:true,t:(await page.evaluate(()=>Date.now()/1000))-start});continue;
      }
      break;
    }
    const box=await page.locator('#board').boundingBox(),piece=await page.locator(`[data-slot="${move.slot}"]`).boundingBox();
    const from={x:piece.x+piece.width/2,y:piece.y+piece.height/2};
    const to={x:box.x+(move.x+move.width/2)*box.width/8,y:box.y+(move.y+move.height+1.2)*box.width/8};
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...from,id:1}]});
    await page.waitForTimeout(100);
    for(let step=1;step<=10;step++){
      await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:from.x+(to.x-from.x)*step/10,y:from.y+(to.y-from.y)*step/10,id:1}]});
      await page.waitForTimeout(20);
    }
    await page.waitForTimeout(150);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await page.waitForFunction(rev=>window.demo.store.state.game.revision>rev,move.revision);
    events.push({...move,t:(await page.evaluate(()=>Date.now()/1000))-start,theme:await page.evaluate(()=>window.demo.store.state.wardrobe?.selected??0),rhythm:await page.evaluate(()=>window.demo.store.state.game.rhythm),occupied:await page.evaluate(()=>window.demo.store.state.game.board.filter(Boolean).length)});
    await page.waitForTimeout(move.allClear?1000:400);
    if(move.allClear)await page.screenshot({path:dir+`/clear-${turn}.png`});
    await page.waitForTimeout(move.allClear?800:150);
  }
  await page.waitForTimeout(2200);
  const result = await page.evaluate(
    () =>
      new Promise((resolve) => {
        window.soundRecorder.onstop = async () => {
          const bytes = new Uint8Array(
            await new Blob(window.soundChunks).arrayBuffer(),
          );
          let s = "";
          for (let i = 0; i < bytes.length; i += 32768)
            s += String.fromCharCode(...bytes.subarray(i, i + 32768));
          resolve(btoa(s));
        };
        window.soundRecorder.stop();
      }),
  );
  const end = await page.evaluate(() => Date.now() / 1000);
  await cdp.send("Page.stopScreencast");
  await Promise.all(writes);
  await fs.writeFile(dir + "/audio.webm", Buffer.from(result, "base64"));
  await fs.writeFile(
    dir + "/timing.json",
    JSON.stringify({ start, end, frames, events }, null, 2),
  );
  console.log(
    JSON.stringify({ duration: end - start, frames: frames.length, events }),
  );
} finally {
  await browser.close();
  await server.close();
}
