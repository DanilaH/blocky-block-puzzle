import {it,expect} from 'vitest';
import {newGame,applyMove,emptyBoard,shapeById,placements,random,type GameState} from '../src/core/rules';
import {initialGoalDirector,goalDirectorDeal,observeGoalDirector,type GoalDirectorState} from '../src/core/goal-director';
import {initialRhythmV4,advanceRhythmV4} from '../src/core/rhythm';
import {createProfile,validProfile} from '../src/core/profile';
import {prepareReward,applyReceipt} from '../src/core/monetization';
import {choose} from '../scripts/difficulty/players';
import {verifyGoalDeal} from '../scripts/director/goal-certificates';
import fixtures from './fixtures/goal-decisions.json';

it('keeps a deterministic versioned goal across saves and rejects corrupt goal state',()=>{
  let g=newGame(1041001,'goal-save','director-v2');
  expect(g.director).toBeUndefined();expect(g.goalDirector!.version).toBe(2);
  for(let i=0;i<18&&g.status==='playing';i++){
    const move=choose(g.board,g.tray,'three')!,old=structuredClone(g);
    const a=applyMove(g,move,g.revision)!,b=applyMove(JSON.parse(JSON.stringify(g)),move,g.revision)!;
    expect(a).toEqual(b);expect(g).toEqual(old);expect(applyMove(a.state,move,g.revision)).toBeNull();
    g=a.state;expect(validProfile({...createProfile(g),best:g.score})).toBe(true);
  }
  for(const goalDirector of [undefined,{...g.goalDirector!,version:1},{...g.goalDirector!,payoff:3}])
    expect(validProfile({...createProfile({...g,goalDirector} as GameState),best:g.score})).toBe(false);
});
it('has a complete legal route even when the shared search budget is exhausted',()=>{
  for(const budget of [512,1000,6000,24000])for(const board of [emptyBoard(),Array.from({length:64},(_,i)=>((i%8)+Math.floor(i/8))%2)]){
    const before=JSON.stringify(board),d=goalDirectorDeal(board,107,30,initialRhythmV4(),initialGoalDirector(),budget);
    verifyGoalDeal(board,d);expect(d.diagnostic.checks).toBeLessThanOrEqual(budget);
    expect(JSON.stringify(board)).toBe(before);
    expect(goalDirectorDeal(board,107,30,initialRhythmV4(),initialGoalDirector(),budget)).toEqual(d);
  }
});
it('prepares an immediate next-tray payoff and replans its reward on the actual board',()=>{
  const first=goalDirectorDeal(emptyBoard(),17);
  expect(first.director.payoff).toBe(1);
  const board=emptyBoard();board.fill(1,0,4);
  const rhythm={...initialRhythmV4(),cycleMoves:3};
  const payoff=goalDirectorDeal(board,19,3,rhythm,first.director);
  expect(payoff.diagnostic.requested).toBe('payoff');expect(payoff.diagnostic.goalFound).toBe(true);
  expect(verifyGoalDeal(board,payoff).reward).toBe(true);
  const changed=board.slice();changed[63]=1;
  const repair=goalDirectorDeal(changed,19,3,rhythm,first.director);
  verifyGoalDeal(changed,repair);expect(first.director.payoff).toBe(1);
});
it('proves large load jointly solvable and follows it with exactly two payoff attempts',()=>{
  const rhythm={...initialRhythmV4(),cycleMoves:30},saved={...initialGoalDirector(),deals:8,sinceLoad:3};
  const load=goalDirectorDeal(emptyBoard(),99,30,rhythm,saved);
  expect(load.diagnostic.actual).toBe('load');expect(load.diagnostic.large).toBe(2);
  expect(load.tray.some(s=>shapeById(s.shapeId).cells.length<=4)).toBe(true);
  verifyGoalDeal(emptyBoard(),load);expect(load.director.sinceLoad).toBe(0);expect(load.director.payoff).toBe(2);
  let state=load.director;const phases=[];
  for(let n=1;n<=3;n++){
    const d=goalDirectorDeal(emptyBoard(),99+n,30+n*3,rhythm,state);verifyGoalDeal(emptyBoard(),d);
    phases.push(d.diagnostic.requested);state=d.director;
  }
  expect(phases).toEqual(['payoff','payoff','prepare']);
});
it('cancels an actual completed goal and consumes one rest on a real refill',()=>{
  const g=newGame(3,'goal-rest','director-v2');g.goalDirector!.payoff=2;
  g.board=emptyBoard();g.board.fill(1,0,4);
  g.tray=[{shapeId:'I4-0',color:1,used:false},{shapeId:'S1-0',color:1,used:true},{shapeId:'S1-0',color:1,used:true}];
  const moved=applyMove(g,{slot:0,x:4,y:0},g.revision)!;
  expect(moved.allClear).toBe(true);expect(moved.state.goalDirector!.payoff).toBe(0);
  expect(moved.state.goalDirector!.last).toBe('rest');expect(moved.state.goalDirector!.rest).toBe(0);
});
it('preserves the reward receipt and spends exactly three real supported refills',()=>{
  const lost=newGame(3,'goal-revive','director-v2');
  lost.board=Array.from({length:64},(_,i)=>((i%8)+Math.floor(i/8))%2);
  lost.tray=[{shapeId:'O3-0',color:1,used:false},{shapeId:'S1-0',color:1,used:true},{shapeId:'S1-0',color:1,used:true}];lost.status='over';
  const revived=applyReceipt(prepareReward(createProfile(lost),'revive','revive'),{id:'receipt',intentId:'revive'});
  expect(validProfile(revived)).toBe(true);expect(revived.game.rhythm!.recoveryDeals).toBe(3);
  expect(applyReceipt(revived,{id:'other-receipt',intentId:'revive'}).game).toEqual(revived.game);
  let g=revived.game,route=[{slot:0,...placements(g.board,shapeById('O3-0'))[0]!}];
  for(let refill=0;refill<4;refill++){
    for(const move of route){
      const previous=g,used=g.tray.filter(s=>s.used).length,oldCount=g.rhythm!.recoveryDeals;
      const moved=applyMove(g,move,g.revision)!;expect(moved).not.toBeNull();
      expect(applyMove(moved.state,move,g.revision)).toBeNull();
      expect(moved.state.rhythm!.recoveryDeals).toBe(used===2?Math.max(0,oldCount-1):oldCount);g=JSON.parse(JSON.stringify(moved.state));
      if(used===2){
        const rhythm=advanceRhythmV4(previous.rhythm!,g.board,moved.lines,moved.allClear,random(previous.rngState).value);
        const d=goalDirectorDeal(g.board,previous.rngState,g.moves,rhythm,observeGoalDirector(previous.goalDirector!,moved.allClear));
        expect(d.diagnostic.requested==='recovery').toBe(refill<3);expect(d.tray).toEqual(g.tray);route=d.witness;
      }
    }
  }
  expect(g.rhythm!.recoveryDeals).toBe(0);
});
it.each(fixtures)('independently verifies the $kind decision and its full legal route',f=>{
  const deal=goalDirectorDeal(f.board,f.seed,f.moves,f.rhythm,f.saved as GoalDirectorState);
  expect(deal.diagnostic.certificate?.kind).toBe(f.kind);verifyGoalDeal(f.board,deal);
});
