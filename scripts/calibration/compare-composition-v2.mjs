/** Frozen D91 protocol; bots receive only board/tray, no goal or witness. */
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import {createServer} from "vite";
const [output,partition]=process.argv.slice(2);
if(!output||!["dev","holdout"].includes(partition))throw Error("Usage: OUTPUT.json dev|holdout");
const server=await createServer({server:{middlewareMode:true}});
try{
 const R=await server.ssrLoadModule('/src/core/rules.ts');
 const P=await server.ssrLoadModule('/scripts/director/mixed-players.ts');
 const start=partition==='dev'?6101001:6102001, games=[];
 for(const style of ['bounded','three','lapse'])for(let seed=start;seed<start+8;seed++)for(const version of ['composition-v1','composition-v2']){
  let g=R.newGame(seed,`${partition}-${seed}-${style}`,version),player=seed^0x85ebca6b;
  const sample={style,seed,version,moves:0,ended:false,clearMoves:0,allClears:0,lines:0,shapes:0,smallIrregular:0,roles:{},families:{},payoffRun:0,maxPayoffRun:0,lateDeals:0,tempoDeals:0,payoffReduced:0,generationMs:[]};
  const issued=()=>{
   const role=g.goalDirector.last;sample.roles[role]=(sample.roles[role]??0)+1;
   sample.payoffRun=role==='payoff'?sample.payoffRun+1:0;sample.maxPayoffRun=Math.max(sample.maxPayoffRun,sample.payoffRun);
   sample.lateDeals+=Number(g.moves>=72);sample.tempoDeals+=Number(g.dealerDiagnostic?.tempo===true);sample.payoffReduced+=Number(g.dealerDiagnostic?.payoffReduced===true);
   assert((g.rhythm.recentBags??[]).length<=4);
   assert((g.dealerDiagnostic?.checks??0)<=12000);
   for(const slot of g.tray){const s=R.shapeById(slot.shapeId);sample.shapes++;sample.smallIrregular+=Number(s.cells.length<=4&&s.width*s.height!==s.cells.length);sample.families[s.family]=(sample.families[s.family]??0)+1;}
  };issued();
  while(g.status==='playing'&&g.moves<240){
   const r=R.random(player);player=r.state;
   const choice=P.chooseMixed(g.board,g.tray,style,r.value);assert(choice.move);
   const refill=g.tray.filter(s=>!s.used).length===1,at=performance.now();
   const next=R.applyMove(g,choice.move,g.revision);assert(next);
   if(refill)sample.generationMs.push(performance.now()-at);
   sample.clearMoves+=Number(next.lines>0);sample.allClears+=Number(next.allClear);sample.lines+=next.lines;g=next.state;
   if(refill)issued();
  }
  sample.moves=g.moves;sample.ended=g.status==='over';games.push(sample);
  console.log(`${partition} ${style} ${seed} ${version}: ${g.moves} ${g.status}`);
 }
 const sum=(a,k)=>a.reduce((n,g)=>n+g[k],0),tail=a=>a.reduce((n,g)=>n+Math.max(0,g.moves-72),0),rate=(a,k,d)=>sum(a,k)/sum(a,d);
 const comparisons=['bounded','three','lapse'].map(style=>{
  const old=games.filter(g=>g.style===style&&g.version==='composition-v1'),next=games.filter(g=>g.style===style&&g.version==='composition-v2');
  const early=a=>a.filter(g=>g.ended&&g.moves<=36).length;
  const a={style,old:{moves:sum(old,'moves'),early:early(old),tail:tail(old),clearRate:rate(old,'clearMoves','moves'),smallShare:rate(old,'smallIrregular','shapes'),censored:old.filter(g=>!g.ended).length},candidate:{moves:sum(next,'moves'),early:early(next),tail:tail(next),clearRate:rate(next,'clearMoves','moves'),smallShare:rate(next,'smallIrregular','shapes'),censored:next.filter(g=>!g.ended).length}};
  a.gates={early:a.candidate.early<=a.old.early+1,clearRate:a.candidate.clearRate>=.8*a.old.clearRate,smallShare:a.candidate.smallShare>=a.old.smallShare-.02,tail:style==='three'?'not-gated':a.old.tail&&a.candidate.tail?a.candidate.tail<=1.1*a.old.tail:'unknown'};return a;
 });
 await fs.mkdir(new URL('.',`file://${output}`).pathname,{recursive:true});
 await fs.writeFile(output,JSON.stringify({partition,cap:240,revive:false,environment:`${process.version} ${process.platform}/${process.arch}; CPU only`,comparisons,games},null,2)+'\n');
 console.log(JSON.stringify(comparisons,null,2));
}finally{await server.close();}
