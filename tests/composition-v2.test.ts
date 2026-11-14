import {expect,it} from "vitest";
import {applyMove,newGame,shapeById,deal,place} from "../src/core/rules";
import {openingDeal,openingIndex,seedForDifferentOpening,compositionDealV2} from "../src/core/composition-dealer-v2";
import {compositionDeal} from "../src/core/composition-dealer";
import {createProfile,validProfile} from "../src/core/profile";
import {assignedDealer,enabledDealer,COMPOSITION_EXPERIMENT} from "../src/core/experiment";
import {stateHash} from "../src/platform/play-capture";

it("covers all 32 rotated openings with a real one-line witness, and no first-tray full clear is geometrically possible",()=>{
 const rotations=new Set<string>(),families=new Map<number,number>();
 for(let i=1;i<=128;i++){
  const seed=Math.imul(i,0x9e3779b9)>>>0,d=openingDeal(seed);
  families.set(d.openingId,(families.get(d.openingId)??0)+1);
  rotations.add(`${d.openingId}:${d.witness[0]!.x}:${d.witness[0]!.y}:${d.tray[d.witness[0]!.slot]!.shapeId}`);
  const shapes=d.tray.map(s=>shapeById(s.shapeId));
  expect(shapes.reduce((n,s)=>n+s.cells.length,0)).toBeLessThan(15);
  // Two lines need at least 15 cells. A single cleared line needs exactly 8;
  // every subset of that area contains a piece that is not a straight line.
  for(let mask=1;mask<8;mask++){
   const subset=shapes.filter((_,j)=>mask&(1<<j));
   if(subset.reduce((n,s)=>n+s.cells.length,0)===8)
    expect(subset.some(s=>s.width>1&&s.height>1)).toBe(true);
  }
  let g=newGame(seed,`opening-${i}`,"composition-v2"),lines=0;
  expect(validProfile(createProfile(g))).toBe(true);
  expect(g.tray).toEqual(d.tray);
  for(const m of d.witness){const r=applyMove(g,m,g.revision)!;expect(r).not.toBeNull();expect(r.allClear).toBe(false);lines+=r.lines;g=r.state;}
  expect(lines).toBe(1);expect(g.board.some(Boolean)).toBe(true);
  expect(g.openingId).toBe(d.openingId);expect(g.rhythm!.recentBags!.length).toBeLessThanOrEqual(4);
  const copy=JSON.parse(JSON.stringify(g));expect(validProfile({...createProfile(copy),best:g.score})).toBe(true);expect(stateHash(copy)).toBe(stateHash(g));
 }
 expect(families.size).toBe(8);expect(Math.max(...families.values())).toBeLessThanOrEqual(32);expect(rotations.size).toBe(32);
});
it("does not repeat a starter on consecutive restarts, including zero seed and every previous starter",()=>{
 for(let previous=0;previous<8;previous++)for(let i=0;i<256;i++){
  const next=seedForDifferentOpening(Math.imul(i,0x9e3779b9),previous);
  expect(openingIndex(next)).not.toBe(previous);expect(next).toBeGreaterThan(0);
 }
});
it("retains the old early deals and all three recovery deals even in a long game",()=>{
 for(const moves of [3,18,71,72,150])for(const recovery of [0,1,2,3]){
  const g=newGame(6101099,"protected","director-v2");g.rhythm!.recoveryDeals=recovery;g.goalDirector!.payoff=2;
  const old=compositionDeal(g.board,g.rngState,moves,g.rhythm,g.goalDirector);
  const next=compositionDealV2(g.board,g.rngState,moves,g.rhythm,g.goalDirector);
  if(moves<72||recovery){
   for(const k of ["tray","rngState","witness","director"] as const)expect(next[k]).toEqual(old[k]);
   expect("diagnostic" in next ? next.diagnostic : undefined).toEqual(old.diagnostic);
  }else{expect(next.director.payoff).toBe(0);expect(old.director.payoff).toBe(1);}
 }
});
it("makes the new version manual only, supports kill switch, and rejects damaged starter identity",()=>{
 const p=createProfile(newGame(6101001,"manual","composition-v2"));
 expect(assignedDealer(p)).toBe("director-v2");
 p.experiment={installationId:"manual",cohort:"existing",manualDealer:"composition-v2"};
 expect(assignedDealer(p)).toBe("composition-v2");expect(validProfile(p)).toBe(true);
 expect(enabledDealer("composition-v2",{...COMPOSITION_EXPERIMENT,candidateEnabled:false})).toBe("director-v2");
 for(const openingId of [undefined,-1,8,1.2])expect(validProfile({...p,game:{...p.game,openingId}})).toBe(false);
 const d=deal(p.game.board,p.game.rngState,"composition-v2",75,"",p.game.rhythm,undefined,p.game.goalDirector);
 expect(d.composition!.checks).toBeLessThanOrEqual(12000);
});
it("keeps executable late witnesses across roles with one shared bounded diversification search",()=>{
 for(const role of ["prepare","load","payoff","rest","relief","recovery"])for(let i=0;i<5;i++){
  const g=newGame(6103001+i,"late-proof","director-v2");
  // Sparse nonempty engineering board with varying row/column gaps.
  g.board=Array.from({length:64},(_,cell)=>(cell+i*7)%13===0?1:0);g.moves=150;
  if(role==="load")g.goalDirector!.sinceLoad=3;
  if(role==="payoff")g.goalDirector!.payoff=2;
  if(role==="rest")g.goalDirector!.rest=1;
  if(role==="relief")g.rhythm!.dryMoves=6;
  if(role==="recovery")g.rhythm!.recoveryDeals=3;
  const d=compositionDealV2(g.board,g.rngState,g.moves,g.rhythm,g.goalDirector);
  let board=g.board;const used=new Set<number>();
  for(const m of d.witness){expect(used.has(m.slot)).toBe(false);used.add(m.slot);board=place(board,shapeById(d.tray[m.slot]!.shapeId),m.x,m.y).board;}
  expect(used.size).toBe(3);expect(d.composition.checks).toBeLessThanOrEqual(12000);
 }
});
