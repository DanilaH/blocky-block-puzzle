import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
const server=spawn('npm',['run','dev','--','--port','5187'],{stdio:'ignore'});
let browser;
try{
 for(let i=0;i<80;i++){try{await fetch('http://127.0.0.1:5187');break;}catch{await new Promise(r=>setTimeout(r,100));}}
 browser=await chromium.launch();const page=await browser.newPage({viewport:{width:390,height:844}});
 page.on('pageerror',e=>console.log('PAGEERROR',e.message));
 await page.goto('http://127.0.0.1:5187');await page.locator('#board canvas').waitFor();
 await page.evaluate(async()=>{
 const {IndexedSave}=await import('/src/platform/save.ts');const {newGame}=await import('/src/core/rules.ts');
 const a=new IndexedSave(),p=(await a.load()).profile;p.revision++;p.tutorialStep=4;p.best=100000;p.festivalBest=100000;
 p.game={...newGame(12,'themes-review'),scoringVersion:'festival-v3',streak:2};
 for(let y=3;y<8;y++)for(let x=0;x<8;x++)if((x+y)%3!==0)p.game.board[y*8+x]=(x+y)%6+1;
 p.game.tray=[{shapeId:'S1-0',color:1,used:false},{shapeId:'S1-0',color:2,used:false},{shapeId:'S1-0',color:3,used:false}];
 await a.write(p);});
 const out='docs/qa/evolution-0.20';await fs.mkdir(out,{recursive:true});
 for(const streak of [0,3,6,10,15,20,30,40,50,75,100,125]){
 await page.goto(`http://127.0.0.1:5187/?themeSeries=${streak}`);await page.locator('#board canvas').waitFor();await page.waitForTimeout(1400);
 await page.screenshot({path:`${out}/theme-${streak}.png`});
 }
 for(const [width,height] of [[320,480],[568,320]]){await page.setViewportSize({width,height});await page.waitForTimeout(500);await page.screenshot({path:`${out}/compact-${width}.png`});}
 console.log('Captured 12 themes and 2 compact layouts');
}finally{await browser?.close();server.kill();}
