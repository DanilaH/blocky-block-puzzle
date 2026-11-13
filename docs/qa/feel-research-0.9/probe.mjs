import {chromium} from 'playwright';import fs from 'node:fs/promises';
const b=await chromium.launch(),c=await b.newContext({viewport:{width:390,height:844}}),p=await c.newPage(),results=[];
await p.goto('http://127.0.0.1:5173');await p.locator('#board canvas').waitFor();
for(const kind of ['place','line','cross','record','allClear','slow-save','rapid']){
 await p.evaluate(async(kind)=>{const {IndexedSave}=await import('/src/platform/save.ts'),{createProfile}=await import('/src/core/profile.ts'),{newGame}=await import('/src/core/rules.ts');const a=new IndexedSave(),old=await a.load(),q=createProfile(newGame(1234,'feel-research'));q.revision=old.profile.revision+1;q.tutorialStep=4;q.best=kind==='record'?5:1000;q.game.tray=[0,1,2].map(i=>({shapeId:'S1-0',color:i+1,used:false}));if(!['place','slow-save'].includes(kind)){for(let i=1;i<8;i++)q.game.board[i]=i%6+1;if(kind==='cross')for(let i=1;i<8;i++)q.game.board[i*8]=i%6+1;if(kind!=='allClear')q.game.board[63]=3;}await a.write(q)},kind);
 await p.reload();await p.locator('#board canvas').waitFor();
 await p.evaluate(async(kind)=>{window.trace=[];const log=(event,info={})=>window.trace.push({event,t:performance.now(),...info});const {GameAudio}=await import('/src/game/audio.ts'),{BoardScene}=await import('/src/game/BoardScene.ts'),{IndexedSave}=await import('/src/platform/save.ts');const audio=GameAudio.prototype.play,impact=BoardScene.prototype.impact,write=IndexedSave.prototype.write;
 GameAudio.prototype.play=function(kind,streak){log('audio',{kind,streak});return audio.call(this,kind,streak)};
 BoardScene.prototype.impact=function(...args){log('impact',{lines:args[3],allClear:args[4]});return impact.apply(this,args)};
 IndexedSave.prototype.write=async function(q){log('write-start');if(kind==='slow-save')await new Promise(r=>setTimeout(r,300));await write.call(this,q);log('write-end')};
 document.querySelector('#board').addEventListener('pointerdown',()=>log('board-down'),true);
 },kind);
 await p.locator('.piece').first().click();await p.locator('#board').click({position:{x:10,y:10}});
 if(kind==='slow-save'){await p.waitForTimeout(100);await p.screenshot({path:new URL('slow-save-pending.png',import.meta.url).pathname});}
 await p.waitForFunction(()=>window.trace.some(x=>x.event==='impact'));
 if(kind==='rapid'){await p.waitForTimeout(100);await p.locator('.piece').nth(1).click();await p.locator('#board').click({position:{x:60,y:60}});await p.waitForFunction(()=>window.trace.filter(x=>x.event==='impact').length===2);}
 await p.waitForTimeout(90);await p.screenshot({path:new URL(`${kind}.png`,import.meta.url).pathname});
 const trace=await p.evaluate(()=>window.trace),first=trace.find(x=>x.event==='board-down').t;results.push({kind,trace:trace.map(x=>({...x,t:Math.round((x.t-first)*10)/10})),score:await p.locator('#score').textContent(),reward:await p.locator('#burst').textContent()});
}
await fs.writeFile(new URL('results.json',import.meta.url),JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));await b.close();
