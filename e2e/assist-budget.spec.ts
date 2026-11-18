import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs/promises";

async function saved(page: Page) {
  return page.evaluate(async () => {
    const { IndexedSave } = await import("/src/platform/save.ts");
    return (await new IndexedSave().load()).profile;
  });
}
async function capturePanel(page: Page) {
  await page.locator("#pause").click();
  await page.locator(".advanced-settings > summary").click();
  await page.getByText("Запись партии для разбора", { exact: true }).click();
}

for (const width of [320, 390]) test(`manual budget choice keeps style/save and default control at ${width}`, async ({ page }, info) => {
  await page.setViewportSize({width,height:844});
  await page.goto("/");await page.locator("#lesson-skip").click();
  expect((await saved(page)).game.dealerVersion).toBe("director-challenge-v2");
  await page.locator("#pause").click();await page.locator("#restart").click();
  await page.getByText("Другие варианты выдачи",{exact:true}).click();
  await page.locator("#dealer-choice").selectOption("director-budget-v1");
  const contrast=await page.locator("#dealer-choice").evaluate(e=>{
    const s=getComputedStyle(e),luminance=(c:string)=>{
      const rgb=c.match(/[\d.]+/g)!.slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});
      return rgb[0]!*.2126+rgb[1]!*.7152+rgb[2]!*.0722;
    };
    const a=luminance(s.color),b=luminance(s.backgroundColor);return(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
  });
  expect(contrast).toBeGreaterThanOrEqual(4.5);
  await page.screenshot({path:info.outputPath("budget-choice.png")});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.locator("#new-game").click();await expect(page.locator("dialog")).not.toBeVisible();
  const p=await saved(page);expect(p.game.dealerVersion).toBe("director-budget-v1");
  expect(p.game.assistBudget.left).toBe(5);expect(p.experiment.manualDealer).toBe("director-budget-v1");
  expect(p.experiment.assignment).toBeUndefined();
  await page.reload();expect((await saved(page)).game).toEqual(p.game);
});

test("actual refill worker commits one credit and exports the final decision only after save", async ({page}, info) => {
  await page.addInitScript(()=>{
    const Native=Worker;(window as any).budgetWorkerRequests=[];
    window.Worker=class extends Native {
      moveWorker=false;
      constructor(url: string | URL,opts?:WorkerOptions){super(url,opts);this.moveWorker=String(url).includes("move.worker");}
      postMessage(message:any,options?:any){if(this.moveWorker)(window as any).budgetWorkerRequests.push({capture:message.captureDecision,policy:message.state.dealerVersion});super.postMessage(message,options);}
    };
  });
  await page.goto("/");await expect(page.locator("#app")).not.toHaveAttribute("aria-busy","true");
  const fixture=await page.evaluate(async ()=>{
    const {syntheticContexts}=await import("/scripts/assist-budget/contexts.ts");const contexts=syntheticContexts();
    const {IndexedSave}=await import("/src/platform/save.ts");
    const {applyMove}=await import("/src/core/rules.ts");
    const {freshAssistBudget}=await import("/src/core/assist-budget.ts");
    const a=new IndexedSave(),p=(await a.load()).profile;
    for(const c of contexts){const b=c.before as any;if(!b.state)continue;const g=structuredClone(b.state);
      g.dealerVersion="director-budget-v1";g.assistBudget=freshAssistBudget();g.moves=60;
      g.goalDirector={...g.goalDirector,deals:20};delete g.dealerDiagnostic;delete g.openingId;
      const r=applyMove(g,b.move,g.revision,true);if(!r?.decision?.assistance?.applied)continue;
      p.revision++;p.tutorialStep=4;p.hint=null;p.best=p.progressionBest=10000000;
      p.settings={...p.settings,sound:false,calm:true};p.game=g;
      await a.write(p);return {move:b.move,expected:r.state.assistBudget};
    }throw Error("No spending fixture");
  });
  await page.reload();await expect(page.locator("#app")).not.toHaveAttribute("aria-busy","true");
  await capturePanel(page);await page.locator("#play-capture-toggle").click();await page.locator("#resume").click();
  await page.locator(`[data-slot="${fixture.move.slot}"]`).click();
  const board=(await page.locator("#board").boundingBox())!;
  await page.locator("#board").click({position:{x:(fixture.move.x+.25)*board.width/8,y:(fixture.move.y+.25)*board.height/8}});
  await expect.poll(async()=> (await saved(page)).game.moves).toBe(61);
  const after=(await saved(page)).game;expect(after.assistBudget).toEqual(fixture.expected);
  expect(await page.evaluate(()=>(window as any).budgetWorkerRequests)).toContainEqual({capture:true,policy:"director-budget-v1"});
  await capturePanel(page);const pending=page.waitForEvent("download");await page.locator("#play-capture-export").click();
  const file=await pending,path=info.outputPath("budget-record.json");await file.saveAs(path);
  const record=JSON.parse(await fs.readFile(path,"utf8"));
  const move=record.events.find((e:any)=>e.kind==="move");expect(move.decision.assistance.applied).toBe(true);
  expect(move.decision.assistance.before.left).toBe(5);expect(move.decision.assistance.after.left).toBe(4);
  const replay=await page.evaluate(async record=>{
    const {replayRecord}=await import("/scripts/calibration/replay.ts");
    return replayRecord(record).final;
  },record);expect(replay).toEqual(after);
  await page.reload();expect((await saved(page)).game.assistBudget).toEqual(fixture.expected);
});
