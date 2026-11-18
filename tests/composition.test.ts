import { expect, it } from "vitest";
import { newGame, applyMove, deal, SHAPES, type GameState } from "../src/core/rules";
import { createProfile, validProfile } from "../src/core/profile";
import { goalDirectorDeal } from "../src/core/goal-director";
import { compositionDeal } from "../src/core/composition-dealer";

it("keeps v2 RNG and two pieces while proving equal-area alternatives in every existing role", () => {
  const roles = ["prepare","load","payoff","rest","relief","recovery"];
  let changed = 0;
  for (const role of roles) for (let seed=5101001;seed<=5101005;seed++) {
    const g = newGame(seed,"role","director-v2");
    g.moves=18;
    if (role==="load") g.goalDirector!.sinceLoad=3;
    if (role==="rest") g.goalDirector!.rest=1;
    if (role==="payoff") g.goalDirector!.payoff=1;
    if (role==="relief") g.rhythm!.dryMoves=6;
    if (role==="recovery") g.rhythm!.recoveryDeals=3;
    const base=goalDirectorDeal(g.board,g.rngState,g.moves,g.rhythm,g.goalDirector);
    const c=compositionDeal(g.board,g.rngState,g.moves,g.rhythm,g.goalDirector);
    expect(c).toEqual(compositionDeal(g.board,g.rngState,g.moves,g.rhythm,g.goalDirector));
    expect(c.rngState).toBe(base.rngState);
    expect(c.director).toEqual(base.director);
    const difference=c.tray.flatMap((s,i)=>s.shapeId===base.tray[i]!.shapeId?[]:[i]);
    expect(difference.length).toBeLessThanOrEqual(1);
    if (difference.length) {
      changed++;
      const slot=difference[0]!;
      expect(SHAPES.find(s=>s.id===c.tray[slot]!.shapeId)!.cells.length).toBe(SHAPES.find(s=>s.id===base.tray[slot]!.shapeId)!.cells.length);
    }
    let state:GameState={...g,dealerVersion:"composition-v1",tray:c.tray,goalDirector:c.director,rngState:c.rngState};
    for (const m of c.witness) {const r=applyMove(state,m,state.revision);expect(r).not.toBeNull();state=r!.state;}
    expect(state.tray.every(s=>!s.used)).toBe(true);
    expect(c.composition.checks).toBeLessThanOrEqual(12000);
  }
  expect(changed).toBeGreaterThan(0);
});
it("persists its own version and bounded family history; v2 remains a distinct exact baseline", () => {
  for (const version of ["director-v2","composition-v1"] as const) {
    let g=newGame(5101010,"save",version);
    expect(validProfile(createProfile(JSON.parse(JSON.stringify(g))))).toBe(true);
    const d=deal(g.board,g.rngState,version,g.moves,"",g.rhythm,undefined,g.goalDirector);
    g={...g,tray:d.tray,rngState:d.rngState,goalDirector:d.goalDirector};
    for (const m of d.witness!) g=applyMove(g,m,g.revision)!.state;
    expect(g.dealerVersion).toBe(version);
    expect(g.rhythm!.recentBags!.length).toBeLessThanOrEqual(4);
    expect(validProfile({...createProfile(g),best:g.score})).toBe(true);
  }
});
