import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const out=new URL('./',import.meta.url).pathname;
const browser=await chromium.launch();
const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
const p=await context.newPage();
const errors=[];p.on('pageerror',e=>errors.push(e.message));
await p.goto('http://127.0.0.1:5188');await p.locator('#board canvas').waitFor();
const cdp=await context.newCDPSession(p);
const results={layouts:[],touch:[],flows:[],errors};
async function fixture(lesson=4,shape='I5-1',mode='empty'){
 await p.evaluate(async({lesson,shape,mode})=>{
  const {IndexedSave}=await import('/src/platform/save.ts'),{createProfile,dayKey}=await import('/src/core/profile.ts'),R=await import('/src/core/rules.ts');
  const a=new IndexedSave(),old=await a.load(),q=createProfile(R.newGame(1234,'usability-audit'));
  q.revision=old.profile.revision+1;q.tutorialStep=lesson;q.best=1000;q.freeDay=dayKey();
  q.game.tray=[shape,'S1-0','O3-0'].map((shapeId,i)=>({shapeId,color:i+1,used:false}));
  if(mode==='blocked')q.game.board=Array.from({length:64},(_,i)=>(i+Math.floor(i/8))%2?4:0);
  if(mode==='depleted')q.freeHints=0;
  await a.write(q);
 },{lesson,shape,mode});
 await p.reload();await p.locator('#board canvas').waitFor();
}
async function geometry(){return p.evaluate(()=>{
 const rect=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height,font:getComputedStyle(e).fontSize,text:e.textContent,visible:!!r.width&&!!r.height}};
 return Object.fromEntries(['#board','#tray','#hint','#lesson-text','#lesson-skip','#ad-slot','.mini-cell'].map(s=>[s,rect(document.querySelector(s))]));
});}
for(const [w,h,top,bottom] of [[320,480,0,0],[320,480,24,24],[320,568,24,24],[360,640,0,0],[390,844,0,0],[568,320,0,24],[640,360,0,0],[768,1024,0,0]]){
 await p.setViewportSize({width:w,height:h});await cdp.send('Emulation.setSafeAreaInsetsOverride',{insets:{top,bottom,left:0,right:0}});
 for(const lesson of [0,4]){
  await fixture(lesson);await p.waitForTimeout(120);
  results.layouts.push({viewport:[w,h],top,bottom,lesson,geometry:await geometry()});
  if((w===320&&h===480)||w===390||w===568)await p.screenshot({path:out+`layout-${w}x${h}-${top}-${lesson}.png`});
 }
}
await cdp.send('Emulation.setSafeAreaInsetsOverride',{insets:{top:0,bottom:0,left:0,right:0}});
// Actual synthetic touch sequences with a fresh board and four corners.
for(const [w,h] of [[320,480],[390,844],[568,320]]){
 await p.setViewportSize({width:w,height:h});
 for(const [shape,sw,sh] of [['S1-0',1,1],['I5-1',1,5],['I5-0',5,1],['O3-0',3,3]]){
  for(const [x,y] of [[0,0],[8-sw,0],[0,8-sh],[8-sw,8-sh]]){
   await fixture(4,shape);
   const b=await p.locator('#board').boundingBox(),s=await p.locator('.piece').first().boundingBox(),cell=b.width/8;
   const xx=b.x+(x+sw/2)*cell;
   const ys=[];for(let yy=0;yy<h;yy+=.5){const top=yy-(sh+1.2*Math.max(0,Math.min(1,(b.y+b.height-yy)/(2*cell))))*cell;if(Math.round((top-b.y)/cell)===y)ys.push(yy);}
   const yy=ys[Math.floor(ys.length/2)];
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:s.x+s.width/2,y:s.y+s.height/2}]});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:xx,y:yy}]});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
   await p.waitForTimeout(90);
   const saved=await p.evaluate(async()=>{const {IndexedSave}=await import('/src/platform/save.ts');return(await new IndexedSave().load()).profile.game;});
   results.touch.push({viewport:[w,h],shape,target:[x,y],finger:[xx,yy],moves:saved.moves,placed:saved.board.map((v,i)=>v?i:-1).filter(i=>i>=0)});
  }
 }
}
await p.setViewportSize({width:390,height:844});await fixture(0);
for(const move of [{slot:0,x:3,y:4},{slot:1,x:6,y:4},{slot:2,x:2,y:2}]){
 await p.locator('.piece').nth(move.slot).click();const b=await p.locator('#board').boundingBox();
 await p.locator('#board').click({position:{x:(move.x+.4)*b.width/8,y:(move.y+.4)*b.height/8}});await p.waitForTimeout(100);
}
results.flows.push({name:'tutorial finish',text:await p.locator('#lesson').innerText(),score:await p.locator('#score').innerText()});
await p.locator('#lesson-skip').click();
results.flows.push({name:'after tutorial',score:await p.locator('#score').innerText(),lessonHidden:await p.locator('#lesson').isHidden()});
await fixture(4,'I5-1','blocked');
await p.locator('.piece').first().click();await p.screenshot({path:out+'blocked-selected.png'});
results.flows.push({name:'blocked selection',label:await p.locator('.piece').first().getAttribute('aria-label'),disabled:await p.locator('.piece').first().isDisabled(),toast:await p.locator('#toast').innerText()});
await fixture(4,'I5-1','depleted');await p.locator('#hint').click();
results.flows.push({name:'depleted',text:await p.locator('#toast').innerText(),geometry:await geometry()});
await p.screenshot({path:out+'depleted.png'});
await fixture();await p.locator('#hint').click();await p.waitForFunction(()=>document.querySelector('#hint-count').textContent==='2');
await p.locator('#hint').click();results.flows.push({name:'hint repeat',count:await p.locator('#hint-count').innerText(),toast:await p.locator('#toast').innerText()});
await p.reload();await p.locator('#board canvas').waitFor();results.flows.push({name:'hint reload',count:await p.locator('#hint-count').innerText(),hinted:await p.locator('.piece.hinted').count()});
await p.locator('#pause').click();await p.locator('#restart').click();await p.locator('#keep-game').click();results.flows.push({name:'cancel restart',count:await p.locator('#hint-count').innerText(),score:await p.locator('#score').innerText()});
await p.locator('#pause').click();await p.locator('#rules').click();await p.screenshot({path:out+'rules.png'});
results.flows.push({name:'rules focus',focus:await p.evaluate(()=>document.activeElement?.outerHTML.slice(0,150)),scroll:await p.locator('.dialog-body').evaluate(e=>({height:e.clientHeight,scroll:e.scrollHeight}))});
await fs.writeFile(out+'results.json',JSON.stringify(results,null,2));console.log(JSON.stringify({layouts:results.layouts,touchTotal:results.touch.length,touchFailures:results.touch.filter(x=>x.moves!==1),flows:results.flows,errors},null,2));
await browser.close();
