import {test,expect,type Page} from '@playwright/test';
import fs from 'node:fs';
const fixtures=JSON.parse(fs.readFileSync(new URL('./fixtures/classic-upgrade-071.json',import.meta.url),'utf8'));
async function saved(page:Page){return page.evaluate(async()=>{const {IndexedSave}=await import('/src/platform/save.ts');return (await new IndexedSave().load()).profile!;});}
async function loadOld(page:Page,fixture:any,over=false){
 await page.goto('/');await expect(page.locator('#app')).not.toHaveAttribute('aria-busy','true');
 await page.evaluate(async({profile,over})=>{
  const {IndexedSave}=await import('/src/platform/save.ts');const a=new IndexedSave(),current=(await a.load()).profile!;
  const p=structuredClone(profile);p.revision=current.revision+1;
  if(over){p.game={...p.game,status:'over',board:Array(64).fill(1),moves:p.game.moves+1,revision:p.game.revision+1};}
  await a.write(p);
 },{profile:fixture.profile,over});await page.reload();await expect(page.locator('#app')).not.toHaveAttribute('aria-busy','true');
}
for(const width of [320,844])test(`ordinary new game uses selected v2 without opening variants at ${width}`,async({page},info)=>{
 await page.setViewportSize({width,height:width===320?640:390});await page.goto('/');await page.locator('#lesson-skip').click();
 const first=await saved(page);expect(first.game.dealerVersion).toBe('director-challenge-v2');expect(first.game.comparisonMode).toBe('default');
 expect(first.experiment!.assignment).toBeUndefined();expect(first.game.challengeV2State!.variant).toBe('full');
 await page.locator('#pause').click();await page.locator('#restart').click();
 expect(await page.locator('#dealer-choice').inputValue()).toBe('director-challenge-v2');
 const button=(await page.locator('#new-game').boundingBox())!;expect(button.y).toBeGreaterThanOrEqual(0);expect(button.y+button.height).toBeLessThanOrEqual(width===320?640:390);
 await page.screenshot({path:info.outputPath('ordinary-new-game.png')});
 await page.locator('#new-game').click();await expect(page.locator('dialog')).not.toBeVisible();
 const next=await saved(page);expect(next.game.dealerVersion).toBe('director-challenge-v2');expect(next.experiment!.manualDealer).toBeUndefined();
 expect(first.experiment!.challengeOpeningHistory).not.toContain(next.game.challengeV2State!.openingKey);
 await page.reload();expect((await saved(page)).game).toEqual(next.game);
});
for(const fixture of fixtures.cases)test(`actual 0.71 source save ${fixture.name} continues with earned rights, then starts default v2`,async({page})=>{
 expect(fixtures.source).toBe('5be1d7b2bca92683593265fa2ab346c4eb173015');await loadOld(page,fixture);
 const old=await saved(page);expect(old.game).toEqual(fixture.profile.game);expect(old.earnedHints).toBe(5);expect(old.freeHints).toBe(1);expect(old.ads!.receipts).toEqual(fixture.profile.ads.receipts);
 await page.reload();expect((await saved(page)).game).toEqual(old.game);
 const noDuplicate=await page.evaluate(async p=>{const {applyReceipt}=await import('/src/core/monetization.ts');return applyReceipt(p,{id:'synthetic-old-hints-receipt',intentId:'synthetic-old-hints'});},old);expect(noDuplicate).toEqual(old);
 const move=fixture.nextMove;await page.locator(`#tray button[data-slot="${move.slot}"]`).click();
 const b=(await page.locator('#board').boundingBox())!;await page.locator('#board').click({position:{x:(move.x+.25)*b.width/8,y:(move.y+.25)*b.height/8}});
 await expect.poll(async()=>(await saved(page)).game.moves).toBe(fixture.expectedNext.moves);
 const played=await saved(page);for(const k of ['board','score','reviveUsed'])expect((played.game as any)[k]).toEqual(fixture.expectedNext[k]);
 expect(played.game.rhythm?.recoveryDeals).toBe(fixture.expectedNext.recoveryDeals);expect(played.earnedHints).toBe(5);
 await page.locator('#pause').click();await page.locator('#restart').click();await page.locator('#keep-game').click();expect((await saved(page)).game).toEqual(played.game);
 await page.locator('#pause').click();await page.locator('#restart').click();await page.locator('#new-game').click();await expect(page.locator('dialog')).not.toBeVisible();
 const next=await saved(page);expect(next.game.dealerVersion).toBe('director-challenge-v2');expect(next.game.comparisonMode).toBe('default');expect(next.experiment!.manualDealer).toBeUndefined();
 expect(next.freeHints).toBe(1);expect(next.earnedHints).toBe(5);expect(next.settings).toEqual(old.settings);expect(next.ads!.receipts).toEqual(old.ads!.receipts);
});
for(const over of [false,true])test(`failed default restart is atomic for game/history/manual choice; over=${over}`,async({page})=>{
 await loadOld(page,fixtures.cases[over?1:0],over);const old=await saved(page);
 await page.evaluate(()=>{const put=IDBObjectStore.prototype.put;(window as any).rejectNewGame=true;IDBObjectStore.prototype.put=function(value,key){if(key==='current'&&(window as any).rejectNewGame&&value.game.gameId!=='synthetic-upgrade-0'&&value.game.gameId!=='synthetic-upgrade-1')throw new DOMException('Injected quota','QuotaExceededError');return put.call(this,value,key);};});
 if(!over){await page.locator('#pause').click();await page.locator('#restart').click();}
 const action=page.locator(over?'#again':'#new-game');await action.click();await expect(page.locator('.dialog-status')).toContainText('Не удалось сохранить');
 const failed=await saved(page);expect(failed.game).toEqual(old.game);expect(failed.experiment).toEqual(old.experiment);expect(failed.earnedHints).toBe(old.earnedHints);
 await page.evaluate(()=>{(window as any).rejectNewGame=false;});await action.click();await expect(page.locator('dialog')).not.toBeVisible();
 const next=await saved(page);expect(next.game.dealerVersion).toBe('director-challenge-v2');expect(next.experiment!.manualDealer).toBeUndefined();expect(next.experiment!.challengeOpeningHistory).toEqual([next.game.challengeV2State!.openingKey]);
});
