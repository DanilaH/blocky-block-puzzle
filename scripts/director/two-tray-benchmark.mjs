import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {frontierRuntime} from './reward-frontier-runtime.mjs';

const runtime=await frontierRuntime(),{server,R,P}=runtime;
const T=await server.ssrLoadModule('/scripts/director/two-tray.ts');
const args=process.argv.slice(2),arg=(key,fallback)=>args.includes(key)?args[args.indexOf(key)+1]:fallback;
const output=arg('--out','docs/qa/director-two-tray/results.json.gz');
const splitFilter=arg('--split','all'),seeds=Number(arg('--seeds','8')),limit=Number(arg('--limit','180'));
assert(seeds>0&&seeds<=8&&limit>0&&limit<=180);
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const bag=tray=>tray.map(s=>R.shapeById(s.shapeId).family).sort().join(',');
const p95=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length*.95)]??null;
const timers={start:[],payoff:[]},runs=[];

function initial(seed,mode,measure) {
  const base=R.newGame(seed,'two-tray-'+seed,'flow-v4');
  if(mode==='baseline')return {state:base,episode:null,changed:false,attempts:0,checks:0};
  const before=hash(base),at=performance.now();
  const plan=T.constructEpisode(base,seed);
  if(measure)timers.start.push(performance.now()-at);
  assert.equal(hash(base),before);assert.equal(plan.state.rngState,base.rngState);assert(plan.checks<=48000);
  if(plan.changed) {
    const setup=T.replayRoute(base.board,plan.state.tray,plan.setupWitness);
    assert(setup&&setup.used===3&&!setup.allClears);
    const payoff=T.replayRoute(setup.board,plan.episode.tray,plan.episode.witness);
    assert(payoff&&payoff.used===3&&payoff.board.every(x=>!x));
  }
  return plan;
}

function advance(game,episode,move,measure) {
  const result=R.applyMove(game,move,game.revision);assert(result);
  let next=result.state,resolution=null;
  if(episode?.stage==='payoff'&&game.tray.filter(s=>!s.used).length===1) {
    const before=hash([next.board,episode]),at=performance.now();
    resolution=T.resolvePayoff(next.board,next.rngState,episode);
    if(measure)timers.payoff.push(performance.now()-at);
    assert.equal(hash([next.board,episode]),before);assert(resolution.checks<=12000);
    episode=resolution.episode;
    if(resolution.status==='found') {
      const proof=T.replayRoute(next.board,resolution.tray,resolution.witness);
      assert(proof&&proof.used===3&&proof.board.every(x=>!x));
      next={...next,tray:resolution.tray,
        rhythm:{...next.rhythm,recentBags:[...(next.rhythm.recentBags??[]).slice(0,-1),bag(resolution.tray)]},
        status:R.hasMove(next.board,resolution.tray)?'playing':'over'};
    }
    assert.equal(next.rngState,result.state.rngState);
  }
  return {state:next,episode,result,resolution};
}

