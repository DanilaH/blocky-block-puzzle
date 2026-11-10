import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {frontierRuntime} from './reward-frontier-runtime.mjs';

const args=process.argv.slice(2);
const value=(key,fallback)=>{const i=args.indexOf(key);return i<0?fallback:args[i+1];};
const output=value('--out','docs/qa/director-reward-frontier/results.json');
const stage=value('--stage','bots');
const policy=value('--policy','frontier');
assert(['frontier','opening'].includes(policy));
const runtime=await frontierRuntime();
const {server,R,F,N,H,P}=runtime;
const O=await server.ssrLoadModule('/scripts/director/varied-opening.ts');
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const bag=tray=>tray.map(s=>R.shapeById(s.shapeId).family).sort().join(',');
const sum=(rows,key)=>rows.reduce((n,r)=>n+r[key],0);
const percentile=(values,q)=>[...values].sort((a,b)=>a-b)[Math.floor(values.length*q)]??null;
const timings=[],examples=[];
let paired=0,proofs=0,capped=0,maxArchive=0;

function prove(board,tray,witness) {
  let b=board,lines=0,clears=0,steps='';
  const used=new Set();
  for(const move of witness) {
    assert(!used.has(move.slot));used.add(move.slot);
    const shape=R.shapeById(tray[move.slot].shapeId);
    assert(R.fits(b,shape,move.x,move.y));
    const p=R.place(b,shape,move.x,move.y);b=p.board;
    const clear=Number(b.every(v=>!v));lines+=p.lines;clears+=clear;
    steps+=p.lines+':'+clear+';';
  }
  assert.equal(used.size,3);proofs++;
  return {lines,clears,steps,area:tray.reduce((n,s)=>n+R.shapeById(s.shapeId).cells.length,0),occupied:b.filter(Boolean).length};
}

function pair(board,seed,moves,previous,rhythm) {
  const input=[board,seed,moves,previous,rhythm],before=hash(input);
  let base,candidate,baseMs,candidateMs;
  const runBase=()=>{const at=performance.now();base=F.flowDeal(...input);baseMs=performance.now()-at;};
  const runCandidate=()=>{const at=performance.now();candidate=N.flowDeal(...input);candidateMs=performance.now()-at;};
  if(paired%2){runCandidate();runBase();}else{runBase();runCandidate();}
  paired++;
  assert.equal(hash(input),before);
  assert.equal(Boolean(base),Boolean(candidate));
  timings.push({baseMs,candidateMs});
  if(base) {
    assert.equal(base.visited,candidate.visited);
    assert.equal(base.rngState,candidate.rngState);
    assert.deepEqual(base.tray,candidate.originalTray);
    assert.deepEqual(base.witness,candidate.originalWitness);
    maxArchive=Math.max(maxArchive,candidate.archiveSize);
    capped+=Number(candidate.archiveCapped);
    if(candidate.changed) {
      const a=prove(board,base.tray,base.witness),b=prove(board,candidate.tray,candidate.witness);
      for(const k of ['lines','clears','steps','area'])assert.equal(a[k],b[k]);
      assert(b.occupied<=a.occupied);
      const {original,selected}=candidate.proof;
      assert(selected.value>=original.value);
      const count=k=>(rhythm.recentBags??[]).filter(x=>x===k).length;
      assert(count(bag(candidate.tray))<count(bag(base.tray)));
      assert(moves>=12);
    } else assert.deepEqual(candidate.tray,base.tray);
  }
  return {base,candidate};
}

