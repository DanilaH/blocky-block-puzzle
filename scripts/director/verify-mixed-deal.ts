/** Offline verification using public rules and the independent difficulty solver. */
import {fits,place,shapeById,placements,type Board,type Slot,type Move} from '../../src/core/rules';
import {analyze} from '../difficulty/analyze';
import type {mixedDirectorDeal} from '../../src/core/mixed-director';
type Deal=ReturnType<typeof mixedDirectorDeal>;
const need=(ok:unknown,message:string)=>{if(!ok)throw Error(message);};
function replay(board:Board,tray:Slot[],moves:Move[]){
 let b=board,cleared=false;const used=new Set<number>();
 for(const m of moves){need(!used.has(m.slot),'Duplicate proof slot');need(m.slot>=0&&m.slot<3,'Invalid slot');used.add(m.slot);
  const s=shapeById(tray[m.slot]!.shapeId);need(fits(b,s,m.x,m.y),'Illegal proof move');b=place(b,s,m.x,m.y).board;cleared||=b.every(x=>!x);}
 need(used.size===3,'Incomplete route');return cleared;
}
export function verifyMixedDeal(board:Board,d:Pick<Deal,'tray'|'witness'|'diagnostic'>){
 const reward=replay(board,d.tray,d.witness),r=d.diagnostic.robustness,unique=new Set<string>();
 need(d.diagnostic.checks<=d.diagnostic.limit,'Exceeded shared work bound');
 if(d.diagnostic.goalFound)need(reward,'Gift lacks a rewarding route');
 let safe=0,unknown=0,goals=0,negative=0;
 for(const root of r.roots){
  const m=root.move,s=shapeById(d.tray[m.slot]!.shapeId),key=s.id+':'+m.x+','+m.y;
  need(!unique.has(key),'Duplicate conceptual first choice');unique.add(key);need(fits(board,s,m.x,m.y),'Illegal root');
  const b=place(board,s,m.x,m.y).board;need(root.immediateClear===b.every(x=>!x),'Wrong immediate reward');
  if(root.status==='found'){need(root.witness,'Missing positive root proof');need(JSON.stringify(root.witness![0])===JSON.stringify(m),'Root witness does not start at root');replay(board,d.tray,root.witness!);safe++;}
  if(root.status==='unknown')unknown++;
  if(root.goalStatus==='found'){need(root.goalWitness,'Missing rewarding root proof');need(JSON.stringify(root.goalWitness![0])===JSON.stringify(m),'Goal witness does not start at root');need(replay(board,d.tray,root.goalWitness!),'Nonrewarding goal proof');goals++;}
  if(root.status==='unsolvable'||root.goalStatus==='unsolvable'){
   const tray=d.tray.map((s,i)=>({...s,used:i===m.slot})),a=analyze(b,tray,100000);need(a.complete,'Offline remainder proof exhausted');negative++;
   if(root.status==='unsolvable')need(a.status==='unsolvable','False fatal first move');
   if(root.goalStatus==='unsolvable')need(!b.every(x=>!x)&&!a.allClearPossible,'False lost-reward claim');
  }
 }
 need(safe===r.safe&&unknown===r.unknown&&goals===r.rewardSafe,'Wrong robustness counts');
 if(r.adequate){need(r.roots.length>=r.required&&r.roots.slice(0,r.required).every(x=>x.status==='found')&&safe>=3,'Insufficient viable beginnings');
  if(d.diagnostic.goalFound)need(goals>=2||r.roots[0]?.immediateClear&&r.roots[0]?.goalStatus==='found','Gift is only a hidden narrow route');}
 return {reward,safe,goals,unknown,negative,initialAvailable:d.tray.filter(s=>placements(board,shapeById(s.shapeId)).length).length};
}
