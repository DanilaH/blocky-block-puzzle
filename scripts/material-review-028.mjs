import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
const out='docs/qa/materials-0.28'; await fs.mkdir(out,{recursive:true});
const server=await createServer({server:{host:'127.0.0.1',port:5195,strictPort:true}});await server.listen();
const browser=await chromium.launch();
const errors=[];const observations=[];
try {const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5195');await page.waitForFunction(()=>!document.querySelector('#app').inert);
 await page.evaluate(async()=>{const {IndexedSave}=await import('/src/platform/save.ts');const {newGame}=await import('/src/core/rules.ts');const a=new IndexedSave(),p=(await a.load()).profile;p.revision++;p.tutorialStep=4;p.best=p.festivalBest=100000;p.game={...newGame(1234,'material-review'),moves:10,score:25300,scoringVersion:'festival-v3'};p.game.tray=[{shapeId:'L3-0',color:2,used:false},{shapeId:'S1-0',color:3,used:false},{shapeId:'O2-0',color:5,used:false}];for(let y=0;y<8;y++)for(let x=0;x<8;x++)if(y>4||(x<2&&y>1)||(x>5&&y>2))p.game.board[y*8+x]=Math.floor(x/2+y/2)%6+1;await a.write(p);});
 for(const [name,series]of [['plastic',0],['enamel',6],['chrome',20]]){
  await page.goto('http://127.0.0.1:5195/?themeSeries='+series);await page.waitForFunction(()=>!document.querySelector('#app').inert);await page.waitForTimeout(1400);
  await page.screenshot({path:`${out}/${name}.png`});
  observations.push(await page.evaluate(name=>({name,material:document.documentElement.dataset.tileMaterial,images:[...document.querySelectorAll('.mini-cell')].map(i=>({loaded:i.complete&&i.naturalWidth>0,opacity:getComputedStyle(i).opacity})),overflow:document.documentElement.scrollWidth>innerWidth}),name));
 }
 await page.setViewportSize({width:844,height:390});await page.waitForTimeout(350);await page.screenshot({path:`${out}/chrome-landscape.png`});
 observations.push({errors});
 await fs.writeFile(`${out}/observations.json`,JSON.stringify(observations,null,2));
}finally{await browser.close();await server.close();}