try {
  for(const [split,offset] of [['development',611000],['confirmation',631000]]) {
    if(splitFilter!=='all'&&splitFilter!==split)continue;
    for(let i=1;i<=seeds;i++)for(const style of ['clear','space','two','three','plausible'])for(const mode of ['baseline','candidate']) {
      const seed=offset+i,start=initial(seed,mode,true),openingBag=bag(start.state.tray);
      let game=start.state,episode=JSON.parse(JSON.stringify(start.episode)),resolution=null;
      const actions=[],events=[],history=[];
      let lines=0,clears=0,rewardMoves=0,repeats=0,deals=0,totalArea=0,firstLine=null,firstClear=null,lastClear=0,maxGap=0,payoffCompleted=false,payoffAchieved=false;
      while(game.status==='playing'&&game.moves<limit) {
        if(game.tray.every(s=>!s.used)) {
          const family=bag(game.tray);repeats+=Number(history.slice(-4).includes(family));history.push(family);deals++;
          totalArea+=game.tray.reduce((n,s)=>n+R.shapeById(s.shapeId).cells.length,0);
        }
        const move=P.choose(game.board,game.tray,style,R.random(seed+game.moves).value);assert(move);
        const step=advance(game,episode,move,true);
        actions.push([move.slot,move.x,move.y]);events.push([step.result.lines,Number(step.result.allClear),step.state.board.filter(Boolean).length]);
        lines+=step.result.lines;clears+=Number(step.result.allClear);rewardMoves+=Number(step.result.lines>0);
        if(step.result.lines&&firstLine===null)firstLine=step.state.moves;
        if(step.result.allClear) {
          if(firstClear===null)firstClear=step.state.moves;
          maxGap=Math.max(maxGap,step.state.moves-lastClear);lastClear=step.state.moves;
          if(start.changed&&game.moves>=3&&game.moves<6)payoffAchieved=true;
        }
        if(step.resolution){payoffCompleted=true;resolution={mode:step.resolution.mode,status:step.resolution.status,reason:step.resolution.reason,checks:step.resolution.checks};}
        game=step.state;episode=step.episode;
      }
      const again=initial(seed,mode,false);let replay=again.state,replayEpisode=JSON.parse(JSON.stringify(again.episode));
      for(let j=0;j<actions.length;j++) {
        const [slot,x,y]=actions[j],step=advance(replay,replayEpisode,{slot,x,y},false);
        assert.deepEqual(events[j],[step.result.lines,Number(step.result.allClear),step.state.board.filter(Boolean).length]);
        replay=step.state;replayEpisode=step.episode;
      }
      assert.deepEqual(replay,game);assert.deepEqual(replayEpisode,episode);
      const row={split,seed,style,mode,moves:game.moves,lines,clears,rewardMoves,repeats,deals,totalArea,firstLine,firstClear,
        openingBag,openingChanged:start.changed,openingAttempts:start.attempts,constructionChecks:start.checks,
        homogeneousOpening:new Set(game===start.state?start.state.tray.map(s=>R.shapeById(s.shapeId).family):openingBag.split(',')).size===1,
        payoffCompleted,payoffAchieved,resolution,maxClearGapIncludingCensoredTail:Math.max(maxGap,game.moves-lastClear),
        ended:game.status==='over',reachedLimit:game.status==='playing'&&game.moves===limit,fallbacks:game.dealerFallbacks,
        finalOccupied:game.board.filter(Boolean).length,actions,events,finalHash:hash(game),directorHash:hash(episode)};
      runs.push(row);
      // A checkpoint keeps finished games reviewable even if a later runner fails.
      await fs.mkdir(path.dirname(output),{recursive:true});
      await fs.writeFile(output+'.checkpoint',JSON.stringify({schema:'blocky-two-tray-checkpoint-v1',runs}));
      console.log(JSON.stringify({split,seed,style,mode,moves:row.moves,clears,firstClear,openingChanged:start.changed,payoffAchieved,resolution:resolution?.mode}));
    }
  }
  const sum=(rows,key)=>rows.reduce((n,r)=>n+Number(r[key]),0),summary=[];
  for(const split of ['development','confirmation'])for(const style of ['all','clear','space','two','three','plausible']) {
    const selected=runs.filter(r=>r.split===split&&(style==='all'||r.style===style));if(!selected.length)continue;
    const base=selected.filter(r=>r.mode==='baseline'),next=selected.filter(r=>r.mode==='candidate');
    const ratio=(key,denom)=>sum(base,key)?(sum(next,key)/sum(next,denom))/(sum(base,key)/sum(base,denom)):null;
    const baseEarlyLines=base.filter(r=>r.firstLine!==null&&r.firstLine<=12).length,nextEarlyLines=next.filter(r=>r.firstLine!==null&&r.firstLine<=12).length;
    const baseEarlyClears=base.filter(r=>r.firstClear!==null&&r.firstClear<=30).length,nextEarlyClears=next.filter(r=>r.firstClear!==null&&r.firstClear<=30).length;
    const row={split,style,baseGames:base.length,candidateGames:next.length,baseMoves:sum(base,'moves'),candidateMoves:sum(next,'moves'),
      lineRatio:ratio('lines','moves'),clearRatio:ratio('clears','moves'),repeatRatio:ratio('repeats','deals'),baseClears:sum(base,'clears'),candidateClears:sum(next,'clears'),
      survivedDifference:sum(next,'reachedLimit')-sum(base,'reachedLimit'),fallbackDifference:sum(next,'fallbacks')-sum(base,'fallbacks'),
      baseEarlyLines,candidateEarlyLines:nextEarlyLines,baseEarlyClears,candidateEarlyClears:nextEarlyClears,
      completed:sum(next,'payoffCompleted'),achieved:sum(next,'payoffAchieved')};
    row.gates={lines:row.lineRatio===null?sum(next,'lines')>=sum(base,'lines'):row.lineRatio>=.95,
      clears:row.clearRatio===null?row.candidateClears>=row.baseClears:row.clearRatio>=.9,
      survival:row.survivedDifference>=-1,fallback:row.fallbackDifference<=1,
      firstLine:nextEarlyLines>=baseEarlyLines-1,firstClear:nextEarlyClears>=baseEarlyClears-1,
      actualPayoff:row.completed>0&&row.achieved/row.completed>=.75};
    summary.push(row);
  }
  const coverage=['development','confirmation'].map(split=>{
    const candidates=runs.filter(r=>r.split===split&&r.mode==='candidate');
    return {split,changedSeeds:new Set(candidates.filter(r=>r.openingChanged).map(r=>r.seed)).size};
  });
  const uniqueOpenings=new Set(runs.filter(r=>r.mode==='candidate'&&r.openingChanged).map(r=>r.openingBag)).size;
  const duplicates=[];
  for(let i=0;i<runs.length;i++)for(let j=i+1;j<runs.length;j++)if(runs[i].seed===runs[j].seed&&runs[i].mode===runs[j].mode&&hash(runs[i].actions)===hash(runs[j].actions))
    duplicates.push({split:runs[i].split,seed:runs[i].seed,mode:runs[i].mode,styles:[runs[i].style,runs[j].style]});
  const timing={startP95:p95(timers.start),payoffP95:p95(timers.payoff),startSamples:timers.start.length,payoffSamples:timers.payoff.length};
  const final={schema:'blocky-two-tray-benchmark-v1',seeds,limit,runs,summary,coverage,uniqueOpenings,duplicates,timing,
    gate:seeds===8&&limit===180&&runs.length===160&&coverage.every(c=>c.changedSeeds>=6)&&uniqueOpenings>=8&&
      summary.filter(r=>r.style!=='all').every(r=>Object.values(r.gates).every(Boolean))&&timing.startP95<=100&&timing.payoffP95<=60,
    source:{gameCommit:'d791ce0904f563012e31df4c5f3bd766ed571ac8',previousStudy:'b8d20cf2ed56fd1f0726792ee5adad779684878e',
      node:process.version,vite:JSON.parse(await fs.readFile('node_modules/vite/package.json')).version,
      twoTraySha256:createHash('sha256').update(await fs.readFile('scripts/director/two-tray.ts')).digest('hex'),
      protocolSha256:createHash('sha256').update(await fs.readFile('docs/qa/director-two-tray/protocol.md')).digest('hex')}};
  const bytes=JSON.stringify(final)+'\n';await fs.writeFile(output,output.endsWith('.gz')?gzipSync(bytes):bytes);
  console.log(JSON.stringify({output,runs:runs.length,moves:sum(runs,'moves'),gate:final.gate,summary,coverage,uniqueOpenings,timing}));
} finally {await server.close();}
