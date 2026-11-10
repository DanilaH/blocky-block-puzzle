/** Offline players. No director state, certificates, or future trays are visible. */
import type {Board,Slot,Move} from '../../src/core/rules';
import {choose} from '../difficulty/players';
import {actions,transition,toRows,occupied} from '../difficulty/analyze';

export const mixedStyles=['clear','three','plausible','bounded','lapse'] as const;
export type MixedStyle=typeof mixedStyles[number];
const pop=(n:number)=>{let c=0;for(;n;n&=n-1)c++;return c;};
export function boundedOptions(board:Board,tray:Slot[]){
 const rows=toRows(board);
 const ranked=actions(rows,tray).map(op=>{
  const n=transition(rows,op);let edges=0,holes=0;
  for(let y=0;y<8;y++){
   const row=n.rows[y]!,empty=~row&255;
   edges+=pop((row^(row<<1))&255)+pop(row^(n.rows[y+1]??0));
   const near=((empty<<1)|(empty>>1)|(~(n.rows[y-1]??255)&255)|(~(n.rows[y+1]??255)&255))&255;
   holes+=pop(empty&~near);
  }
  return {move:{slot:op.slot,x:op.x,y:op.y},value:n.lines*200-occupied(n.rows)*2-edges-holes*20};
 }).sort((a,b)=>b.value-a.value);
 // Same one-step heuristic as the old plausible player, but a bounded error:
 // clearly superior line clears cannot be diluted by four inferior options.
 return ranked.filter(x=>x.value>=(ranked[0]?.value??0)-20).slice(0,5);
}
export function chooseMixed(board:Board,tray:Slot[],style:MixedStyle,roll:number):{move:Move|null;perturbed:boolean;different:boolean}{
 const same=(a:Move|null,b:Move|null)=>JSON.stringify(a)===JSON.stringify(b);
 if(style==='bounded'){
  const options=boundedOptions(board,tray),move=options[Math.min(options.length-1,Math.floor(roll*options.length))]?.move??null;
  return {move,perturbed:false,different:!same(move,options[0]?.move??null)};
 }
 const perturbed=style==='lapse'&&roll<.2;
 const move=choose(board,tray,style==='lapse'?(perturbed?'plausible':'three'):style,perturbed?roll/.2:roll);
 return {move,perturbed,different:perturbed&&!same(move,choose(board,tray,'three'))};
}