function apply(state,move,mode,checking=true) {
  const result=R.applyMove(state,move,state.revision);assert(result);
  if(policy==='opening')return {result,state:result.state,changed:false};
  if(state.tray.filter(s=>!s.used).length!==1)return {result,state:result.state,changed:false};
  const rhythm=H.advanceRhythmV4(state.rhythm,result.state.board,result.lines,result.allClear,R.random(state.rngState).value);
  const input=[result.state.board,state.rngState,state.moves+1,bag(state.tray),rhythm];
  let candidate;
  if(checking) {
    const pairResult=pair(...input);candidate=pairResult.candidate;
    if(pairResult.base) {
      assert.deepEqual(pairResult.base.tray,result.state.tray);
      assert.equal(pairResult.base.rngState,result.state.rngState);
    }
  } else candidate=N.flowDeal(...input);
  if(mode==='baseline'||!candidate)return {result,state:result.state,changed:false};
  const next={...result.state,tray:candidate.tray,rngState:candidate.rngState,
    rhythm:{...result.state.rhythm,recentBags:[...(result.state.rhythm.recentBags??[]).slice(0,-1),bag(candidate.tray)]},
    status:R.hasMove(result.state.board,candidate.tray)?'playing':'over'};
  return {result,state:next,changed:candidate.changed};
}

function initial(seed,mode) {
  const original=R.newGame(seed,'reward-frontier-'+seed,'flow-v4');
  if(policy!=='opening'||mode==='baseline')return {state:original,attempts:0};
  const opening=O.variedOpening(original,seed);
  assert.equal(opening.state.rngState,original.rngState);
  assert(opening.witness,'Opening generator fell back');
  prove(original.board,opening.state.tray,opening.witness);
  return opening;
}

