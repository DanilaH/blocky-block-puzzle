import {expect,it} from 'vitest';
import {newGame,emptyBoard,applyMove,replayDecision,place,shapeById} from '../src/core/rules';
import {goalDirectorDeal,initialGoalDirector} from '../src/core/goal-director';
import {sparseBuildGoalDeal,verifiedGoalDeal} from '../src/core/verified-goal';
import {initialRhythmV4} from '../src/core/rhythm';
import {verifyWitness} from '../scripts/challenge-content/oracle';
import {createProfile,validProfile} from '../src/core/profile';
import {PlayCapture} from '../src/platform/play-capture';
import {replayRecord} from '../scripts/calibration/replay';
import {chooseMixed} from '../scripts/director/mixed-players';
import {prepareReward,applyReceipt} from '../src/core/monetization';
import {ensureExperiment,rememberClassicGame,classicNewGameDealer,BUILD_V1_EXPERIMENT} from '../src/core/experiment';
import {DecisionPlayClock} from '../src/platform/decision-clock';

function metrics(board:number[],d:ReturnType<typeof goalDirectorDeal>) {
 let b=board,clears=0,lines=0;
 for(const m of d.witness){const r=place(b,shapeById(d.tray[m.slot]!.shapeId),m.x,m.y);b=r.board;clears+=Number(!b.some(Boolean));lines+=r.lines;}
 return {clears,lines,occupied:b.filter(Boolean).length};
}

it('lets the empty-board rest tray accumulate blocks instead of constructing another full clear',()=>{
 const saved={...initialGoalDirector(),deals:20,rest:1,sinceLoad:3};
 for(const seed of [1,42,2107]){
  const old=verifiedGoalDeal(emptyBoard(),seed,60,initialRhythmV4(),saved,24000,false,'observe');
  const d=sparseBuildGoalDeal(emptyBoard(),seed,60,initialRhythmV4(),saved,24000,false,'observe');
  verifyWitness(emptyBoard(),d.tray,d.witness);
  expect(metrics(emptyBoard(),old).clears).toBeGreaterThan(0);
  expect(metrics(emptyBoard(),d).clears).toBe(0);
  expect(metrics(emptyBoard(),d).occupied).toBeGreaterThan(0);
  expect(d.director).toEqual(old.director);expect(d.rngState).toBe(old.rngState);
  expect(d.tray.every(t=>shapeById(t.shapeId).cells.length<=4)).toBe(true);
  expect(d.diagnostic.source).toMatch(/^sparse-build-/);
 }
});

it('keeps the complete v2 result above the boundary and throughout every earned recovery refill',()=>{
 const board=Array.from({length:64},(_,i)=>i<17?1:0),saved={...initialGoalDirector(),deals:20,payoff:1,sinceLoad:2};
 for(const count of [0,8,16,17,30])for(const recoveryDeals of [0,1,2,3]){
  if(count<=16&&!recoveryDeals)continue;
  const b=board.map((_,i)=>i<count?1:0),rhythm={...initialRhythmV4(),recoveryDeals};
  expect(sparseBuildGoalDeal(b,42,60,rhythm,saved,24000,false,'choice')).toEqual(verifiedGoalDeal(b,42,60,rhythm,saved,24000,false,'choice'));
 }
});

it('persists a separate candidate state, bounded clock, capture and deterministic decision replay',()=>{
 let trace:any,g=newGame(42,'sparse-replay','director-build-v1',t=>trace=t),old=newGame(42,'old','director-challenge-v2');
 for(const k of ['board','tray','rngState','goalDirector'] as const)expect(g[k]).toEqual(old[k]);
 expect(replayDecision(trace)).toEqual(trace);
 const capture=new PlayCapture(()=>0);capture.start(g);
 let now=0;const clock=new DecisionPlayClock(()=>now);clock.sync(g,true);now=123;expect(clock.observation(g)).toEqual({activeMs:123});
 for(let n=0;n<60&&g.status==='playing';n++){
  const m=chooseMixed(g.board,g.tray,'three',0).move!;
  const r=applyMove(g,m,g.revision,true,{activeMs:(n+1)*1500})!;
  capture.record(g,m,r.state,r.decision);g=JSON.parse(JSON.stringify(r.state));
  expect(validProfile({...createProfile(g),best:g.score})).toBe(true);
  if(r.decision){verifyWitness(r.decision.input.board,g.tray,r.decision.validation.witness);expect(replayDecision(r.decision)).toEqual(r.decision);expect(r.decision.validation.work).toBeLessThanOrEqual(24000);}
 }
 expect(g.challengeBuildState!.configId).toBe('challenge-build-v1');expect(g.challengeV2State).toBeUndefined();
 expect(g.challengeBuildState!.recentTrayMs.length).toBeLessThanOrEqual(8);
 expect(replayRecord(capture.snapshot()).final).toEqual(g);
 expect(validProfile({...createProfile({...g,dealerVersion:'director-challenge-v2'}),best:g.score})).toBe(false);
});

it('retains the saved tray, score and one earned revive, then gives the same three original recovery refills',()=>{
 let g=newGame(3,'build-revive','director-build-v1',undefined,'tasks');
 g.board=Array.from({length:64},(_,i)=>(i+(i>>3))%2);g.status='over';
 g.tray=[{shapeId:'O3-0',color:1,used:false},{shapeId:'S1-0',color:1,used:true},{shapeId:'S1-0',color:1,used:true}];
 const prepared=prepareReward(createProfile(g),'intent','revive'),earned=applyReceipt(prepared,{id:'earned',intentId:'intent'});
 expect(earned.game.tray).toEqual(g.tray);expect(earned.game.score).toBe(g.score);
 const duplicate=applyReceipt(earned,{id:'duplicate',intentId:'intent'});expect(duplicate.game).toEqual(earned.game);expect(duplicate.earnedHints).toBe(earned.earnedHints);expect(applyReceipt(duplicate,{id:'duplicate',intentId:'intent'})).toEqual(duplicate);
 g=earned.game;let path=prepared.ads!.intents[0]!.plan!.selection!.witness,active=0;
 for(let n=0;n<3;n++){
  let t:any;for(const m of path){const r=applyMove(g,m,g.revision,true,{activeMs:active+=1300})!;g=r.state;if(r.decision)t=r.decision;}
  const i=t.input,d=verifiedGoalDeal(i.board,i.seed,i.moves,i.context.rhythm,i.context.goalDirector,24000,false,'observe');
  expect(t.challenge.selectedPhase).toBe('POST_REVIVE');expect(g.tray).toEqual(d.tray);expect(g.rngState).toBe(d.rngState);expect(t.validation.witness).toEqual(d.witness);
  expect(g.rhythm!.recoveryDeals).toBe(2-n);path=t.validation.witness;
 }
 expect(g.reviveUsed).toBe(true);
});

it('records manual opening history without changing the selected default or enabling audience rollout',()=>{
 const p=ensureExperiment(createProfile(newGame(42,'old','director-challenge-v2')),10,false,'installation');
 const g={...newGame(41,'candidate','director-build-v1'),comparisonMode:'manual' as const};
 const next=rememberClassicGame(p,g);expect(next.experiment!.manualDealer).toBe('director-build-v1');
 expect(next.experiment!.challengeOpeningHistory).toEqual([g.challengeBuildState!.openingKey]);
 expect(classicNewGameDealer(next)).toBe('director-challenge-v2');expect(BUILD_V1_EXPERIMENT.enabled).toBe(false);
 expect(validProfile({...next,game:g})).toBe(true);
});
