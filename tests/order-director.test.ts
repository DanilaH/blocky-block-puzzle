import {it,expect} from 'vitest';
import {newGame,applyMove,shapeById,place,fits,emptyBoard,type GameState} from '../src/core/rules';
import {initialOrderDirector,orderDirectorDeal,observeOrderDirector,validOrderDirector} from '../src/core/order-director';
import {initialRhythmV4} from '../src/core/rhythm';
import {createProfile,validProfile} from '../src/core/profile';
import {choose} from '../scripts/difficulty/players';
import orderFixture from '../scripts/director/order-board.json';
import {placements} from '../src/core/rules';
import {prepareReward,applyReceipt} from '../src/core/monetization';
import {advanceRhythmV4} from '../src/core/rhythm';

function prove(board:number[],d:ReturnType<typeof orderDirectorDeal>){
  let b=board;const used=new Set();
  for(const m of d.witness!){expect(used.has(m.slot)).toBe(false);used.add(m.slot);
    const s=shapeById(d.tray[m.slot]!.shapeId);expect(fits(b,s,m.x,m.y)).toBe(true);b=place(b,s,m.x,m.y).board;}
  expect(used.size).toBe(3);
}
it('creates a versioned, valid profile and preserves exact serialized decisions',()=>{
  let g=newGame(811001,'order-save','director-v1');
  expect(validProfile(createProfile(g))).toBe(true);expect(validOrderDirector(g.director)).toBe(true);
  for(let i=0;i<18&&g.status==='playing';i++){
    const m=choose(g.board,g.tray,'three')!;
    const a=applyMove(g,m,g.revision)!,b=applyMove(JSON.parse(JSON.stringify(g)),m,g.revision)!;
    expect(a).toEqual(b);expect(applyMove(a.state,m,g.revision)).toBeNull();g=a.state;
    expect(validProfile({...createProfile(g),best:g.score})).toBe(true);
  }
  const damaged={...g,director:{...g.director!,sinceLoad:999}};
  expect(validProfile({...createProfile(g),game:damaged,best:g.score})).toBe(false);
});
it('returns replayable constructive routes within one shared work limit',()=>{
  for(const budget of [512,1000,24000])for(let seed=1;seed<=8;seed++){
    const board=emptyBoard();const before=JSON.stringify(board);
    const d=orderDirectorDeal(board,seed,0,initialRhythmV4(),initialOrderDirector(),{budget});
    expect(d.diagnostic.checks).toBeLessThanOrEqual(budget);expect(d.witness).not.toBeNull();prove(board,d);
    expect(JSON.stringify(board)).toBe(before);
    expect(orderDirectorDeal(board,seed,0,initialRhythmV4(),initialOrderDirector(),{budget})).toEqual(d);
  }
});
it('samples a large load only from individually fitting figures and shuffles slots',()=>{
  const d=orderDirectorDeal(emptyBoard(),99,30,{...initialRhythmV4(),cycleMoves:30},{...initialOrderDirector(),sinceLoad:3});
  expect(d.diagnostic.actual).toBe('load');expect(d.diagnostic.source).toBe('load-risk-individually-fitting');
  expect(d.witness).toBeNull();expect(d.tray.some(s=>shapeById(s.shapeId).cells.length>=6)).toBe(true);
  expect(d.tray.some(s=>shapeById(s.shapeId).cells.length<=4)).toBe(true);
  for(const slot of d.tray)expect(fits(emptyBoard(),shapeById(slot.shapeId),0,0)).toBe(true);
  expect(d.director.sinceLoad).toBe(0);
  const guarded=orderDirectorDeal(emptyBoard(),99,30,{...initialRhythmV4(),cycleMoves:30},{...initialOrderDirector(),sinceLoad:3},{guardLoad:true});
  expect(guarded.witness).not.toBeNull();prove(emptyBoard(),guarded);
  const mature=orderDirectorDeal(emptyBoard(),99,30,{...initialRhythmV4(),cycleMoves:30},{...initialOrderDirector(),deals:8,sinceLoad:3});
  expect(mature.diagnostic.large).toBe(2);
});
it('actual all-clear requests a rest; recovery overrides load for exactly the persisted window',()=>{
  const d=observeOrderDirector({...initialOrderDirector(),sinceLoad:10},true);
  expect(d.rest).toBe(1);
  const rest=orderDirectorDeal(emptyBoard(),90,30,{...initialRhythmV4(),cycleMoves:30},d);
  expect(rest.diagnostic.requested).toBe('rest');expect(rest.director.rest).toBe(0);
  const recovery=orderDirectorDeal(emptyBoard(),91,30,{...initialRhythmV4(),cycleMoves:30,recoveryDeals:3},d);
  expect(recovery.diagnostic.requested).toBe('recovery');expect(recovery.witness).not.toBeNull();prove(emptyBoard(),recovery);
});
it('constructs an order dependency with an independently checkable unavailable figure',()=>{
  const d=orderDirectorDeal(orderFixture.board,orderFixture.seed,30,{...initialRhythmV4(),cycleMoves:30},initialOrderDirector());
  expect(d.diagnostic.actual).toBe('order');expect([2,4]).toContain(d.diagnostic.orderBound);
  const available=d.tray.filter(s=>placements(orderFixture.board,shapeById(s.shapeId)).length>0).length;
  expect(available).toBeLessThan(3);expect(available).toBeGreaterThan(0);prove(orderFixture.board,d);
});
it('does not schedule another load until three intervening trays have been dealt',()=>{
  let saved={...initialOrderDirector(),deals:8,sinceLoad:3};
  const kinds=[];
  for(let i=0;i<5;i++){
    const d=orderDirectorDeal(emptyBoard(),300+i,30+i*3,{...initialRhythmV4(),cycleMoves:30},saved);
    kinds.push(d.diagnostic.actual);saved=d.director;
  }
  expect(kinds).toEqual(['load','build','build','build','load']);
});
it('consumes an actual all-clear rest once on the next refill',()=>{
  const g=newGame(19,'rest','director-v1');
  g.board=emptyBoard();g.board.fill(1,0,4);
  g.tray=[{shapeId:'I4-0',color:1,used:false},{shapeId:'S1-0',color:1,used:true},{shapeId:'S1-0',color:1,used:true}];
  const moved=applyMove(g,{slot:0,x:4,y:0},g.revision)!;
  expect(moved.allClear).toBe(true);expect(moved.state.director!.last).toBe('rest');
  expect(moved.state.director!.rest).toBe(0);
});
it('grants recovery atomically once and spends exactly three supported refills',()=>{
  const lost=newGame(3,'director-revive','director-v1');
  lost.board=Array.from({length:64},(_,i)=>((i%8)+Math.floor(i/8))%2);
  lost.tray=[{shapeId:'O3-0',color:1,used:false},{shapeId:'S1-0',color:1,used:true},{shapeId:'S1-0',color:1,used:true}];
  lost.status='over';lost.director={...lost.director!,sinceLoad:12};
  const prepared=prepareReward(createProfile(lost),'revive','revive');
  const revived=applyReceipt(prepared,{id:'receipt',intentId:'revive'});
  expect(validProfile(revived)).toBe(true);
  expect(applyReceipt(revived,{id:'receipt-again',intentId:'revive'}).game).toEqual(revived.game);
  let g=revived.game;
  expect(g.rhythm!.recoveryDeals).toBe(3);
  let route=[{slot:0,...placements(g.board,shapeById('O3-0'))[0]!}];
  for(let refill=0;refill<4;refill++){
    let last:ReturnType<typeof applyMove>=null;
    for(const move of route){
      const before=structuredClone(g),oldRecovery=g.rhythm!.recoveryDeals;
      const oldUsed=g.tray.filter(s=>s.used).length;
      last=applyMove(g,move,g.revision)!;expect(last).not.toBeNull();
      expect(applyMove(last.state,move,g.revision)).toBeNull();
      expect(g).toEqual(before);
      expect(last.state.rhythm!.recoveryDeals).toBe(oldUsed===2?Math.max(0,oldRecovery-1):oldRecovery);
      if(oldUsed===2){
        const rhythm=advanceRhythmV4(g.rhythm!,last.state.board,last.lines,last.allClear,0);
        const diagnostic=orderDirectorDeal(last.state.board,g.rngState,g.moves+1,rhythm,observeOrderDirector(g.director!,last.allClear));
        expect(diagnostic.tray).toEqual(last.state.tray);
        expect(diagnostic.diagnostic.requested==='recovery').toBe(refill<3);
        expect(diagnostic.witness).not.toBeNull();route=diagnostic.witness!;
      }
      g=JSON.parse(JSON.stringify(last.state));
    }
  }
  expect(g.rhythm!.recoveryDeals).toBe(0);
});
it('rejects missing or corrupt persisted director state without migrating old policies',()=>{
  const g=newGame(3,'bad','director-v1');
  for(const director of [undefined,{...g.director!,version:2},{...g.director!,rest:2}])
    expect(validProfile(createProfile({...g,director} as GameState))).toBe(false);
  expect(validProfile(createProfile(newGame(3,'old','flow-v4')))).toBe(true);
});
