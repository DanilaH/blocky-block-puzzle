import { it, expect, vi } from "vitest";
import fs from "node:fs";
import { createProfile, type Profile } from "../src/core/profile";
import { applyReceipt, prepareReward, revivePlan, finishAttempt, claimRevive } from "../src/core/monetization";
import { startReviveOffer, acceptReviveOffer } from "../src/core/revive-offer";
import { applyMove, newGame, type GameState } from "../src/core/rules";
import { ProfileStore } from "../src/platform/save";
import { ProductAnalytics } from "../src/platform/analytics";
import { AdsController, type AdBridge } from "../src/platform/ads";
const fixtures=JSON.parse(fs.readFileSync(new URL("./fixtures/revive-regressions.json",import.meta.url),"utf8"));
function harness(p:Profile) {
  let fail=false;
  const analytics=new ProductAnalytics(null,()=>0);
  const store=new ProfileStore(p,{load:async()=>({profile:p,recovered:false}),write:async()=>{if(fail)throw Error("disk");}});
  store.observer=analytics;
  return {store,analytics,fail:(v:boolean)=>{fail=v},events:(name:string)=>analytics.snapshot().filter(e=>e.name===name)};
}
it("measures real continuation milestones only after atomic moves and survives reload", async()=>{
  let g=structuredClone(fixtures.find((c:any)=>c.name==="human-2").state) as GameState;
  g=startReviveOffer(g,0,revivePlan(g));g=acceptReviveOffer(g,1);
  const h=harness(prepareReward({...createProfile(g),best:g.score,tutorialStep:4},"intent","revive"));
  await h.store.update(p=>applyReceipt(p,{id:"r",intentId:"intent"}));
  const plan=h.store.state.ads!.intents[0]!.plan!;
  for(const m of plan.selection!.witness){
    const before=structuredClone(h.store.state), next=applyMove(before.game,m,before.game.revision)!;
    h.fail(true);await expect(h.store.update(p=>({...p,revision:p.revision+1,game:next.state}))).rejects.toThrow();
    expect(h.store.state).toEqual(before);
    h.fail(false);await h.store.update(p=>({...p,revision:p.revision+1,game:next.state,best:Math.max(p.best,next.state.score)}));
  }
  expect(h.events("post_revive_checkpoint").map(e=>e.params.milestone)).toEqual(["first_move","old_tray_completed"]);
  const restored=harness(JSON.parse(JSON.stringify(h.store.state)));
  await restored.store.update(p=>({...p,revision:p.revision+1,settings:{...p.settings,calm:true}}));
  expect(restored.events("post_revive_checkpoint")).toHaveLength(0);
});
it("separates terminal closure and late earned reopening; old game_end is retained", async()=>{
  const g=structuredClone(fixtures[0].state) as GameState;
  const h=harness(prepareReward({...createProfile(g),best:g.score,tutorialStep:4},"late","revive"));
  await h.store.update(p=>finishAttempt(p));
  expect(h.events("run_closed")).toHaveLength(1);
  await h.store.update(p=>({...p,revision:p.revision+1,game:newGame(1,"new")}));
  await h.store.update(p=>applyReceipt(p,{id:"earned",intentId:"late"}));
  expect(h.store.state.game.gameId).toBe("new");
  await h.store.update(p=>claimRevive(p,"late"));
  expect(h.events("run_reopened")).toHaveLength(1);
  expect(h.store.state.metrics!.episode).toBe(2);
  expect(h.store.state.metrics!.closed).toBe(false);
  expect(h.events("reward_applied").at(-1)!.params.intentId).toBe("late");
});
it("records all interstitial blockers once; not-ready is never inferred to be no-fill",async()=>{
  const g=fixtures[0].state as GameState,h=harness({...createProfile(g),best:g.score});
  const show=vi.fn(), bridge={initialize:async()=>({enabled:true}),pending:async()=>({rewards:[]}),status:async()=>({rewarded:false,interstitial:false,busy:true}),preload:async()=>{},addListener:async()=>({remove:async()=>{}}),show} as unknown as AdBridge;
  const ads=new AdsController(h.store,bridge,()=>{},()=>{},()=>{},h.analytics);
  await ads.init();await ads.finishGame();await ads.finishGame();
  expect(h.events("interstitial_eligibility")).toHaveLength(1);
  const reasons=String(h.events("interstitial_eligibility")[0]!.params.reasons).split(",");
  expect(reasons).toEqual(expect.arrayContaining(["tutorial","too_few_finished_runs","cooldown","busy","not_ready"]));
  expect(reasons).not.toContain("no_fill");expect(show).not.toHaveBeenCalled();
});
it("does not close or request an interstitial if a late reward changes the game during readiness",async()=>{
  const g=structuredClone(fixtures[0].state) as GameState;
  const h=harness(prepareReward({...createProfile(g),best:g.score,tutorialStep:4},"racing","revive"));
  const show=vi.fn(),bridge={initialize:async()=>({enabled:true}),pending:async()=>({rewards:[]}),status:async()=>{
    await h.store.update(p=>applyReceipt(p,{id:"late",intentId:"racing"}));return {interstitial:true,rewarded:false};
  },preload:async()=>{},addListener:async()=>({remove:async()=>{}}),show} as unknown as AdBridge;
  const ads=new AdsController(h.store,bridge,()=>{},()=>{},()=>{},h.analytics);
  await ads.init();expect(await ads.finishGame()).toBe(false);
  expect(h.store.state.game.status).toBe("playing");expect(show).not.toHaveBeenCalled();
  expect(h.events("interstitial_eligibility")).toHaveLength(0);
});
