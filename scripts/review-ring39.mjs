import {createServer} from 'vite';
import {chromium} from 'playwright';
import fs from 'node:fs/promises';
const dir='/workspace/scratch/review39';await fs.mkdir(dir,{recursive:true});
const server=await createServer({server:{port:5195,host:'127.0.0.1'}});await server.listen();
const browser=await chromium.launch();
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});
 await page.goto('http://127.0.0.1:5195');await page.waitForFunction(()=>document.querySelector('#app')?.getAttribute('aria-busy')!=='true');
 await page.evaluate(async()=>{const {IndexedSave}=await import('/src/platform/save.ts');const {newGame}=await import('/src/core/rules.ts');const s=new IndexedSave(),p=(await s.load()).profile;p.revision++;p.tutorialStep=4;p.best=p.progressionBest=100000;p.settings.calm=false;p.game={...newGame(77,'ring','flow-v3'),scoringVersion:'festival-v4'};p.game.tray=[0,1,2].map(i=>({shapeId:'S1-0',color:i+1,used:false}));for(let i=1;i<8;i++)p.game.board[i]=1;p.wardrobe={selected:0,unlocked:[0],discoveries:1};await s.write(p);});
 await page.reload();await page.waitForFunction(()=>document.querySelector('#app')?.getAttribute('aria-busy')!=='true');await page.locator('[data-slot="0"]').click();await page.locator('#board').click({position:{x:4,y:4}});await page.waitForSelector('.festival-rear path');
 for(let n=0;n<3;n++){await page.waitForTimeout(400);await page.screenshot({path:dir+`/ring-${n}.png`});}
 console.log(dir);
}finally{await browser.close();await server.close();}
