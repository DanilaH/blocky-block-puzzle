import {ALL_SHAPES,REFERENCE_SHAPES,shapeById,type Board,type Move} from './rules';
import {challengeBuildDeal} from './challenge-build-v1';
import {WorkBudget,fullCatalog,toRows,canPlace,transition,occupied,type Rows} from './director-search';

export interface ShapeCatalogDecision {
 configId:'reference-shapes-v1';
 changed:boolean;
 reason:'protected'|'no-equal-area-slot'|'equal-area-proven'|'no-equivalent-proof';
 checks:number;
 slot?:number;from?:string;to?:string;
 baseline?:{lines:number;clears:number;occupied:number};
}

/** One area-equivalent replacement over 0.73; no legacy generator/catalog mutation. */
export function referenceShapeDeal(...args:Parameters<typeof challengeBuildDeal>){
 const base=challengeBuildDeal(...args),board=args[0];
 const rhythm=args[3],meter=new WorkBudget(24000),start=base.diagnostic.checks;
 meter.used=start;meter.ceiling=24000;
 const finish=(reason:ShapeCatalogDecision['reason'])=>({...base,
  diagnostic:{...base.diagnostic,checks:meter.used},
  shapeDecision:{configId:'reference-shapes-v1',changed:false,reason,checks:meter.used-start} as ShapeCatalogDecision});
 if(!args[2]||rhythm?.recoveryDeals||base.diagnostic.certificate||base.challengeDecision.task!=='ORDINARY'||base.fallback)return finish('protected');
 const slots=base.tray.map((s,slot)=>({slot,shape:shapeById(s.shapeId)})).filter(x=>x.shape.cells.length===2||x.shape.cells.length===4);
 if(!slots.length)return finish('no-equal-area-slot');
 const ops=fullCatalog(),rows=toRows(board);let b=rows,lines=0,clears=0;
 for(const m of base.witness){const id=ALL_SHAPES.findIndex(s=>s.id===base.tray[m.slot]!.shapeId),op=ops[id]!.find(o=>o.x===m.x&&o.y===m.y)!;
  if(!canPlace(b,op,meter))return finish('no-equivalent-proof');const n=transition(b,op,meter);if(!n)return finish('no-equivalent-proof');b=n.rows;lines+=n.lines;clears+=Number(n.clear);}
 const target={lines,clears,occupied:occupied(b)},recent=(rhythm?.recentBags??[]).join(',').split(',');
 const attempts=slots.flatMap(({slot,shape})=>REFERENCE_SHAPES.filter(s=>s.cells.length===shape.cells.length).map(s=>({slot,shape:s,
  history:recent.filter(f=>f===s.family).length,rank:((base.rngState^Math.imul(ALL_SHAPES.indexOf(s)+1,0x9e3779b1))>>>0)})))
  .sort((a,b)=>a.history-b.history||a.rank-b.rank||a.slot-b.slot);
 for(const attempt of attempts){
  if(meter.used>=meter.ceiling)break;
  const replacement=ALL_SHAPES.indexOf(attempt.shape);
  let initiallyFits=false;for(const op of ops[replacement]!){const fit=canPlace(rows,op,meter);if(fit===null)break;if(fit){initiallyFits=true;break;}}
  if(!initiallyFits)continue;
  const tray=base.tray.map((s,i)=>i===attempt.slot?{...s,shapeId:attempt.shape.id}:s),ids=tray.map(s=>ALL_SHAPES.findIndex(p=>p.id===s.shapeId));
  const order=base.witness.map(m=>m.slot),preferred=ids.map((id,slot)=>{
   const at=base.witness.find(m=>m.slot===slot)!,list=ops[id]!,first=list.find(o=>o.x===at.x&&o.y===at.y);
   return first?[first,...list.filter(o=>o!==first)]:list;
  });
  const failed=new Set<string>();
  function visit(board:Rows,left:number[],path:Move[],l:number,c:number):Move[]|null{
   if(l>target.lines||c>target.clears)return null;
   if(!left.length)return l===target.lines&&c===target.clears&&occupied(board)===target.occupied?path:null;
   const key=board.join()+':'+left.join()+':'+l+':'+c;if(failed.has(key))return null;
   for(const slot of left)for(const op of preferred[slot]!){const fits=canPlace(board,op,meter);if(fits===null)return null;if(!fits)continue;
    const next=transition(board,op,meter);if(!next)return null;const pathFound=visit(next.rows,left.filter(i=>i!==slot),[...path,{slot,x:op.x,y:op.y}],l+next.lines,c+Number(next.clear));if(pathFound)return pathFound;
    if(meter.used>=meter.ceiling)return null;
   }
   failed.add(key);return null;
  }
  const witness=visit(rows,order,[],0,0);
  if(witness)return{...base,tray,witness,
   diagnostic:{...base.diagnostic,checks:meter.used,source:base.diagnostic.source+'+reference-shapes'},
   challengeDecision:{...base.challengeDecision,initialSlots:3,legalFirstMoveCount:null},
   shapeDecision:{configId:'reference-shapes-v1',changed:true,reason:'equal-area-proven',checks:meter.used-start,slot:attempt.slot,from:base.tray[attempt.slot]!.shapeId,to:attempt.shape.id,baseline:target} as ShapeCatalogDecision};
 }
 return finish('no-equivalent-proof');
}
