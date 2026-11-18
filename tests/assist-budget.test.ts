import { it, expect } from "vitest";
import { syntheticContexts } from "../scripts/assist-budget/contexts";
const contexts=syntheticContexts();
import { budgetDirectorDeal, freshAssistBudget, validAssistBudget, ASSIST_BUDGET_CONFIG } from "../src/core/assist-budget";
import { goalDirectorDeal, initialGoalDirector } from "../src/core/goal-director";
import { initialRhythmV4 } from "../src/core/rhythm";
import { newGame, applyMove, replayDecision, type GameState } from "../src/core/rules";
import { createProfile, validProfile } from "../src/core/profile";
import { ProfileStore } from "../src/platform/save";
import { assignedDealer, ensureExperiment, ASSIST_BUDGET_EXPERIMENT, COMPOSITION_EXPERIMENT } from "../src/core/experiment";
import { chooseMixed } from "../scripts/director/mixed-players";

function spendable() {
  for(const c of contexts) {
    const b=c.before as any;if(!b.state)continue;
    const g=structuredClone(b.state) as GameState;
    g.dealerVersion="director-budget-v1";g.assistBudget=freshAssistBudget();g.moves=60;
    g.goalDirector={...g.goalDirector!,deals:20};delete g.dealerDiagnostic;delete g.openingId;
    const r=applyMove(g,b.move,g.revision,true);
    if(r?.decision?.assistance?.applied)return {g,move:b.move,result:r};
  }
  throw Error("No spending fixture");
}
it("retains all twelve original early deals and all three recovery deals with exhausted credits/cooldown",()=>{
  for(const deals of [0,1,4,11,12,35])for(const recovery of [0,1,2,3]) {
    if(deals>=12&&!recovery)continue;
    const board=Array.from({length:64},(_,i)=>i%13===0?2:0),rhythm={...initialRhythmV4(),recoveryDeals:recovery};
    const saved={...initialGoalDirector(),deals,payoff:2,sinceLoad:4};
    const empty=deals<12?freshAssistBudget():{...freshAssistBudget(),left:0,spent:{reward:5,relief:0},lastAppliedDeal:deals};
    const base=goalDirectorDeal(board,7601001,deals*3,rhythm,saved);
    const next=budgetDirectorDeal(board,7601001,deals*3,rhythm,saved,empty);
    for(const k of ["tray","rngState","witness","director","diagnostic"] as const)expect(next[k]).toEqual(base[k]);
    expect(next.assistBudget).toBe(empty);expect(next.assistDecision.applied).toBe(false);
  }
});
it("spends only a selected different tray with a proved extra reward and replays the final decision",()=>{
  const {g,move,result}=spendable(),a=result.decision!.assistance!;
  expect(a.applied).toBe(true);expect(a.after.left).toBe(a.before.left-1);
  expect(a.alternativeIds).not.toEqual(a.ordinaryIds);
  expect(a.alternative!.allClears>a.ordinary!.allClears||a.alternative!.lines>a.ordinary!.lines).toBe(true);
  expect(g.assistBudget!.left).toBe(5);expect(validProfile({...createProfile(result.state),best:result.state.score})).toBe(true);
  expect(applyMove(g,move,g.revision,true)).toEqual(result);
  expect(replayDecision(result.decision!)).toEqual(result.decision);
  expect(a.work).toBeLessThanOrEqual(24000);
});
it("budget is finite across many full clears, JSON roundtrips and the selected witness",()=>{
  let g=newGame(7601001,"finite","director-budget-v1"),spent=0,previous=5,allClears=0;
  while(g.status==="playing"&&g.moves<180) {
    const move=chooseMixed(g.board,g.tray,"three",0).move!;
    const r=applyMove(g,move,g.revision,true)!;expect(r).not.toBeNull();
    const b=r.state.assistBudget!;expect(b.left).toBeLessThanOrEqual(previous);previous=b.left;
    if(r.decision){const a=r.decision.assistance!;spent+=Number(a.applied);expect(a.work).toBeLessThanOrEqual(24000);expect(replayDecision(r.decision)).toEqual(r.decision);}
    allClears+=Number(r.allClear);g=JSON.parse(JSON.stringify(r.state));
    expect(validProfile({...createProfile(g),best:g.score})).toBe(true);
  }
  expect(spent).toBeGreaterThan(0);expect(spent).toBeLessThanOrEqual(5);expect(allClears).toBeGreaterThan(0);
  expect(g.assistBudget!.left+spent).toBe(5);expect(ASSIST_BUDGET_CONFIG.credits).toBe(5);
},15000);
it("failed atomic save leaves credits untouched; retry consumes once and stale revision cannot consume again",async()=>{
  const {g,move,result}=spendable();let reject=true;
  const p={...createProfile(g),best:g.score};const store=new ProfileStore(p,{load:async()=>({profile:p,recovered:false}),write:async()=>{if(reject)throw Error("storage");}});
  const commit=()=>store.update(p=>{const r=applyMove(p.game,move,g.revision,true);return r?{...p,revision:p.revision+1,game:r.state,best:r.state.score}:null;});
  await expect(commit()).rejects.toThrow("storage");expect(store.state.game.assistBudget).toEqual(g.assistBudget);
  reject=false;expect(await commit()).toBe(true);expect(store.state.game.assistBudget).toEqual(result.state.assistBudget);
  expect(await commit()).toBe(false);expect(store.state.game.assistBudget).toEqual(result.state.assistBudget);
});
it("rejects missing/damaged/refilled saved budgets and preserves legacy profiles",()=>{
  const p=createProfile(newGame(7601001,"save","director-budget-v1"));expect(validProfile(p)).toBe(true);
  for(const b of [undefined,{...freshAssistBudget(),left:6},{...freshAssistBudget(),left:4},{...freshAssistBudget(),configId:"next"}])
    expect(validProfile({...p,game:{...p.game,assistBudget:b as any}})).toBe(false);
  expect(validAssistBudget(freshAssistBudget())).toBe(true);
  expect(validProfile(createProfile(newGame(7601001,"old","director-v2")))).toBe(true);
});
it("stable future assignment is opt-in, independent of gameplay RNG, and never replaces a resumed game",()=>{
  const p=createProfile(newGame(1,"old","director-v2")),config={...ASSIST_BUDGET_EXPERIMENT,enabled:true};
  let candidates=0;for(let i=0;i<100;i++) {
    const a=ensureExperiment(p,1,true,`budget-install-${i}`,config);expect(a.game).toBe(p.game);
    candidates+=Number(assignedDealer(a,config)==="director-budget-v1");
    expect(ensureExperiment(JSON.parse(JSON.stringify(a)),2,false,"other",{...config,version:2}).experiment).toEqual(a.experiment);
  }
  expect(candidates).toBeGreaterThan(35);expect(candidates).toBeLessThan(65);
  expect(ASSIST_BUDGET_EXPERIMENT.enabled).toBe(false);expect(COMPOSITION_EXPERIMENT.enabled).toBe(false);
  expect(assignedDealer(p)).toBe("director-v2");
});
