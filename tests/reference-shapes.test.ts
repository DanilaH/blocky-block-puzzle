import {it,expect} from 'vitest';
import d2Fixtures from './fixtures/reference-d2.json';
import geometry from './fixtures/reference-geometry.json';
import {ALL_SHAPES,SHAPES,REFERENCE_SHAPES,shapeById,newGame,applyMove,replayDecision,place,emptyBoard,type GameState,type Move} from '../src/core/rules';
import {referenceShapeDeal} from '../src/core/reference-shape-dealer';
import {challengeBuildDeal} from '../src/core/challenge-build-v1';
import {initialGoalDirector} from '../src/core/goal-director';
import {initialRhythmV4} from '../src/core/rhythm';
import {verifyWitness} from '../scripts/challenge-content/oracle';
import {chooseMixed} from '../scripts/director/mixed-players';
import {validProfile,createProfile} from '../src/core/profile';
import {PlayCapture} from '../src/platform/play-capture';
import {replayRecord} from '../scripts/calibration/replay';
import {prepareReward,applyReceipt} from '../src/core/monetization';
import {findHint} from '../src/core/hints';
const metric=(board:number[],tray:GameState['tray'],path:Move[])=>{
 let b=board,lines=0,clears=0;for(const m of path){const r=place(b,shapeById(tray[m.slot]!.shapeId),m.x,m.y);b=r.board;lines+=r.lines;clears+=Number(!b.some(Boolean));}return{lines,clears,occupied:b.filter(Boolean).length};
};
const saved={...initialGoalDirector(),deals:20,sinceLoad:2,rest:1};

it('adds exactly8L/J rotations/mirrors and2diagonal pairs without changing the legacy31catalog',()=>{
 expect(SHAPES).toHaveLength(31);expect(ALL_SHAPES.slice(0,31)).toEqual(SHAPES);expect(ALL_SHAPES).toHaveLength(41);
 const keys=ALL_SHAPES.map(s=>s.cells.map(([x,y])=>x+','+y).sort().join(';'));expect(new Set(keys).size).toBe(41);
 expect(REFERENCE_SHAPES.filter(s=>s.family==='LJ4')).toHaveLength(8);expect(REFERENCE_SHAPES.filter(s=>s.family==='D2')).toHaveLength(2);
 for(const s of REFERENCE_SHAPES){expect(Math.min(...s.cells.map(c=>c[0]))).toBe(0);expect(Math.min(...s.cells.map(c=>c[1]))).toBe(0);expect(Math.max(...s.cells.map(c=>c[0]))+1).toBe(s.width);expect(Math.max(...s.cells.map(c=>c[1]))+1).toBe(s.height);expect(s.cells).toHaveLength(s.family==='D2'?2:4);}
});

it('places the actual occupied cells and legally places every new orientation at every board edge',()=>{
 for(const s of REFERENCE_SHAPES)for(const [x,y] of [[0,0],[8-s.width,0],[0,8-s.height],[8-s.width,8-s.height]]){
  const r=place(emptyBoard(),s,x!,y!),expected=new Set(s.cells.map(([dx,dy])=>(y!+dy)*8+x!+dx));
  expect(r.lines).toBe(0);expect(new Set(r.board.flatMap((v,i)=>v?[i]:[]))).toEqual(expected);
 }
});

it('issues new forms by equal-area proof, preserving two slots, all rewards and authoritative RNG/controller',()=>{
 const seen=new Set();for(let seed=1;seed<=32;seed++){
  const base=challengeBuildDeal(emptyBoard(),seed,60,initialRhythmV4(),saved),d=referenceShapeDeal(emptyBoard(),seed,60,initialRhythmV4(),saved);
  if(!d.shapeDecision.changed)continue;
  seen.add(d.shapeDecision.to);verifyWitness(emptyBoard(),d.tray,d.witness);expect(d.tray.filter((s,i)=>s.shapeId!==base.tray[i]!.shapeId)).toHaveLength(1);
  expect(d.tray.map(s=>shapeById(s.shapeId).cells.length)).toEqual(base.tray.map(s=>shapeById(s.shapeId).cells.length));
  expect(metric(emptyBoard(),d.tray,d.witness)).toEqual(metric(emptyBoard(),base.tray,base.witness));expect(d.rngState).toBe(base.rngState);expect(d.director).toEqual(base.director);expect(d.diagnostic.checks).toBeLessThanOrEqual(24000);
 }
 expect(seen.size).toBe(8);
});

