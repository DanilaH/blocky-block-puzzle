import {it,expect} from 'vitest';
import {newGame,applyMove,emptyBoard,placements,shapeById,random,type GameState} from '../src/core/rules';
import {initialMixedDirector,mixedDirectorDeal,observeMixedDirector} from '../src/core/mixed-director';
import {initialRhythmV4,advanceRhythmV4} from '../src/core/rhythm';
import {createProfile,validProfile} from '../src/core/profile';
import {prepareReward,applyReceipt} from '../src/core/monetization';
import {choose} from '../scripts/difficulty/players';
import {verifyMixedDeal} from '../scripts/director/verify-mixed-deal';

it('persists the mixed cycle exactly and does not spend it on a replayed revision',()=>{
 let g=newGame(1141001,'mixed-save','director-v3');
 for(let i=0;i<24&&g.status==='playing';i++){
  expect(validProfile({...createProfile(g),best:g.score})).toBe(true);
  const move=choose(g.board,g.tray,'three')!,old=structuredClone(g),a=applyMove(g,move,g.revision)!;
  expect(applyMove(JSON.parse(JSON.stringify(g)),move,g.revision)).toEqual(a);expect(g).toEqual(old);
  expect(applyMove(a.state,move,g.revision)).toBeNull();g=a.state;
 }
 for(const mixedDirector of [undefined,{...g.mixedDirector!,version:2},{...g.mixedDirector!,nextLoad:50},{...g.mixedDirector!,giftDeals:3}])
  expect(validProfile({...createProfile({...g,mixedDirector} as GameState),best:g.score})).toBe(false);
});
it('gives complete immutable routes under regular and deliberately exhausted budgets',()=>{
 for(const budget of [512,1000,6000,24000])for(const board of [emptyBoard(),Array.from({length:64},(_,i)=>((i%8)+Math.floor(i/8))%2)]){
  const old=structuredClone(board),d=mixedDirectorDeal(board,91,30,initialRhythmV4(),initialMixedDirector(),budget);
  verifyMixedDeal(board,d);expect(board).toEqual(old);expect(d.diagnostic.checks).toBeLessThanOrEqual(budget);
  expect(mixedDirectorDeal(board,91,30,initialRhythmV4(),initialMixedDirector(),budget)).toEqual(d);
 }
});
it('uses a light rest without scheduling another targeted all-clear immediately',()=>{
 const saved=observeMixedDirector({...initialMixedDirector(),giftDeals:1},true);
 expect(saved.giftDeals).toBe(0);expect(saved.rest).toBe(1);
 for(let seed=1;seed<=12;seed++){
  const d=mixedDirectorDeal(emptyBoard(),seed,30,{...initialRhythmV4(),cycleMoves:0},saved);
  expect(d.diagnostic.requested).toBe('rest');expect(d.diagnostic.goalFound).toBe(false);
  expect(d.director.rest).toBe(0);verifyMixedDeal(emptyBoard(),d);
  const after=mixedDirectorDeal(emptyBoard(),seed+1,33,{...initialRhythmV4(),cycleMoves:3},d.director);
  expect(after.diagnostic.requested).not.toBe('gift');
 }
});
it('preserves at least three distinct certified beginnings when it marks a tray broad',()=>{
 for(let seed=1141001;seed<=1141006;seed++){
  const d=mixedDirectorDeal(emptyBoard(),seed);expect(d.diagnostic.robustness.adequate).toBe(true);
  const result=verifyMixedDeal(emptyBoard(),d);expect(result.safe).toBeGreaterThanOrEqual(3);
 }
});
it('loads only after the saved spacing, then prepares a line-focused release',()=>{
 const rhythm={...initialRhythmV4(),cycleMoves:30},saved={...initialMixedDirector(),sinceLoad:5};
 const d=mixedDirectorDeal(emptyBoard(),99,30,rhythm,saved);expect(d.diagnostic.actual).toBe('load');
 expect(d.diagnostic.large).toBeGreaterThanOrEqual(1);expect(d.director.sinceLoad).toBe(0);verifyMixedDeal(emptyBoard(),d);
 const release=mixedDirectorDeal(emptyBoard(),100,33,{...rhythm,cycleMoves:6},d.director);
 expect(release.diagnostic.requested).toBe('relief');expect(release.diagnostic.goalFound).toBe(false);verifyMixedDeal(emptyBoard(),release);
});
it('consumes a real earned-clear rest and cancels unfinished gift preparation',()=>{
 const g=newGame(3,'mixed-rest','director-v3');g.mixedDirector!.giftDeals=1;
 g.board=emptyBoard();g.board.fill(1,0,4);g.tray=[{shapeId:'I4-0',color:1,used:false},{shapeId:'S1-0',color:1,used:true},{shapeId:'S1-0',color:1,used:true}];
 const moved=applyMove(g,{slot:0,x:4,y:0},g.revision)!;expect(moved.allClear).toBe(true);
 expect(moved.state.mixedDirector!.last).toBe('rest');expect(moved.state.mixedDirector!.rest).toBe(0);expect(moved.state.mixedDirector!.giftDeals).toBe(0);
});
it('applies a revive receipt once and consumes exactly three supported refills',()=>{
 const lost=newGame(3,'mixed-revive','director-v3');lost.board=Array.from({length:64},(_,i)=>((i%8)+Math.floor(i/8))%2);
 lost.tray=[{shapeId:'O3-0',color:1,used:false},{shapeId:'S1-0',color:1,used:true},{shapeId:'S1-0',color:1,used:true}];lost.status='over';
 const revived=applyReceipt(prepareReward(createProfile(lost),'revive','revive'),{id:'receipt',intentId:'revive'});
 expect(validProfile(revived)).toBe(true);expect(applyReceipt(revived,{id:'duplicate',intentId:'revive'}).game).toEqual(revived.game);
 let g=revived.game,route=[{slot:0,...placements(g.board,shapeById('O3-0'))[0]!}];
 for(let round=0;round<4;round++)for(const m of route){
  const old=g,refill=g.tray.filter(s=>s.used).length===2,a=applyMove(g,m,g.revision)!;expect(a).not.toBeNull();
  expect(a.state.rhythm!.recoveryDeals).toBe(refill?Math.max(0,g.rhythm!.recoveryDeals-1):g.rhythm!.recoveryDeals);g=JSON.parse(JSON.stringify(a.state));
  if(refill){const rhythm=advanceRhythmV4(old.rhythm!,g.board,a.lines,a.allClear,random(old.rngState).value);
   const d=mixedDirectorDeal(g.board,old.rngState,g.moves,rhythm,observeMixedDirector(old.mixedDirector!,a.allClear));expect(d.tray).toEqual(g.tray);
   expect(d.diagnostic.requested==='recovery').toBe(round<3);route=d.witness;}
 }
 expect(g.rhythm!.recoveryDeals).toBe(0);
});
