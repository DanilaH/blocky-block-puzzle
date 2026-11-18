import {test,expect} from '@playwright/test';

for(const shapeId of ['LJ4-0','D2-0'])test(`${shapeId}: actual visible tray, accepted worker refill, save and reload`,async({page},info)=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/');
 await expect(page.locator('#app')).not.toHaveAttribute('aria-busy','true');
 await page.evaluate(async(shapeId)=>{
  const {newGame}=await import('/src/core/rules.ts'),{createProfile,validProfile}=await import('/src/core/profile.ts'),{IndexedSave}=await import('/src/platform/save.ts');
  const g=newGame(42,'synthetic-reference-placement','director-shapes-v1');
  g.board=Array(64).fill(0);g.moves=g.revision=2;g.tray=[{shapeId,color:2,used:false},{shapeId:'S1-0',color:1,used:true},{shapeId:'S1-0',color:1,used:true}];
  const save=new IndexedSave(),old=(await save.load()).profile!,p={...createProfile(g),tutorialStep:4,revision:old.revision+1};if(!validProfile(p))throw Error('Invalid synthetic fixture');await save.write(p);
 },shapeId);
 await page.reload();await expect(page.locator('#app')).not.toHaveAttribute('aria-busy','true');
 await page.screenshot({path:info.outputPath('new-shape-before.png')});
 await page.locator('[data-slot="0"]').click();
 const board=await page.locator('#board').boundingBox();await page.locator('#board').click({position:{x:board!.width*2.5/8,y:board!.height*3.5/8}});
 const read=()=>page.evaluate(async()=>{const {IndexedSave}=await import('/src/platform/save.ts');return(await new IndexedSave().load()).profile!.game;});
 await expect.poll(async()=>(await read()).moves).toBe(3);
 const after=await read();expect(after.dealerVersion).toBe('director-shapes-v1');
 expect(after.board.filter(Boolean)).toHaveLength(shapeId==='D2-0'?2:4);
 expect(after.tray.every(s=>!s.used)).toBe(true);
 await page.reload();await expect(page.locator('#app')).not.toHaveAttribute('aria-busy','true');expect(await read()).toEqual(after);
 await page.screenshot({path:info.outputPath('new-shape-after.png')});
});
