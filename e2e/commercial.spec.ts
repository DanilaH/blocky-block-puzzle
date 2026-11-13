import {test,expect,type Page} from "@playwright/test";
import fs from "node:fs";
const fixtures=JSON.parse(fs.readFileSync(new URL("../tests/fixtures/revive-regressions.json",import.meta.url),"utf8"));
async function saved(page:Page){return page.evaluate(async()=>{const {IndexedSave}=await import('/src/platform/save.ts');return (await new IndexedSave().load()).profile;});}
async function sdk(page:Page){
  await page.route('**/src/platform/ads.ts',async route=>{
    const response=await route.fetch(),body=await response.text();
    const replacement=`export function nativeAds(){const listeners={};window.commercialShows=[];return {
      initialize:async()=>({enabled:true}),status:async()=>({rewarded:true,interstitial:true}),pending:async()=>({rewards:[]}),acknowledge:async()=>{},preload:async()=>{},context:async()=>{},
      addListener:async(n,f)=>{listeners[n]=f;return {remove:async()=>{}}},geometry:async()=>{throw Error('mock has no banner')},banner:async()=>{},
      show:async p=>{window.commercialShows.push(p);const r={id:'receipt-'+p.intentId,intentId:p.intentId};listeners.reward?.(r);listeners.reward?.(r);return {status:'closed',shown:true,rewards:[r]}}
    };}`;
    await route.fulfill({response,body:body.replace(/export function nativeAds\(\) \{[\s\S]*?\n\}/,replacement)});
  });
}
test("revive freezes the repaired human zone before the offer and completes the old tray with correlated reward",async({page})=>{
  await sdk(page);await page.goto('/');await page.locator('#lesson-skip').click();
  const state=fixtures.find((c:any)=>c.name==='human-2').state;
  await page.evaluate(async g=>{const {IndexedSave}=await import('/src/platform/save.ts');const save=new IndexedSave(),p=(await save.load()).profile;await save.write({...p,revision:p.revision+1,game:g,best:g.score,tutorialStep:4,metrics:undefined});},state);
  await page.reload();await expect(page.locator('#watch-reward')).toBeVisible();
  const offered=await saved(page);
  expect([offered.game.reviveOffer.selection.x,offered.game.reviveOffer.selection.y]).toEqual([5,5]);
  expect(offered.game.reviveOffer.deadline-Date.now()).toBeGreaterThan(3500);
  await page.locator('#watch-reward').click();
  await expect.poll(async()=>(await saved(page)).game.reviveUsed).toBe(true);
  const revived=await saved(page),plan=revived.ads.intents[0].plan;
  const calls=await page.evaluate(()=>window.commercialShows);
  expect(calls[0].context.offerId).toBe(offered.game.reviveOffer.id);
  expect(calls[0].context.gameId).toBe(state.gameId);
  expect(revived.ads.receipts).toHaveLength(1);
  for(const m of plan.selection.witness){
    const before=(await saved(page)).game.moves;
    await page.locator(`#tray button[data-slot="${m.slot}"]`).click();
    const b=(await page.locator('#board').boundingBox())!;
    await page.locator('#board').click({position:{x:(m.x+.15)*b.width/8,y:(m.y+.15)*b.height/8}});
    await expect.poll(async()=>(await saved(page)).game.moves).toBe(before+1);
  }
  expect((await saved(page)).game.rhythm.recoveryDeals).toBe(2);
  const milestones=await page.evaluate(()=>window.__blockyAnalytics.snapshot().filter(e=>e.name==='post_revive_checkpoint').map(e=>e.params.milestone));
  expect(milestones).toEqual(expect.arrayContaining(['first_move','old_tray_completed']));
  await page.reload();expect((await saved(page)).game.reviveUsed).toBe(true);
});
test("manual candidate starts only a new game, survives reload and never creates audience assignment",async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/');await page.locator('#lesson-skip').click();
  const original=(await saved(page)).game;
  await page.locator('#pause').click();await page.locator('#restart').click();await page.getByText('Экспериментальная выдача',{exact:true}).click();
  await page.locator('#dealer-choice').selectOption('composition-v1');await page.locator('#keep-game').click();
  expect((await saved(page)).game).toEqual(original);
  await page.locator('#pause').click();await page.locator('#restart').click();await page.getByText('Экспериментальная выдача',{exact:true}).click();await page.locator('#dealer-choice').selectOption('composition-v1');await page.locator('#new-game').click();
  await expect(page.locator('dialog')).not.toBeVisible();await page.reload();
  const p=await saved(page);expect(p.game.dealerVersion).toBe('composition-v1');expect(p.game.comparisonMode).toBe('manual');expect(p.experiment.assignment).toBeUndefined();
  await page.locator('#pause').click();await page.locator('.advanced-settings > summary').click();await page.getByText('Запись партии для разбора',{exact:true}).click();
  await expect(page.locator('#play-capture-policy')).toContainText('Разнообразные формы');
});
