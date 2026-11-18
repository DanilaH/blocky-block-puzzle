import {it,expect} from 'vitest';
import {newGame,place,fits,shapeById,applyMove} from '../src/core/rules';
import {variedOpening,catalogAreaBags} from '../scripts/director/varied-opening';
it('certifies the two compositions that an equal-area antirepeat cannot diversify',()=>{
  expect(catalogAreaBags(24)).toEqual(['O3,O3,R6']);
  expect(catalogAreaBags(18,6)).toEqual(['R6,R6,R6']);
});
it('provides varied, replayable starts without changing future RNG or the input',()=>{
  const signatures=new Set<string>();
  const original=newGame(1001,'opening-test','flow-v4'),before=JSON.stringify(original);
  for(let seed=1001;seed<=1032;seed++) {
    const result=variedOpening(original,seed),same=variedOpening(original,seed);
    expect(result).toEqual(same);expect(JSON.stringify(original)).toBe(before);
    expect(result.state.rngState).toBe(original.rngState);
    expect(result.witness).toHaveLength(3);
    const families=result.state.tray.map(s=>shapeById(s.shapeId).family);
    expect(new Set(families).size).toBeGreaterThanOrEqual(2);
    signatures.add(families.sort().join(','));
    let board=result.state.board;
    for(const move of result.witness!) {
      const shape=shapeById(result.state.tray[move.slot]!.shapeId);
      expect(shape.cells.length).toBeLessThanOrEqual(6);
      expect(fits(board,shape,move.x,move.y)).toBe(true);
      board=place(board,shape,move.x,move.y).board;
    }
  }
  expect(signatures.size).toBeGreaterThanOrEqual(8);
});
it('leaves progressed and non-flow games exactly unchanged',()=>{
  const game=newGame(1001,'opening-test','flow-v4'),opening=variedOpening(game,1001);
  const move=opening.witness![0]!,next=applyMove(opening.state,move,opening.state.revision)!.state;
  expect(variedOpening(next,1001).state).toBe(next);
  const control=newGame(1001,'control','initial-v1');
  expect(variedOpening(control,1001).state).toBe(control);
  const restored={...game,revision:1};
  expect(variedOpening(restored,1001).state).toBe(restored);
});
