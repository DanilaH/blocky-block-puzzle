/** Offline opening-stage pilot. Saved games and production flow-v4 are untouched. */
import {SHAPES,random,emptyBoard,proveTray,shapeById,type GameState,type Slot} from '../../src/core/rules';

const eligible=SHAPES.filter(s=>s.cells.length<=6);
const weight=eligible.reduce((n,s)=>n+s.weight,0);
const bag=(tray:readonly Slot[])=>tray.map(s=>shapeById(s.shapeId).family).sort().join(',');

/** Sample catalog weights on a deterministic opening-only stream. Preserve the
 * original future RNG so the experiment changes only the first tray decision. */
export function variedOpening(game:GameState,seed:number) {
  if(game.moves!==0||game.revision!==0||game.score!==0||game.dealerVersion!=='flow-v4'||
    game.reviveUsed||game.board.some(Boolean)||game.tray.some(s=>s.used))
    return {state:game,changed:false,attempts:0,witness:null};
  let rng=(seed>>>0)^0x6f70656e;
  if(!rng)rng=1;
  for(let attempt=1;attempt<=32;attempt++) {
    const tray:Slot[]=[];
    for(let slot=0;slot<3;slot++) {
      const roll=random(rng);rng=roll.state;
      let target=roll.value*weight,chosen=eligible.at(-1)!;
      for(const shape of eligible){target-=shape.weight;if(target<0){chosen=shape;break;}}
      tray.push({shapeId:chosen.id,used:false,color:(SHAPES.indexOf(chosen)%6)+1});
    }
    if(new Set(tray.map(s=>shapeById(s.shapeId).family)).size<2)continue;
    const witness=proveTray(emptyBoard(),tray,5000);
    if(!witness)continue;
    return {state:{...game,tray,rhythm:{...game.rhythm!,recentBags:[bag(tray)]}},
      changed:JSON.stringify(tray)!==JSON.stringify(game.tray),attempts:attempt,witness};
  }
  return {state:game,changed:false,attempts:32,witness:null};
}

/** Exhaustive catalog certificate: rotations do not create another family. */
export function catalogAreaBags(area:number,maxPieceArea=Infinity) {
  const families=[...new Map(SHAPES.filter(s=>s.cells.length<=maxPieceArea).map(s=>[s.family,s.cells.length])).entries()];
  const bags:string[]=[];
  for(let i=0;i<families.length;i++)for(let j=i;j<families.length;j++)for(let k=j;k<families.length;k++) {
    const selected=[families[i]!,families[j]!,families[k]!];
    if(selected.reduce((n,x)=>n+x[1],0)===area)bags.push(selected.map(x=>x[0]).sort().join(','));
  }
  return bags.sort();
}
