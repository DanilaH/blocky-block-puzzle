import {it,expect} from 'vitest';
import {newGame,applyMove,random} from '../src/core/rules';
import {choose} from '../scripts/difficulty/players';
import {constructEpisode,resolvePayoff} from '../scripts/director/two-tray';
import {observeEpisode} from '../scripts/director/two-tray-feedback';

it('cancels the remaining plan when a real player route clears earlier than its witness',()=>{
  const seed=611001,planned=constructEpisode(newGame(seed,'early-feedback','flow-v4'),seed);
  let game=planned.state,episode=planned.episode;
  const before=JSON.stringify(episode);
  const first=applyMove(game,choose(game.board,game.tray,'three',random(seed+game.moves).value)!,game.revision)!;
  expect(first.allClear).toBe(false);expect(observeEpisode(episode,first)).toBe(episode);game=first.state;
  const second=applyMove(game,choose(game.board,game.tray,'three',random(seed+game.moves).value)!,game.revision)!;
  expect(second.allClear).toBe(true);expect(second.state.moves).toBe(2);
  const spent=observeEpisode(episode,second);
  expect(spent.stage).toBe('done');expect(JSON.stringify(episode)).toBe(before);
  expect(observeEpisode(spent,second)).toBe(spent);
  expect(resolvePayoff(second.state.board,second.state.rngState,spent).reason).toBe('spent-stage');
});
it('keeps a serialized pending plan until reward or defeat is actually committed',()=>{
  const planned=constructEpisode(newGame(611001,'feedback','flow-v4'),611001);
  const game=planned.state;
  const move=planned.setupWitness![0]!,accepted=applyMove(game,move,game.revision)!;
  expect(accepted.allClear).toBe(false);
  const restored=JSON.parse(JSON.stringify(planned.episode));
  expect(observeEpisode(restored,accepted)).toBe(restored);
  const final={...accepted,state:{...accepted.state,status:'over' as const}};
  expect(observeEpisode(restored,final).stage).toBe('done');
});
