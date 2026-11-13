import {it,expect} from 'vitest';
import {emptyBoard,place,shapeById,type Slot} from '../src/core/rules';
import {boundedOptions,chooseMixed} from '../scripts/director/mixed-players';
import {choose} from '../scripts/difficulty/players';

it('separates bounded one-step mistakes from ignoring an obvious line reward',()=>{
 const board=emptyBoard();board.fill(1,0,4);
 const tray:Slot[]=Array.from({length:3},()=>({shapeId:'I4-0',color:1,used:false}));
 const options=boundedOptions(board,tray);expect(options.length).toBeGreaterThan(0);
 for(const {move} of options)expect(place(board,shapeById(tray[move.slot]!.shapeId),move.x,move.y).lines).toBe(1);
 const extreme=choose(board,tray,'plausible',.999)!;
 expect(place(board,shapeById(tray[extreme.slot]!.shapeId),extreme.x,extreme.y).lines).toBe(0);
 expect(chooseMixed(board,tray,'bounded',.999).move).toEqual(options.at(-1)!.move);
});
it('records actual changed lapse choices separately from the RNG branch',()=>{
 const board=emptyBoard(),tray:Slot[]=[{shapeId:'I4-0',color:1,used:false}];
 expect(chooseMixed(board,tray,'lapse',.4).perturbed).toBe(false);
 const same=chooseMixed(board,tray,'lapse',0);expect(same.perturbed).toBe(true);expect(same.different).toBe(false);
});