it('keeps authored starts and every earned recovery refill literal0.73',()=>{
 for(const recoveryDeals of [1,2,3]){
  const rhythm={...initialRhythmV4(),recoveryDeals},d=referenceShapeDeal(emptyBoard(),42,60,rhythm,saved),b=challengeBuildDeal(emptyBoard(),42,60,rhythm,saved);
  expect(d.tray).toEqual(b.tray);expect(d.witness).toEqual(b.witness);expect(d.rngState).toBe(b.rngState);expect(d.shapeDecision.reason).toBe('protected');
 }
 const a=newGame(42,'a','director-shapes-v1'),b=newGame(42,'b','director-build-v1');for(const k of ['board','tray','rngState','goalDirector','challengeBuildState'] as const)expect(a[k]).toEqual(b[k]);
});

it('saves, captures and exactly replays real new-catalog refills and the bounded clock',()=>{
 let trace:any,g=newGame(8122001,'new-catalog','director-shapes-v1',t=>trace=t);expect(replayDecision(trace)).toEqual(trace);
 const capture=new PlayCapture(()=>0);capture.start(g);let accepted=0;
 for(let n=0;n<120&&g.status==='playing';n++){
  const m=chooseMixed(g.board,g.tray,'three',0).move!,r=applyMove(g,m,g.revision,true,{activeMs:(n+1)*1300})!;
  capture.record(g,m,r.state,r.decision);g=JSON.parse(JSON.stringify(r.state));expect(validProfile({...createProfile(g),best:g.score})).toBe(true);
  if(r.decision){verifyWitness(r.decision.input.board,g.tray,r.decision.validation.witness);expect(replayDecision(r.decision)).toEqual(r.decision);accepted+=Number(r.decision.catalog?.changed);expect(r.decision.validation.work).toBeLessThanOrEqual(24000);}
 }
 expect(accepted).toBeGreaterThan(0);expect(replayRecord(capture.snapshot()).final).toEqual(g);
});

it.each(REFERENCE_SHAPES.map(s=>s.id))('supports hints/save and earned old-tray continuation for %s',(id)=>{
 const g=newGame(42,'new-tray','director-shapes-v1');g.board=emptyBoard();g.tray=[{shapeId:id,color:2,used:false},{shapeId:'S1-0',color:1,used:true},{shapeId:'S1-0',color:1,used:true}];
 const hint=findHint(g,0);expect(hint.move).not.toBeNull();expect(applyMove(g,hint.move!,g.revision)).not.toBeNull();expect(validProfile(createProfile(g))).toBe(true);
 expect(validProfile(createProfile({...g,dealerVersion:'director-build-v1'}))).toBe(false);
 g.board=Array(64).fill(1);g.status='over';const p=prepareReward(createProfile(g),'new-revive','revive'),earned=applyReceipt(p,{id:'earned',intentId:'new-revive'});
 expect(earned.game.tray).toEqual(g.tray);expect(earned.game.score).toBe(g.score);expect(applyReceipt(earned,{id:'earned',intentId:'new-revive'})).toEqual(earned);
 const witness=p.ads!.intents[0]!.plan!.selection!.witness;expect(witness).toHaveLength(1);const r=applyMove(earned.game,witness[0]!,earned.game.revision,true)!;
 expect(r.state.rhythm!.recoveryDeals).toBe(2);expect(r.decision!.catalog!.reason).toBe('protected');expect(validProfile({...earned,game:r.state,best:r.state.score})).toBe(true);
});

 it('matches all10orientations to corrected source geometry and actually issues both diagonal pairs',()=>{
  const key=(cells:readonly(readonly number[])[])=>cells.map(c=>c.join(',')).sort().join(';');
  for(const f of geometry.cases)expect(key(shapeById(f.shapeId).cells)).toBe(key(f.cells));
  for(const f of d2Fixtures.cases){const d=referenceShapeDeal(f.board,f.seed,f.moves,undefined,f.saved as any);expect(d.shapeDecision.to).toBe(f.expected);verifyWitness(f.board,d.tray,d.witness);}
 });
