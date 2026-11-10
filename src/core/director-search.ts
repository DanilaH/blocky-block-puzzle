import {SHAPES,type Board,type Move,type Slot} from './rules';

export const DIRECTOR_WORK_LIMIT=24000;
export class WorkBudget {
  used=0;
  ceiling:number;
  constructor(readonly limit=DIRECTOR_WORK_LIMIT){
    if(!Number.isInteger(limit)||limit<512||limit>DIRECTOR_WORK_LIMIT)throw Error('Invalid director budget');
    this.ceiling=limit-512;
  }
  spend(){if(this.used>=this.ceiling)return false;this.used++;return true;}
}
export type Rows=number[];
export type Operation={shape:number;x:number;y:number;rows:Rows};
export const POP=Array.from({length:256},(_,n)=>{let c=0;for(;n;n&=n-1)c++;return c;});
let cachedCatalog:Operation[][]|undefined;
export const catalog=()=>cachedCatalog??=SHAPES.map((shape,index)=>{
  const list:Operation[]=[];
  for(let y=0;y<=8-shape.height;y++)for(let x=0;x<=8-shape.width;x++){
    const rows=Array<number>(8).fill(0);
    for(const [dx,dy] of shape.cells)rows[y+dy]!|=1<<(x+dx);
    list.push({shape:index,x,y,rows});
  }
  return list;
});
export const toRows=(b:Board)=>Array.from({length:8},(_,y)=>b.slice(y*8,y*8+8).reduce((n,v,x)=>n|(v?1<<x:0),0));
export const occupied=(r:Rows)=>r.reduce((n,x)=>n+POP[x]!,0);
export function canPlace(rows:Rows,op:Operation,meter:WorkBudget):boolean|null {
  if(!meter.spend())return null;
  return op.rows.every((v,y)=>!(v&rows[y]!));
}
export function transition(rows:Rows,op:Operation,meter:WorkBudget){
  if(!meter.spend())return null;
  const next=rows.map((r,y)=>r|op.rows[y]!);let cols=255;
  for(const r of next)cols&=r;
  let lines=POP[cols]!;
  for(let y=0;y<8;y++){if(next[y]===255){next[y]=0;lines++;}next[y]=next[y]!&~cols;}
  return {rows:next,lines,clear:occupied(next)===0};
}
export function legalOperations(rows:Rows,meter:WorkBudget){
  const result:Operation[]=[];
  for(const list of catalog())for(const op of list){
    const fits=canPlace(rows,op,meter);if(fits===null)return {complete:false,ops:result};if(fits)result.push(op);
  }
  return {complete:true,ops:result};
}
export function proveIds(rows:Rows,ids:number[],meter:WorkBudget){
  let exhausted=false;
  function visit(board:Rows,left:number[],path:Operation[]):Operation[]|null {
    if(!left.length)return path;
    for(let i=0;i<left.length;i++)for(const op of catalog()[left[i]!]!){
      const fits=canPlace(board,op,meter);if(fits===null){exhausted=true;return null;}if(!fits)continue;
      const next=transition(board,op,meter);if(!next){exhausted=true;return null;}
      const found=visit(next.rows,left.filter((_,j)=>i!==j),[...path,op]);if(found)return found;
      if(exhausted)return null;
    }
    return null;
  }
  const path=visit(rows,[...ids],[]);
  return {path,status:path?'found' as const:exhausted?'unknown' as const:'unsolvable' as const};
}
export function packagePath(path:Operation[],shuffle:number[]){
  const tray:Slot[]=shuffle.map(i=>({shapeId:SHAPES[path[i]!.shape]!.id,color:(path[i]!.shape%6)+1,used:false}));
  const witness:Move[]=path.map((op,i)=>({slot:shuffle.indexOf(i),x:op.x,y:op.y}));
  return {tray,witness};
}
export function pathReward(rows:Rows,path:Operation[],meter:WorkBudget){
  let lines=0,board=rows;
  for(const op of path){const next=transition(board,op,meter);if(!next)return null;lines+=next.lines;board=next.rows;}
  return {lines,occupied:occupied(board),rows:board};
}
