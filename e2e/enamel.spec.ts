import { test, expect } from '@playwright/test';
for (const viewport of [{width:320,height:480},{width:320,height:568},{width:568,height:320},{width:390,height:844}]) {
  test(`long series and last-chance label fit enamel capsule ${viewport.width}x${viewport.height}`, async ({page})=>{
    await page.setViewportSize(viewport);await page.goto('/');
    await page.locator('#board canvas').waitFor();
    await page.waitForFunction(()=>!document.querySelector<HTMLElement>('#app')!.inert);
    for(const misses of [0,1,2]) {
      await page.evaluate(async misses=>{
        const {IndexedSave}=await import('/src/platform/save.ts');
        const {newGame}=await import('/src/core/rules.ts');
        const a=new IndexedSave(),p=(await a.load()).profile;
        p.revision++;p.tutorialStep=4;p.best=2000000;p.festivalBest=2000000;
        p.game={...newGame(1234,'enamel-bounds'),moves:1000,score:1234567,streak:999,streakMisses:misses,scoringVersion:'festival-v3'};
        await a.write(p);
      },misses);
      await page.reload();await expect(page.locator('#combo-hud')).toHaveClass(/visible/);
      await page.waitForTimeout(500);
      const bounds=await page.evaluate(()=>{
        const hud=document.querySelector('#combo-hud')!.getBoundingClientRect();
        const title=document.querySelector('#combo-title')!.getBoundingClientRect();
        const stock=document.querySelector('#combo-stock')!.getBoundingClientRect();
        const board=document.querySelector('#board')!.getBoundingClientRect();
        return {fits:[title,stock].every(r=>r.left>=hud.left-1&&r.right<=hud.right+1&&r.top>=hud.top-2&&r.bottom<=hud.bottom+2),above: hud.bottom<=board.top,onscreen:hud.left>=0&&hud.right<=innerWidth&&hud.top>=0};
      });
      expect(bounds).toEqual({fits:true,above:true,onscreen:true});
    }
  });
}