try {
  let report;
  if(stage==='human') {
    const {replayRecord}=await server.ssrLoadModule('/scripts/calibration/replay.ts');
    const inputs=args.flatMap((x,i)=>x==='--record'?[args[i+1]]:[]);
    assert.equal(inputs.length,2,'Use the two existing captures; no invented continuation');
    const recordings=[];
    for(let inputIndex=0;inputIndex<inputs.length;inputIndex++) {
      const bytes=await fs.readFile(inputs[inputIndex]),replay=replayRecord(JSON.parse(bytes));
      let refills=0,repeated=0,changed=0,baselineFallbacks=0;
      const samples=[];
      for(const row of replay.moves) {
        if(row.before.tray.filter(s=>!s.used).length!==1)continue;
        refills++;
        const rhythm=H.advanceRhythmV4(row.before.rhythm,row.after.board,row.lines,row.allClear,R.random(row.before.rngState).value);
        const {base,candidate}=pair(row.after.board,row.before.rngState,row.after.moves,bag(row.before.tray),rhythm);
        if(!base){baselineFallbacks++;continue;}
        assert.deepEqual(base.tray,row.after.tray);
        repeated+=Number((rhythm.recentBags??[]).includes(bag(base.tray)));
        if(candidate.changed) {
          changed++;
          if(samples.length<6)samples.push({move:row.after.moves,originalBag:bag(base.tray),candidateBag:bag(candidate.tray),steps:candidate.proof.selected.steps,area:candidate.proof.selected.area});
        }
      }
      recordings.push({capture:inputIndex+1,sha256:createHash('sha256').update(bytes).digest('hex'),verifiedMoves:replay.moves.length,
        segments:replay.segments.length,refills,repeated,changed,baselineFallbacks,samples});
      console.log(JSON.stringify({stage:'human',capture:inputIndex+1,verifiedMoves:replay.moves.length,refills,changed}));
    }
    report={schema:'blocky-reward-frontier-human-v1',recordings,physical:false,
      limitation:'Paired original positions only. A different tray is never followed by the recorded human move. No duration, skill or retention inference.'};
  } else {
    const runs=[],selectedSplit=value('--split','all'),seeds=Number(value('--seeds','8')),limit=Number(value('--limit','180'));
    assert(seeds>=1&&seeds<=8&&limit>=1&&limit<=180);
    const splits=policy==='opening'?[['development',511000],['confirmation',531000]]:[['development',411000],['confirmation',431000]];
    for(const [split,offset] of splits) {
      if(selectedSplit!=='all'&&selectedSplit!==split)continue;
      for(let i=1;i<=seeds;i++)for(const style of ['clear','space','two','three','plausible'])for(const mode of ['baseline','candidate']) {
        const seed=offset+i;
        const start=initial(seed,mode),openingBag=bag(start.state.tray);
        const homogeneousOpening=new Set(start.state.tray.map(s=>R.shapeById(s.shapeId).family)).size===1;
        const openingArea=start.state.tray.reduce((n,s)=>n+R.shapeById(s.shapeId).cells.length,0);
        let game=start.state,lines=0,clears=0,rewardMoves=0,repeats=0,deals=0,changes=0,maxClearGap=0,lastClear=0,totalArea=0,firstLine=null,firstClear=null;
        const history=[],moves=[];
        while(game.status==='playing'&&game.moves<limit) {
          if(game.tray.every(s=>!s.used)) {
            const key=bag(game.tray);repeats+=Number(history.slice(-4).includes(key));history.push(key);deals++;
            totalArea+=game.tray.reduce((n,s)=>n+R.shapeById(s.shapeId).cells.length,0);
          }
          const move=P.choose(game.board,game.tray,style,R.random(seed+game.moves).value);assert(move);
          const step=apply(game,move,mode,mode==='candidate');
          moves.push([move.slot,move.x,move.y]);lines+=step.result.lines;rewardMoves+=Number(step.result.lines>0);clears+=Number(step.result.allClear);changes+=Number(step.changed);
          if(step.result.lines>0&&firstLine===null)firstLine=step.state.moves;
          if(step.result.allClear&&firstClear===null)firstClear=step.state.moves;
          if(step.result.allClear){maxClearGap=Math.max(maxClearGap,step.state.moves-lastClear);lastClear=step.state.moves;}
          game=step.state;
        }
        let replay=initial(seed,mode).state;
        for(const [slot,x,y] of moves)replay=apply(replay,{slot,x,y},mode,false).state;
        assert.deepEqual(replay,game);
        const run={split,seed,style,mode,moves:game.moves,lines,clears,rewardMoves,repeats,deals,changes,totalArea,
          firstLine,firstClear,openingBag,openingArea,homogeneousOpening,openingAttempts:start.attempts,
          maxClearGapIncludingCensoredTail:Math.max(maxClearGap,game.moves-lastClear),
          ended:game.status==='over',reachedLimit:game.status==='playing'&&game.moves===limit,
          fallbacks:game.dealerFallbacks,finalOccupied:game.board.filter(Boolean).length,actions:moves,finalHash:hash(game)};
        runs.push(run);
        console.log(JSON.stringify({policy,split,seed,style,mode,moves:game.moves,repeats,clears,changes,firstLine,firstClear}));
      }
    }
    const summary=[];
    for(const split of ['development','confirmation'])for(const style of ['all','clear','space','two','three','plausible']) {
      const selected=runs.filter(r=>r.split===split&&(style==='all'||r.style===style));if(!selected.length)continue;
      const base=selected.filter(r=>r.mode==='baseline'),candidate=selected.filter(r=>r.mode==='candidate');
      const rateRatio=(metric,denominator)=>sum(base,metric)?(sum(candidate,metric)/sum(candidate,denominator))/(sum(base,metric)/sum(base,denominator)):null;
      const row={split,style,baseGames:base.length,candidateGames:candidate.length,baseMoves:sum(base,'moves'),candidateMoves:sum(candidate,'moves'),
        baseRepeats:sum(base,'repeats'),candidateRepeats:sum(candidate,'repeats'),repeatRatio:rateRatio('repeats','deals'),
        lineRatio:rateRatio('lines','moves'),clearRatio:rateRatio('clears','moves'),
        baseClears:sum(base,'clears'),candidateClears:sum(candidate,'clears'),
        survivedDifference:sum(candidate,'reachedLimit')-sum(base,'reachedLimit'),fallbackDifference:sum(candidate,'fallbacks')-sum(base,'fallbacks'),changes:sum(candidate,'changes')};
      row.baseEarlyLines=base.filter(r=>r.firstLine!==null&&r.firstLine<=12).length;
      row.candidateEarlyLines=candidate.filter(r=>r.firstLine!==null&&r.firstLine<=12).length;
      row.baseEarlyClears=base.filter(r=>r.firstClear!==null&&r.firstClear<=30).length;
      row.candidateEarlyClears=candidate.filter(r=>r.firstClear!==null&&r.firstClear<=30).length;
      row.gates={...(policy==='frontier'?{repeats:row.repeatRatio===null?row.candidateRepeats===0:row.repeatRatio<=.8}:{}),
        lines:row.lineRatio===null?sum(candidate,'lines')>=sum(base,'lines'):row.lineRatio>=.95,
        clears:row.clearRatio===null?row.candidateClears>=row.baseClears:row.clearRatio>=.9,
        survival:row.survivedDifference>=-1,fallback:row.fallbackDifference<=1,
        ...(policy==='opening'?{firstLine:row.candidateEarlyLines>=row.baseEarlyLines-1,firstClear:row.candidateEarlyClears>=row.baseEarlyClears-1}:{})};
      summary.push(row);
    }
    const duplicates=[];
    for(const split of ['development','confirmation'])for(const mode of ['baseline','candidate']) {
      const selected=runs.filter(r=>r.split===split&&r.mode===mode);
      for(let i=0;i<selected.length;i++)for(let j=i+1;j<selected.length;j++)
        if(selected[i].seed===selected[j].seed&&hash(selected[i].actions)===hash(selected[j].actions))duplicates.push({split,mode,seed:selected[i].seed,styles:[selected[i].style,selected[j].style]});
    }
    const openingGate=policy==='opening'?{
      uniqueCandidateBags:new Set(runs.filter(r=>r.mode==='candidate').map(r=>r.openingBag)).size,
      homogeneousCandidateGames:runs.filter(r=>r.mode==='candidate'&&r.homogeneousOpening).length,
      fallbackCandidateGames:runs.filter(r=>r.mode==='candidate'&&r.openingAttempts===32).length,
    }:null;
    report={schema:'blocky-reward-frontier-benchmark-v1',policy,seeds,limit,runs,summary,duplicates,openingGate,
      behaviorGate:seeds===8&&limit===180&&summary.filter(r=>r.style==='all').length===2&&summary.every(r=>Object.values(r.gates).every(Boolean))&&
        (!openingGate||(openingGate.uniqueCandidateBags>=8&&openingGate.homogeneousCandidateGames===0&&openingGate.fallbackCandidateGames===0))};
  }
  const baseP95=percentile(timings.map(t=>t.baseMs),.95),candidateP95=percentile(timings.map(t=>t.candidateMs),.95);
  report.verification={paired,proofs,maxArchive,capped,archiveCap:512,
    timings:timings.length?{pairs:timings.length,order:'alternated',baseP95,candidateP95,p95Ratio:candidateP95/baseP95,cpuGate:candidateP95<=baseP95*1.25}:null,
    node:process.version,vite:JSON.parse(await fs.readFile('node_modules/vite/package.json','utf8')).version,
    typescript:JSON.parse(await fs.readFile('node_modules/typescript/package.json','utf8')).version,
    sourceCommit:'d791ce0904f563012e31df4c5f3bd766ed571ac8',productionFlowSha256:createHash('sha256').update(await fs.readFile('src/core/flow-dealer.ts')).digest('hex'),
    selectorSha256:createHash('sha256').update(await fs.readFile('scripts/director/reward-frontier.ts')).digest('hex'),
    openingSha256:createHash('sha256').update(await fs.readFile('scripts/director/varied-opening.ts')).digest('hex'),
    instrumentationSha256:createHash('sha256').update(await fs.readFile('scripts/director/reward-frontier-source.mjs')).digest('hex')};
  const serialized=JSON.stringify(report)+'\n';
  await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,output.endsWith('.gz')?gzipSync(serialized):serialized);
  console.log(JSON.stringify({output,verification:report.verification,summary:report.summary,recordings:report.recordings}));
} finally {await server.close();}
