// Visual QA recording only: DEV theme changes do not alter saved combo/score.
import {createServer} from 'vite';
import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const out='docs/qa/materials-0.28';await fs.mkdir(out,{recursive:true});
const server=await createServer({server:{host:'127.0.0.1',port:5195,strictPort:true}});await server.listen();
const browser=await chromium.launch();
try {
 const context=await browser.newContext({viewport:{width:390,height:844},recordVideo:{dir:'/tmp/blocky-material-motion',size:{width:390,height:844}}});
 const started=Date.now(),page=await context.newPage();
 await page.goto('http://127.0.0.1:5195/?themeSeries=0');await page.waitForFunction(()=>!document.querySelector('#app').inert);
 await page.evaluate(async()=>{const {IndexedSave}=await import('/src/platform/save.ts');const {newGame}=await import('/src/core/rules.ts');const a=new IndexedSave(),p=(await a.load()).profile;p.revision++;p.tutorialStep=4;p.best=p.festivalBest=100000;p.game={...newGame(1234,'material-motion'),moves:10,score:25300,scoringVersion:'festival-v3'};p.game.tray=[{shapeId:'L3-0',color:2,used:false},{shapeId:'S1-0',color:3,used:false},{shapeId:'O2-0',color:5,used:false}];for(let y=0;y<8;y++)for(let x=0;x<8;x++)if(y>4||(x<2&&y>1)||(x>5&&y>2))p.game.board[y*8+x]=Math.floor(x/2+y/2)%6+1;await a.write(p);});
 await page.reload();await page.waitForFunction(()=>!document.querySelector('#app').inert);await page.waitForTimeout(500);
 const clipStart=(Date.now()-started)/1000;
 await page.waitForTimeout(900);
 await page.selectOption('#theme-preview','6');await page.waitForTimeout(2000);
 await page.selectOption('#theme-preview','20');await page.waitForTimeout(2200);
 await page.selectOption('#theme-preview','0');await page.waitForTimeout(2300);
 const video=page.video();await context.close();const source=await video.path();
 execFileSync('ffmpeg',['-y','-ss',String(clipStart),'-i',source,'-filter_complex','fps=10,scale=280:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=256:stats_mode=full[p];[b][p]paletteuse=dither=bayer:bayer_scale=5','-loop','0',`${out}/material-transition.gif`],{stdio:'ignore'});
 console.log(JSON.stringify({file:`${out}/material-transition.gif`,bytes:(await fs.stat(`${out}/material-transition.gif`)).size,clipStart,kind:'actual Chromium recording; DEV theme selector, not a generated concept'}));
}finally{await browser.close();await server.close();}
