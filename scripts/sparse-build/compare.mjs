/** One predeclared paired engineering rollout. No hidden holdouts or tuning. */
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {createServer} from 'vite';
const output=process.argv[2]??'artifacts/sparse-build';
const styles={bounded:2200,clear:1500,three:3200,lapse:2400},policies=['director-challenge-v2','director-build-v1'];
const next=n=>{let x=n>>>0;x^=x<<13;x^=x>>>17;x^=x<<5;return x>>>0;};
function mix(n){n=Math.imul(n^(n>>>16),0x21f0aaad);n=Math.imul(n^(n>>>15),0x735a2d97);return(n^(n>>>15))>>>0||1;}
const plan=Array.from({length:16},(_,i)=>{
 const caseId=8121001+i,opening=i%8,rotation=Math.floor(i/8);let seed=mix(caseId);
 for(let a=0;a<100000;a++){const x=next(seed),y=next(x);if(Math.floor(x/2**32*8)===opening&&Math.floor(y/2**32*4)===rotation)return{caseId,seed,opening,rotation};seed=next(seed)||1;}
 throw Error('Stratification failed');
});
const server=await createServer({server:{middlewareMode:true,hmr:false,watch:null}});
const p90=xs=>[...xs].sort((a,b)=>a-b)[Math.floor((xs.length-1)*.9)];
try{
 const R=await server.ssrLoadModule('/src/core/rules.ts'),P=await server.ssrLoadModule('/scripts/director/mixed-players.ts'),O=await server.ssrLoadModule('/scripts/challenge-content/oracle.ts'),F=await server.ssrLoadModule('/src/core/profile.ts');
 const games=[];await fs.mkdir(output,{recursive:true});
 for(const [styleIndex,[style,ms]] of Object.entries(styles).entries())for(const [j,item] of plan.entries()){
  const order=(j+styleIndex)%2?[...policies].reverse():policies;
  for(const policy of order){
   let trace,active=0,player=(item.seed^0x85ebca6b)>>>0,g=R.newGame(item.seed,`build-${item.caseId}-${style}-${policy}`,policy,t=>trace=t);
   const row={...item,style,policy,moves:0,ended:false,lines:0,ordinary:0,allClears:0,occupiedSum:0,earlyOccupiedSum:0,earlyMoves:0,deals:0,eligible:0,content:0,chain:0,choice:0,unknownProofs:0,emptyDeals:0,low8Deals:0,sparseBuildDeals:0,fallbacks:0,maxWork:0,generationMs:[]};
   function issued(t){
    O.verifyWitness(t.input.board,g.tray,t.validation.witness);assert.equal(t.validation.kind,'SOLVABLE');assert(t.validation.work<=24000);assert(F.validProfile({...F.createProfile(g),best:g.score}));
    row.deals++;row.fallbacks+=Number(t.fallback);row.maxWork=Math.max(row.maxWork,t.validation.work);
    const count=t.input.board.filter(Boolean).length;row.emptyDeals+=Number(!count);row.low8Deals+=Number(count<=8);row.sparseBuildDeals+=Number(t.source.startsWith('sparse-build-'));
    const q=t.challenge;row.unknownProofs+=q.admission?.unknownProofs??0;
    if(t.input.moves>=36){row.eligible++;row.content+=Number(['CHAIN','CHOICE'].includes(q.task));row.chain+=Number(q.task==='CHAIN');row.choice+=Number(q.task==='CHOICE');}
    if(q.task==='CHOICE'){
     const a=O.inspectChoices(t.input.board,g.tray),bad=q.certificate.badFirst,p=a.first.find(p=>JSON.stringify(p.move)===JSON.stringify(bad));
     assert(p&&p.status==='UNSOLVABLE','False/unknown CHOICE');
    }
    if(q.task==='CHAIN'){
     assert(g.tray.some(s=>!R.placements(t.input.board,R.shapeById(s.shapeId)).length),'False CHAIN');
    }
   }
   issued(trace);
   while(g.status==='playing'&&g.moves<300){
    const roll=R.random(player);player=roll.state;const m=P.chooseMixed(g.board,g.tray,style,roll.value).move;assert(m);
    const start=performance.now(),r=R.applyMove(g,m,g.revision,true,{activeMs:active+=ms});assert(r);g=r.state;
    if(r.decision){row.generationMs.push(performance.now()-start);issued(r.decision);}
    row.lines+=r.lines;row.ordinary+=Number(r.lines>0&&!r.allClear);row.allClears+=Number(r.allClear);row.occupiedSum+=g.board.filter(Boolean).length;
    if(g.moves<=60){row.earlyMoves++;row.earlyOccupiedSum+=g.board.filter(Boolean).length;}
   }
   row.moves=g.moves;row.ended=g.status==='over';games.push(row);
  }
  console.log('paired cases',games.length+'/128',style,item.caseId);
 }
 const summaries=[];
 for(const style of Object.keys(styles))for(const policy of policies){
  const xs=games.filter(g=>g.style===style&&g.policy===policy),sum=k=>xs.reduce((n,x)=>n+x[k],0);
  const times=xs.flatMap(x=>x.generationMs).sort((a,b)=>a-b);
  summaries.push({style,policy,runs:xs.length,moves:sum('moves'),meanLength:sum('moves')/xs.length,p90Length:p90(xs.map(x=>x.moves)),atCap:xs.filter(x=>!x.ended).length,earlyLosses:xs.filter(x=>x.ended&&x.moves<=12).length,ordinaryPer100:100*sum('ordinary')/sum('moves'),allClears:sum('allClears'),meanOccupied:sum('occupiedSum')/sum('moves'),meanOccupiedFirst60:sum('earlyOccupiedSum')/sum('earlyMoves'),deals:sum('deals'),emptyDeals:sum('emptyDeals'),low8Deals:sum('low8Deals'),content:sum('content'),eligible:sum('eligible'),contentRate:sum('eligible')?sum('content')/sum('eligible'):0,proofUnknowns:sum('unknownProofs'),fallbacks:sum('fallbacks'),maxWork:Math.max(...xs.map(x=>x.maxWork)),generationP95Ms:times[Math.floor(times.length*.95)]});
 }
 const guards=Object.keys(styles).map(style=>{const b=summaries.find(x=>x.style===style&&x.policy===policies[0]),c=summaries.find(x=>x.style===style&&x.policy===policies[1]);return{style,ordinary:c.ordinaryPer100>=b.ordinaryPer100*.75,lengthUpper:c.meanLength<=b.meanLength*1.1,lengthLower:c.meanLength>=b.meanLength*.65,p90:c.p90Length<=b.p90Length*1.1,earlyLoss:c.earlyLosses/c.runs<=b.earlyLosses/b.runs+.05,content:c.contentRate>=b.contentRate*.7};});
 const report={kind:'engineering development, not human acceptance or A/B',plan,planSha256:crypto.createHash('sha256').update(JSON.stringify(plan)).digest('hex'),runs:games.length,moves:games.reduce((n,g)=>n+g.moves,0),technicalPass:true,summaries,guards};
 await fs.writeFile(output+'/raw.json',JSON.stringify(games,null,2)+'\n');await fs.writeFile(output+'/summary.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await server.close();}
