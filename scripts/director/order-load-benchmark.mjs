import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {orderLoadRuntime} from './order-load-runtime.mjs';

const args=process.argv.slice(2),arg=(k,f)=>args.includes(k)?args[args.indexOf(k)+1]:f;
const selected=arg('--split','all'),seeds=Number(arg('--seeds','8')),limit=Number(arg('--limit','360'));
const output=arg('--out','docs/qa/director-order-load/results.json.gz');
assert(seeds>0&&seeds<=8&&limit>0&&limit<=360);
const {server,R,G,D,H,P}=await orderLoadRuntime();
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const signature=t=>t.map(s=>R.shapeById(s.shapeId).family).sort().join(',');
const masks=b=>Array.from({length:8},(_,y)=>b.slice(y*8,y*8+8).reduce((n,v,x)=>n|(v?1<<x:0),0));
const quantile=(a,q)=>a.length?[...a].sort((a,b)=>a-b)[Math.floor((a.length-1)*q)]:null;
const runs=[],timing=[],loadCases=[];
let proofs=0,maxWork=0;

function inspect(board,deal){
  maxWork=Math.max(maxWork,deal.diagnostic.checks);assert(deal.diagnostic.checks<=24000);
  if(deal.diagnostic.actual==='load'){
    assert(deal.tray.some(s=>R.shapeById(s.shapeId).cells.length>=6));
    for(const s of deal.tray)assert(R.placements(board,R.shapeById(s.shapeId)).length>0);
  }
  if(deal.diagnostic.actual==='order'){
    const initially=deal.tray.filter(s=>R.placements(board,R.shapeById(s.shapeId)).length>0).length;
    assert(initially>0&&initially<3&&initially*2<=deal.diagnostic.orderBound);
  }
  if(deal.witness){
    let b=board;const used=new Set();
    for(const m of deal.witness){assert(!used.has(m.slot));used.add(m.slot);const s=R.shapeById(deal.tray[m.slot].shapeId);assert(R.fits(b,s,m.x,m.y));b=R.place(b,s,m.x,m.y).board;}
    assert.equal(used.size,3);proofs++;
  }else assert.equal(deal.diagnostic.source,'load-risk-individually-fitting');
}

