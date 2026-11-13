/** Offline goal construction. Production does not import this module. */
import {SHAPES,random,place,fits,shapeById,type Board,type Slot,type Move,type GameState} from '../../src/core/rules';
import {variedOpening} from './varied-opening';

const POP=Array.from({length:256},(_,n)=>{let count=0;for(;n;n&=n-1)count++;return count;});
const rowsOf=(board:Board)=>Array.from({length:8},(_,y)=>board.slice(y*8,y*8+8).reduce((n,v,x)=>n|(v?1<<x:0),0));
const count=(rows:readonly number[])=>rows.reduce((n,r)=>n+POP[r]!,0);
type Op={shape:number;x:number;y:number;rows:number[]};
const covering:Op[][]=Array.from({length:64},()=>[]);
for(let shape=0;shape<SHAPES.length;shape++) {
  const s=SHAPES[shape]!;
  for(let y=0;y<=8-s.height;y++)for(let x=0;x<=8-s.width;x++) {
    const rows=Array<number>(8).fill(0);
    for(const [dx,dy] of s.cells)rows[y+dy]!|=1<<(x+dx);
    const op={shape,x,y,rows};
    for(const [dx,dy] of s.cells)covering[(y+dy)*8+x+dx]!.push(op);
  }
}
const targets:{rows:number[];area:number;lines:number}[]=[];
for(let r=0;r<256;r++)for(let c=0;c<256;c++) {
  const lines=POP[r]!+POP[c]!;if(!lines||lines>4)continue;
  const rows=Array.from({length:8},(_,y)=>r&(1<<y)?255:c);
  targets.push({rows,area:count(rows),lines});
}
targets.sort((a,b)=>a.area-b.area||a.lines-b.lines||(a.rows.join(',')<b.rows.join(',')?-1:a.rows.join(',')>b.rows.join(',')?1:0));
const permutations=[[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]];

export function replayRoute(board:Board,tray:readonly Slot[],witness:readonly Move[]) {
  let current=board,lines=0,allClears=0;
  const used=new Set<number>();
  for(const move of witness) {
    if(used.has(move.slot)||!tray[move.slot]||tray[move.slot]!.used)return null;
    const shape=shapeById(tray[move.slot]!.shapeId);
    if(!fits(current,shape,move.x,move.y))return null;
    used.add(move.slot);
    const result=place(current,shape,move.x,move.y,tray[move.slot]!.color);
    current=result.board;lines+=result.lines;allClears+=Number(current.every(v=>!v));
  }
  return {board:current,lines,allClears,used:used.size};
}

export type PayoffResult={
  status:'found'|'unknown';reason:string;checks:number;targetChecks:number;
  tray:Slot[]|null;witness:Move[]|null;target:number[]|null;
};

/** Exact covers in a bounded target class. Missing a route is always unknown. */
export function finishInThree(board:Board,seed:number,budget=12000):PayoffResult {
  if(board.length!==64||!Number.isInteger(budget)||budget<0||budget>12000)throw Error('Invalid payoff input');
  if(!budget)return {status:'unknown',reason:'budget',checks:0,targetChecks:0,tray:null,witness:null,target:null};
  const initial=rowsOf(board),occupied=count(initial);
  let checks=0,targetChecks=0,exhausted=false;
  const rank=SHAPES.map((_,i)=>({i,rank:random((seed>>>0)^Math.imul(i+1,0x9e3779b9)).value}));
  rank.sort((a,b)=>a.rank-b.rank);const priority=new Map(rank.map((x,i)=>[x.i,i]));
  const ordered=covering.map(list=>[...list].sort((a,b)=>priority.get(a.shape)!-priority.get(b.shape)!));
  let found:PayoffResult|null=null;
  const visible=permutations[Math.floor(random((seed>>>0)^0x7061796f).value*6)]!;
  function search(missing:number[],pieces:Op[],target:number[]) {
    const left=count(missing),remaining=3-pieces.length;
    if(!left) {
      if(remaining)return false;
      for(const order of permutations) {
        const tray=visible.map(i=>({shapeId:SHAPES[pieces[i]!.shape]!.id,color:(pieces[i]!.shape%6)+1,used:false}));
        const witness=order.map(i=>({slot:visible.indexOf(i),x:pieces[i]!.x,y:pieces[i]!.y}));
        const proof=replayRoute(board,tray,witness);
        if(proof&&proof.used===3&&proof.board.every(v=>!v)) {
          found={status:'found',reason:'exact-cover-and-replay',checks,targetChecks,tray,witness,target};return true;
        }
      }
      return false;
    }
    if(!remaining||left<remaining||left>remaining*9)return false;
    const y=missing.findIndex(r=>r!==0),bits=missing[y]!;
    const x=31-Math.clz32(bits&-bits);
    for(const op of ordered[y*8+x]!) {
      if(checks>=budget){exhausted=true;return false;}checks++;
      const area=SHAPES[op.shape]!.cells.length;
      if(area>left-(remaining-1)||left-area>(remaining-1)*9)continue;
      if(op.rows.some((mask,row)=>(mask&missing[row]!)!==mask))continue;
      if(search(missing.map((mask,row)=>mask&~op.rows[row]!),[...pieces,op],target))return true;
      if(exhausted)return false;
    }
    return false;
  }
  for(const target of targets) {
    targetChecks++;
    const deficit=target.area-occupied;
    if(deficit<3||deficit>27||initial.some((row,y)=>(row&target.rows[y]!)!==row))continue;
    const missing=target.rows.map((row,y)=>row&~initial[y]!);
    if(search(missing,[],target.rows))return {...found!,checks,targetChecks};
    if(exhausted)break;
  }
  return {status:'unknown',reason:exhausted?'budget':'no-route-in-target-class',checks,targetChecks,tray:null,witness:null,target:null};
}

