import {test,expect} from '@playwright/test';
test('new installs use the goal director; legacy resume stays exact until a committed restart',async({page})=>{
  await page.goto('/');
  const read=()=>page.evaluate(async()=>{
    const {IndexedSave}=await import('/src/platform/save.ts');return (await new IndexedSave().load()).profile!;
  });
  await expect.poll(async()=>(await read())?.game.dealerVersion).toBe('director-v2');
  await page.evaluate(async()=>{
    const {IndexedSave}=await import('/src/platform/save.ts'),{newGame}=await import('/src/core/rules.ts');
    const save=new IndexedSave(),p=(await save.load()).profile!;p.revision++;p.tutorialStep=4;
    p.game=newGame(701,'legacy-keep','flow-v4');await save.write(p);
  });
  await page.reload();const old=(await read()).game;
  await page.locator('#pause').click();await page.locator('#restart').click();
  await page.locator('#keep-game').click();expect((await read()).game).toEqual(old);
  await page.locator('#pause').click();await page.locator('#restart').click();await page.locator('#new-game').click();
  await expect.poll(async()=>(await read()).game.dealerVersion).toBe('director-v2');
  const current=(await read()).game;expect(current.goalDirector!.version).toBe(2);expect(current.gameId).not.toBe(old.gameId);
  await page.reload();expect((await read()).game).toEqual(current);
});

test('goal cycle survives 36 real placements, worker refills and a saved resume',async({page})=>{
  test.setTimeout(120000);
  await page.goto('/');
  await page.evaluate(async()=>{
    const {IndexedSave}=await import('/src/platform/save.ts'),{newGame}=await import('/src/core/rules.ts');
    const save=new IndexedSave(),p=(await save.load()).profile!;p.revision++;p.tutorialStep=4;
    p.game={...newGame(941001,'goal-ui-cycle','director-v2'),scoringVersion:'festival-v4',seriesBonusVersion:1};await save.write(p);
  });
  await page.reload();const phases=new Set<string>();let rewards=0;
  for(let i=0;i<36;i++){
    await expect(page.locator('#board')).not.toHaveAttribute('aria-busy','true');
    const planned=await page.evaluate(async()=>{
      const {IndexedSave}=await import('/src/platform/save.ts'),{applyMove}=await import('/src/core/rules.ts'),{choose}=await import('/scripts/difficulty/players.ts');
      const g=(await new IndexedSave().load()).profile!.game,move=choose(g.board,g.tray,'clear')!;
      return {move,result:applyMove(g,move,g.revision)!};
    });
    await page.locator(`[data-slot="${planned.move.slot}"]`).click();
    const box=await page.locator('#board').boundingBox();
    await page.locator('#board').click({position:{x:(planned.move.x+.5)*box!.width/8,y:(planned.move.y+.5)*box!.height/8}});
    const read=()=>page.evaluate(async()=>{
      const {IndexedSave}=await import('/src/platform/save.ts');return (await new IndexedSave().load()).profile!.game;
    });
    await expect.poll(async()=>(await read()).moves).toBe(i+1);
    expect(await read()).toEqual(planned.result.state);rewards+=Number(planned.result.allClear);
    if((i+1)%3===0)phases.add(planned.result.state.goalDirector!.last);
    await page.waitForTimeout(60);
  }
  expect(rewards).toBeGreaterThan(0);expect([...phases]).toEqual(expect.arrayContaining(['load','payoff','rest']));
  const before=await page.evaluate(async()=>{
    const {IndexedSave}=await import('/src/platform/save.ts');return (await new IndexedSave().load()).profile!.game;
  });
  await page.reload();
  await expect.poll(()=>page.evaluate(async()=>{
    const {IndexedSave}=await import('/src/platform/save.ts');return (await new IndexedSave().load()).profile!.game;
  })).toEqual(before);
});