try{
 for(const [split,offset] of [['development',811000],['confirmation',831000]]){
  if(selected!=='all'&&split!==selected)continue;
  for(let i=1;i<=seeds;i++)for(const style of ['clear','three','plausible'])for(const mode of ['baseline','risky','guarded']){
    const seed=offset+i,engine=mode==='guarded'?G:R,version=mode==='baseline'?'flow-v4':'director-v1';
    const at=performance.now();let game=engine.newGame(seed,'order-load-'+seed,version);
    let playerRng=(seed^0x9e3779b9)>>>0;
    const actions=[],events=[],deals=[],rewardMoves=[];
    let changed=0,lastLoad=-Infinity;
    const first=mode==='baseline'?null:D.orderDirectorDeal(R.emptyBoard(),seed,0,undefined,undefined,{guardLoad:mode==='guarded'});
    if(first){assert.deepEqual(first.tray,game.tray);assert.deepEqual(first.director,game.director);inspect(game.board,first);}
    timing.push({mode,kind:'initial',ms:performance.now()-at});
    let pending=first;
    while(game.status==='playing'&&game.moves<limit){
      if(game.tray.every(s=>!s.used)){
        const diagnostic=pending?.diagnostic??{actual:'flow-v4',requested:'flow-v4',source:'baseline',checks:0,orderBound:null,large:0};
        const record={move:game.moves,board:masks(game.board),tray:game.tray.map(s=>s.shapeId),...diagnostic};deals.push(record);
        if(diagnostic.actual==='load'){
          assert(game.moves>=12);assert(game.moves-lastLoad>=12);lastLoad=game.moves;
          if(mode==='risky')loadCases.push({split,seed,style,move:game.moves,board:record.board,tray:game.tray});
        }
      }
      const playerRoll=R.random(playerRng);playerRng=playerRoll.state;
      const move=P.choose(game.board,game.tray,style,playerRoll.value);assert(move);
      const refilling=game.tray.filter(s=>!s.used).length===1;
      const began=performance.now(),moved=engine.applyMove(game,move,game.revision);assert(moved);
      const duration=performance.now()-began;if(refilling)timing.push({mode,kind:'refill',ms:duration});
      if(refilling&&mode!=='baseline'){
        const rhythm=H.advanceRhythmV4(game.rhythm,moved.state.board,moved.lines,moved.allClear,R.random(game.rngState).value);
        const director=D.observeOrderDirector(game.director,moved.allClear);
        pending=D.orderDirectorDeal(moved.state.board,game.rngState,game.moves+1,rhythm,director,{guardLoad:mode==='guarded'});
        inspect(moved.state.board,pending);
        assert.deepEqual(pending.tray,moved.state.tray);assert.equal(pending.rngState,moved.state.rngState);assert.deepEqual(pending.director,moved.state.director);
      }
      actions.push([move.slot,move.x,move.y]);events.push([moved.lines,Number(moved.allClear),moved.state.board.filter(Boolean).length]);
      if(moved.lines)rewardMoves.push(moved.state.moves);
      game=moved.state;
    }
    let replay=engine.newGame(seed,'order-load-'+seed,version);
    for(const [slot,x,y] of actions){const moved=engine.applyMove(replay,{slot,x,y},replay.revision);assert(moved);replay=moved.state;}
    assert.deepEqual(replay,game);
    const history=deals.map(d=>signature(d.tray.map(shapeId=>({shapeId})))),repeats=history.filter((b,i)=>history.slice(Math.max(0,i-4),i).includes(b)).length;
    const gaps=rewardMoves.slice(1).map((m,i)=>m-rewardMoves[i]);
    const row={split,seed,style,mode,moves:game.moves,score:game.score,lines:events.reduce((n,e)=>n+e[0],0),clears:events.reduce((n,e)=>n+e[1],0),
      ended:game.status==='over',censored:game.status==='playing',fallbacks:game.dealerFallbacks,repeats,
      firstReward:rewardMoves[0]??null,initialDry:rewardMoves[0]??game.moves,terminalDry:rewardMoves.length?game.moves-rewardMoves.at(-1):game.moves,
      gaps,gapP90:quantile(gaps,.9),deals,actions,events,finalHash:hash(game)};
    runs.push(row);
    await fs.mkdir('docs/qa/director-order-load',{recursive:true});await fs.writeFile(output+'.checkpoint',JSON.stringify({runs}));
    console.log(JSON.stringify({split,seed,style,mode,moves:game.moves,ended:row.ended,clears:row.clears,load:deals.filter(x=>x.actual==='load').length,order:deals.filter(x=>x.actual==='order').length}));
  }
 }
 const summary=[],sum=(rs,k)=>rs.reduce((n,r)=>n+Number(r[k]),0);
 for(const split of ['development','confirmation'])for(const style of ['all','clear','three','plausible'])for(const mode of ['risky','guarded']){
  const b=runs.filter(r=>r.split===split&&(style==='all'||r.style===style)&&r.mode==='baseline');
  const n=runs.filter(r=>r.split===split&&(style==='all'||r.style===style)&&r.mode===mode);if(!b.length||!n.length)continue;
  const post=n.flatMap(r=>r.deals.filter(d=>d.move>=12)),baseGaps=b.flatMap(r=>r.gaps),nextGaps=n.flatMap(r=>r.gaps);
  const row={split,style,mode,games:n.length,baseMoves:sum(b,'moves'),candidateMoves:sum(n,'moves'),
    baseEnded:sum(b,'ended'),ended:sum(n,'ended'),baseCensored:sum(b,'censored'),censored:sum(n,'censored'),
    lineRatio:sum(b,'lines')?(sum(n,'lines')/sum(n,'moves'))/(sum(b,'lines')/sum(b,'moves')):null,
    clearRatio:sum(b,'clears')?(sum(n,'clears')/sum(n,'moves'))/(sum(b,'clears')/sum(b,'moves')):null,
    baseGapP90:quantile(baseGaps,.9),gapP90:quantile(nextGaps,.9),
    orderDeals:post.filter(d=>d.actual==='order').length,loadDeals:post.filter(d=>d.actual==='load').length,
    emergencyDeals:post.filter(d=>d.actual==='emergency').length,postIntroDeals:post.length,
    earlyDeaths:n.filter(r=>r.ended&&r.moves<9).length};
  row.gates={lines:row.lineRatio===null||row.lineRatio>=.85,rewardGap:row.gapP90!==null&&row.baseGapP90!==null&&row.gapP90<=row.baseGapP90+3,
    early:row.earlyDeaths===0,emergency:row.postIntroDeals>0&&row.emergencyDeals/row.postIntroDeals<=.05,
    ...(style==='all'?{order:row.postIntroDeals>0&&row.orderDeals/row.postIntroDeals>=.15,load:row.postIntroDeals>0&&row.loadDeals/row.postIntroDeals>=.10}:{}),
    ...(mode==='risky'&&style==='three'?{finite:row.ended>=4}:{}),...(mode==='risky'&&style==='plausible'?{finite:row.ended>=6}:{})};
  summary.push(row);
 }
 const timingSummary=['baseline','risky','guarded'].map(mode=>({mode,coreDealP95:quantile(timing.filter(x=>x.mode===mode).map(x=>x.ms),.95)}));
 const duplicates=[];
 for(let i=0;i<runs.length;i++)for(let j=i+1;j<runs.length;j++)if(runs[i].seed===runs[j].seed&&runs[i].mode===runs[j].mode&&hash(runs[i].actions)===hash(runs[j].actions))duplicates.push([runs[i].seed,runs[i].mode,runs[i].style,runs[j].style]);
 const files=['src/core/order-director.ts','src/core/director-search.ts','src/core/rules.ts','src/core/profile.ts','src/core/monetization.ts','docs/qa/director-order-load/protocol.md'];
 const source=Object.fromEntries(await Promise.all(files.map(async p=>[p,createHash('sha256').update(await fs.readFile(p)).digest('hex')])));
 const final={schema:'blocky-order-load-study-v2',playerRng:'xorshift32 sequential; initial seed XOR 0x9e3779b9; independent of dealer',seeds,limit,runs,summary,loadCases,timing:timingSummary,duplicates,proofs,maxWork,source,
   gate:seeds===8&&limit===360&&runs.length===144&&summary.filter(x=>x.mode==='risky').every(x=>Object.values(x.gates).every(Boolean))&&timingSummary.find(x=>x.mode==='risky').coreDealP95<=60,
   environment:{node:process.version,vite:JSON.parse(await fs.readFile('node_modules/vite/package.json')).version}};
 await fs.writeFile(output,gzipSync(JSON.stringify(final)+'\n'));
 console.log(JSON.stringify({output,games:runs.length,moves:sum(runs,'moves'),gate:final.gate,summary,timing:timingSummary,proofs,maxWork}));
}finally{await server.close();}
