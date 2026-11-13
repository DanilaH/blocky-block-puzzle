import { expect, it } from "vitest";
import fs from "node:fs";
import { applyMove, type GameState } from "../src/core/rules";
import { revivePlan, prepareReward, applyReceipt } from "../src/core/monetization";
import { startReviveOffer, acceptReviveOffer } from "../src/core/revive-offer";
import { createProfile, validProfile } from "../src/core/profile";
const cases = JSON.parse(fs.readFileSync(new URL("./fixtures/revive-regressions.json", import.meta.url), "utf8")) as {name:string;state:GameState}[];
for (const c of cases) it(`proves the remaining tray without strengthening a solvable baseline: ${c.name}`, () => {
  const g = structuredClone(c.state), original = structuredClone(g), plan = revivePlan(g)!;
  expect(g).toEqual(original);
  expect(plan.selection!.checks).toBeLessThanOrEqual(24000);
  expect(plan.selection!.result).toBe(["human-2", "synthetic"].includes(c.name) ? "alternative-found" : "baseline-found");
  let state = plan.game;
  expect(state.rhythm!.recoveryDeals).toBe(3);
  for (const [i, move] of plan.selection!.witness.entries()) {
    const r = applyMove(state, move, state.revision)!;
    expect(r).not.toBeNull(); state = r.state;
    if (i < plan.selection!.witness.length - 1) expect(state.rhythm!.recoveryDeals).toBe(3);
  }
  expect(state.tray.every(s=>!s.used)).toBe(true);
  expect(state.rhythm!.recoveryDeals).toBe(2);
  if (c.name === "human-2") expect([plan.x, plan.y]).toEqual([5, 5]);
  if (c.name === "synthetic") expect([plan.x, plan.y]).toEqual([3, 4]);
});
it("reports unknown on an exhausted shared proof allowance and preserves the baseline", () => {
  const g = cases.find(c=>c.name === "human-2")!.state;
  const plan = revivePlan(g, 0)!;
  expect([plan.x,plan.y]).toEqual([5,4]);
  expect(plan.selection!.result).toBe("baseline-unknown");
  expect(plan.selection!.witness).toEqual([]);
});
it("uses the same fixed revive for the candidate and keeps the old tray before recovery",()=>{
  const g={...structuredClone(cases.find(c=>c.name==="human-2")!.state),dealerVersion:"composition-v1" as const};
  const plan=revivePlan(g)!;let state=plan.game;
  for(const m of plan.selection!.witness) state=applyMove(state,m,state.revision)!.state;
  expect(state.dealerVersion).toBe("composition-v1");expect(state.rhythm!.recoveryDeals).toBe(2);
  expect(validProfile({...createProfile(state),best:state.score})).toBe(true);
});
it("freezes before the decision window, survives reload and preserves old prepared entitlements", () => {
  const g = cases.find(c=>c.name === "human-2")!.state, prepared = revivePlan(g)!;
  let game = startReviveOffer(g, 10000, prepared);
  expect(game.reviveOffer!.deadline).toBe(15000);
  game = acceptReviveOffer(JSON.parse(JSON.stringify(game)), 14999);
  const p = prepareReward({...createProfile(game), best:game.score}, "frozen", "revive");
  expect(validProfile(p)).toBe(true);
  expect(p.ads!.intents[0]!.plan!.selection).toEqual(prepared.selection);
  const restored = JSON.parse(JSON.stringify(p));
  const next = applyReceipt(restored,{id:"receipt",intentId:"frozen"});
  expect(applyReceipt(next,{id:"receipt",intentId:"frozen"})).toBe(next);
  expect(next.game.board).toEqual(prepared.game.board);
  // Historical plans have no selector tag and must remain valid, even if suboptimal.
  const legacyGame = {...g};
  const legacy = prepareReward({...createProfile(legacyGame),best:g.score},"legacy","revive");
  legacy.ads!.intents[0]!.plan = revivePlan(g,0)!;
  delete legacy.ads!.intents[0]!.plan!.selection;
  expect(validProfile(legacy)).toBe(true);
  expect(applyReceipt(legacy,{id:"old",intentId:"legacy"}).game.board).toEqual(legacy.ads!.intents[0]!.plan!.game.board);
});
