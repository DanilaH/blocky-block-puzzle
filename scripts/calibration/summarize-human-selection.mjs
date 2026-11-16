/** Descriptive owner aggregates only. No A/B verdict, raw states or phone timing. */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
const [output,...inputs]=process.argv.slice(2);
if(!output||!inputs.length)throw Error('Usage: summarize-human-selection.mjs OUTPUT.json INPUT.json ...');
const server=await createServer({server:{middlewareMode:true,hmr:false,watch:null}});
try{
 const V=await server.ssrLoadModule('/scripts/calibration/replay.ts');
 const groups=new Map(),actions=new Map(),versions=new Set();let exactMoves=0;
 for(const input of inputs){
  const replay=V.replayRecord(JSON.parse(await fs.readFile(input,'utf8')));versions.add(replay.record.appVersion);exactMoves+=replay.moves.length;
  for(const e of replay.record.events)if(e.kind==='checkpoint'&&!groups.has(e.state.gameId))groups.set(e.state.gameId,{dealer:e.state.dealerVersion,moves:[]});
  for(const m of replay.moves){
   const key=`${m.before.gameId}:${m.before.revision}`,hash=`${m.event.before}/${m.event.after}`;
   if(actions.has(key)){assert.equal(actions.get(key),hash,'Conflicting duplicate action');continue;}
   actions.set(key,hash);const g=groups.get(m.before.gameId);assert.equal(g.dealer,m.before.dealerVersion);g.moves.push(m);
  }
 }
 const metric=list=>({moves:list.length,clearMoves:list.filter(m=>m.lines>0).length,allClears:list.filter(m=>m.allClear).length,totalLines:list.reduce((s,m)=>s+m.lines,0),occupiedSum:list.reduce((s,m)=>s+m.after.board.filter(Boolean).length,0),maxOccupied:Math.max(0,...list.map(m=>m.after.board.filter(Boolean).length))});
 const withMean=x=>({...x,meanOccupied:x.moves?x.occupiedSum/x.moves:null});
 const games=[...groups.values()].filter(g=>g.moves.length).map((g,i)=>{
  const firstLoss=g.moves.find(m=>m.after.status==='over'),beforeLoss=g.moves.filter(m=>!m.before.reviveUsed);
  assert.equal(g.moves[0].before.moves,0,'Comparison must include each game from its start');
  return {game:i+1,dealer:g.dealer,firstLossAt:firstLoss?.after.moves??null,ended:g.moves.at(-1).after.status==='over',hinted:g.moves.filter(m=>m.event.hinted).length,all:withMean(metric(g.moves)),beforeFirstLoss:withMean(metric(beforeLoss)),afterRevive:withMean(metric(g.moves.filter(m=>m.before.reviveUsed)))};
 });
 const byDealer={};
 for(const dealer of new Set(games.map(g=>g.dealer))){
  const rows=games.filter(g=>g.dealer===dealer),sum=phase=>{const a=rows.map(g=>g[phase]);return withMean({moves:a.reduce((s,x)=>s+x.moves,0),clearMoves:a.reduce((s,x)=>s+x.clearMoves,0),allClears:a.reduce((s,x)=>s+x.allClears,0),totalLines:a.reduce((s,x)=>s+x.totalLines,0),occupiedSum:a.reduce((s,x)=>s+x.occupiedSum,0),maxOccupied:Math.max(...a.map(x=>x.maxOccupied))});};
  byDealer[dealer]={games:rows.length,ended:rows.filter(g=>g.ended).length,all:sum('all'),beforeFirstLoss:sum('beforeFirstLoss'),afterRevive:sum('afterRevive')};
 }
 const summary={provenance:'Owner playtest aggregates; one person, different seeds and unequal exposure; descriptive, not randomized A/B or phone performance',schema:1,humanParticipants:1,recordings:inputs.length,appVersions:[...versions],exactMoves,uniqueMoves:actions.size,playedGames:games.length,unplayedGamesExcluded:[...groups.values()].filter(g=>!g.moves.length).length,byDealer,games};
 await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify(summary,null,2));
}finally{await server.close();}
