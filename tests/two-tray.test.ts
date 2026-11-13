import {it,expect} from 'vitest';
import {newGame,type Board} from '../src/core/rules';
import {finishInThree,replayRoute,constructEpisode,resolvePayoff,validEpisode} from '../scripts/director/two-tray';

it('constructs an actual three-piece full-clear route and leaves the input intact',()=>{
  const board:Board=Array(64).fill(0);for(let x=0;x<5;x++)board[x]=2;
  const before=JSON.stringify(board),r=finishInThree(board,123);
  expect(r.status).toBe('found');expect(r.checks).toBeLessThanOrEqual(12000);
  const proof=replayRoute(board,r.tray!,r.witness!)!;
  expect(proof.used).toBe(3);expect(proof.board.every(v=>!v)).toBe(true);
  expect(JSON.stringify(board)).toBe(before);expect(finishInThree(board,123)).toEqual(r);
});
it('keeps unknown explicit for zero/limited budgets and unsupported target geometry',()=>{
  const board=Array.from({length:64},(_,i)=>i%2===Math.floor(i/8)%2?1:0);
  expect(finishInThree(board,1,0)).toMatchObject({status:'unknown',checks:0,reason:'budget'});
  expect(finishInThree(board,1)).toMatchObject({status:'unknown',reason:'no-route-in-target-class'});
  expect(()=>finishInThree(board,1,12001)).toThrow();
});
it('requires a complete six-placement proof before changing the opening',()=>{
  const game=newGame(611001,'two-tray-test','flow-v4'),before=JSON.stringify(game);
  const r=constructEpisode(game,611001);
  expect(r.changed).toBe(true);expect(r.state.rngState).toBe(game.rngState);
  expect(JSON.stringify(game)).toBe(before);expect(r.checks).toBeLessThanOrEqual(48000);
  const setup=replayRoute(game.board,r.state.tray,r.setupWitness!)!;
  expect(setup.allClears).toBe(0);
  const payoff=resolvePayoff(setup.board,r.state.rngState,r.episode);
  expect(payoff.mode).toBe('planned');expect(payoff.checks).toBe(0);
  expect(replayRoute(setup.board,payoff.tray!,payoff.witness!)!.board.every(v=>!v)).toBe(true);
  expect(payoff.episode.stage).toBe('done');
  expect(resolvePayoff(setup.board,1,payoff.episode).reason).toBe('spent-stage');
});
it('repairs from the actual board and refuses stale/corrupt proof application',()=>{
  const r=constructEpisode(newGame(611001,'two-tray-test','flow-v4'),611001);
  const actual:Board=Array(64).fill(0);for(let x=0;x<5;x++)actual[56+x]=4;
  const repaired=resolvePayoff(actual,77,r.episode);
  expect(repaired.mode).toBe('repaired');
  expect(replayRoute(actual,repaired.tray!,repaired.witness!)!.board.every(v=>!v)).toBe(true);
  const restored=JSON.parse(JSON.stringify(r.episode));expect(validEpisode(restored)).toBe(true);
  expect(resolvePayoff(actual,77,restored)).toEqual(repaired);
  const corrupt={...restored,witness:[{slot:9,x:0,y:0}]};
  expect(validEpisode(corrupt)).toBe(false);
  expect(resolvePayoff(actual,77,corrupt).reason).toBe('invalid-state');
  expect(resolvePayoff(actual,77,r.episode,0)).toMatchObject({mode:'fallback',status:'unknown',reason:'budget'});
});
it('preserves the original on construction exhaustion and progressed games',()=>{
  const game=newGame(611001,'two-tray-test','flow-v4');
  expect(constructEpisode(game,611001,0)).toMatchObject({state:game,changed:false,checks:0});
  const progressed={...game,moves:3};
  expect(constructEpisode(progressed,1).state).toBe(progressed);
});
