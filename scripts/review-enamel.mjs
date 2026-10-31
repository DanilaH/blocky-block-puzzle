// Actual browser capture; deterministic saved position, real UI placements.
import { createServer } from 'vite';
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const out = 'docs/qa/enamel-ui';
await fs.mkdir(out, {recursive:true});
const server = await createServer({server:{host:'127.0.0.1',port:5187,strictPort:true}});
await server.listen();
try {
  process.env.REVIEW_DIR=out;
  await import('./review-tile-study.mjs');
  const browser=await chromium.launch();
  const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5187');
  await page.waitForFunction(()=>!document.querySelector('#app')?.inert);
  await page.evaluate(async()=>{
    const {IndexedSave}=await import('/src/platform/save.ts');
    const {newGame}=await import('/src/core/rules.ts');
    const a=new IndexedSave(),p=(await a.load()).profile;
    p.revision++;p.best=5800;p.festivalBest=5800;p.tutorialStep=4;p.game=newGame(1234,'enamel-review');
    p.game.moves=10;p.game.streak=3;p.game.score=3460;p.game.scoringVersion='festival-v3';
    p.game.board[25]=2;p.game.board[26]=2;p.game.board[33]=2;p.game.board[34]=2;
    await a.write(p);
  });
  await page.reload();await page.locator('#board canvas').waitFor();
  await page.waitForFunction(()=>!document.querySelector('#app')?.inert);
  await page.waitForTimeout(1200);
  await page.screenshot({path:out+'/combo.png'});
  await page.locator('#pause').click();await page.waitForTimeout(300);
  await page.screenshot({path:out+'/pause.png'});
  await page.setViewportSize({width:568,height:320});await page.waitForTimeout(300);
  await page.screenshot({path:out+'/pause-landscape.png'});
  await browser.close();if(errors.length)throw Error(errors.join('\n'));
  process.env.CAPTURE_DIR='/workspace/scratch/fcab71b1aa53/enamel-capture/';
  process.env.CAPTURE_VERSION='enamel';process.env.CAPTURE_KIND='sequence';
  await import('./record-tile-study.mjs');
} finally { await server.close(); }