export type EpisodeState={
  schema:'blocky-two-tray-v1';stage:'payoff'|'done';
  expectedRows:number[];tray:Slot[];witness:Move[];
};
const done=():EpisodeState=>({schema:'blocky-two-tray-v1',stage:'done',expectedRows:[],tray:[],witness:[]});

export function validEpisode(value:unknown):value is EpisodeState {
  const v=value as EpisodeState;
  if(!v||v.schema!=='blocky-two-tray-v1'||!Array.isArray(v.expectedRows)||!Array.isArray(v.tray)||!Array.isArray(v.witness))return false;
  if(v.stage==='done')return !v.expectedRows.length&&!v.tray.length&&!v.witness.length;
  if(v.stage!=='payoff'||v.expectedRows.length!==8||v.tray.length!==3||v.witness.length!==3)return false;
  if(v.expectedRows.some(x=>!Number.isInteger(x)||x<0||x>255))return false;
  try {for(const s of v.tray)if(!s||s.used||!Number.isInteger(s.color)||s.color<1||s.color>6||!shapeById(s.shapeId))return false;}catch{return false;}
  return v.witness.every(m=>m&&Number.isInteger(m.slot)&&m.slot>=0&&m.slot<3&&Number.isInteger(m.x)&&m.x>=0&&m.x<8&&Number.isInteger(m.y)&&m.y>=0&&m.y<8);
}

export function constructEpisode(game:GameState,seed:number,budget=12000) {
  if(!Number.isInteger(budget)||budget<0||budget>12000)throw Error('Invalid construction budget');
  let checks=0,attempts=0;
  for(let candidate=0;candidate<4;candidate++) {
    const opening=variedOpening(game,((seed>>>0)^Math.imul(candidate,0x9e3779b9))>>>0);
    attempts++;
    if(!opening.changed||!opening.witness)continue;
    const setup=replayRoute(game.board,opening.state.tray,opening.witness);
    if(!setup||setup.used!==3||setup.allClears)continue;
    const payoff=finishInThree(setup.board,game.rngState,budget);checks+=payoff.checks;
    if(payoff.status!=='found')continue;
    const episode:EpisodeState={schema:'blocky-two-tray-v1',stage:'payoff',expectedRows:rowsOf(setup.board),tray:payoff.tray!,witness:payoff.witness!};
    return {state:opening.state,episode,changed:true,attempts,checks,setupWitness:opening.witness,payoff};
  }
  return {state:game,episode:done(),changed:false,attempts,checks,setupWitness:null,payoff:null};
}

export function resolvePayoff(board:Board,seed:number,episode:EpisodeState,budget=12000) {
  if(!validEpisode(episode))return {episode:done(),status:'unknown' as const,reason:'invalid-state',checks:0,mode:'fallback',tray:null,witness:null};
  if(episode.stage!=='payoff')
    return {episode:done(),status:'unknown' as const,reason:'spent-stage',checks:0,mode:'fallback',tray:null,witness:null};
  const matches=JSON.stringify(rowsOf(board))===JSON.stringify(episode.expectedRows);
  if(matches) {
    const proof=replayRoute(board,episode.tray,episode.witness);
    if(proof&&proof.used===3&&proof.board.every(v=>!v))
      return {episode:done(),status:'found' as const,reason:'validated-route',checks:0,mode:'planned',tray:episode.tray,witness:episode.witness};
  }
  const repaired=finishInThree(board,seed,budget);
  return {...repaired,episode:done(),mode:repaired.status==='found'?'repaired':'fallback'};
}
