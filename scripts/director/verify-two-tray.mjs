import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {frontierRuntime} from './reward-frontier-runtime.mjs';

const input=process.argv[2]??'docs/qa/director-two-tray/results.json.gz';
const bytes=gunzipSync(await fs.readFile(input)),report=JSON.parse(bytes);
assert.equal(report.schema,'blocky-two-tray-benchmark-v1');assert.equal(report.runs.length,160);
const {server,R}=await frontierRuntime();
const T=await server.ssrLoadModule('/scripts/director/two-tray.ts');
const Feedback=await server.ssrLoadModule('/scripts/director/two-tray-feedback.ts');
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const bag=tray=>tray.map(s=>R.shapeById(s.shapeId).family).sort().join(',');
let moves=0,witnesses=0,maxInitialObserved=0,maxPayoffChecks=0,earlyGoalsCancelled=0;

function prove(board,tray,witness,requireEmpty=true) {
  const used=new Set();let current=board;
  for(const m of witness) {
    assert(!used.has(m.slot));used.add(m.slot);
    const shape=R.shapeById(tray[m.slot].shapeId);assert(R.fits(current,shape,m.x,m.y));
    current=R.place(current,shape,m.x,m.y,tray[m.slot].color).board;
  }
  assert.equal(used.size,3);if(requireEmpty)assert(current.every(x=>!x));witnesses++;
  return current;
}

// Count the legacy opening proof work separately; do not hide it in the new
// exact-cover counter. Same traversal order, independently checked witnesses.
function auditOpeningProof(game,seed) {
  const eligible=R.SHAPES.filter(s=>s.cells.length<=6),weight=eligible.reduce((n,s)=>n+s.weight,0);
  let rng=(seed>>>0)^0x6f70656e;if(!rng)rng=1;
  let total=0;
  for(let attempt=0;attempt<32;attempt++) {
    const tray=[];
    for(let slot=0;slot<3;slot++) {
      const roll=R.random(rng);rng=roll.state;let target=roll.value*weight,chosen=eligible.at(-1);
      for(const shape of eligible){target-=shape.weight;if(target<0){chosen=shape;break;}}
      tray.push({shapeId:chosen.id,color:(R.SHAPES.indexOf(chosen)%6)+1,used:false});
    }
    if(new Set(tray.map(s=>R.shapeById(s.shapeId).family)).size<2)continue;
    let nodes=0;
    function search(board,left,path) {
      if(!left.length)return path;
      for(const slot of left)for(const p of R.placements(board,R.shapeById(tray[slot].shapeId))) {
        if(++nodes>5000)return null;
        const next=R.place(board,R.shapeById(tray[slot].shapeId),p.x,p.y).board;
        const route=search(next,left.filter(x=>x!==slot),[...path,{slot,...p}]);if(route)return route;
      }
      return null;
    }
    const witness=search(game.board,[0,1,2],[]);total+=nodes;
    if(witness) {
      assert.deepEqual(witness,R.proveTray(game.board,tray,5000));
      return total;
    }
  }
  return total;
}

try {
  assert.equal(createHash('sha256').update(await fs.readFile('scripts/director/two-tray.ts')).digest('hex'),report.source.twoTraySha256);
  for(const run of report.runs) {
    const original=R.newGame(run.seed,'two-tray-'+run.seed,'flow-v4');
    const plan=run.mode==='candidate'?T.constructEpisode(original,run.seed):{state:original,episode:null,changed:false,attempts:0,checks:0};
    let game=plan.state,episode=JSON.parse(JSON.stringify(plan.episode));
    assert.equal(game.rngState,original.rngState);assert.equal(plan.changed,run.openingChanged);
    let setupChecks=0;
    for(let i=0;i<plan.attempts;i++)setupChecks+=auditOpeningProof(original,((run.seed>>>0)^Math.imul(i,0x9e3779b9))>>>0);
    maxInitialObserved=Math.max(maxInitialObserved,setupChecks+plan.checks);
    if(plan.changed) {
      const prepared=prove(original.board,game.tray,plan.setupWitness,false);
      prove(prepared,episode.tray,episode.witness);
    }
    const counters={lines:0,clears:0,rewardMoves:0,repeats:0,deals:0,totalArea:0};
    const history=[];let firstLine=null,firstClear=null,lastClear=0,maxGap=0,resolution=null,completed=false,achieved=false;
    for(let index=0;index<run.actions.length;index++) {
      assert.equal(game.status,'playing');
      if(game.tray.every(s=>!s.used)) {
        const key=bag(game.tray);counters.repeats+=Number(history.slice(-4).includes(key));history.push(key);counters.deals++;
        counters.totalArea+=game.tray.reduce((n,s)=>n+R.shapeById(s.shapeId).cells.length,0);
      }
      const [slot,x,y]=run.actions[index];assert(R.fits(game.board,R.shapeById(game.tray[slot].shapeId),x,y));
      const moved=R.applyMove(game,{slot,x,y},game.revision);assert(moved);
      const next=moved.state;
      assert.deepEqual(run.events[index],[moved.lines,Number(moved.allClear),next.board.filter(Boolean).length]);
      counters.lines+=moved.lines;counters.clears+=Number(moved.allClear);counters.rewardMoves+=Number(moved.lines>0);moves++;
      if(moved.lines&&firstLine===null)firstLine=next.moves;
      if(moved.allClear) {
        if(firstClear===null)firstClear=next.moves;maxGap=Math.max(maxGap,next.moves-lastClear);lastClear=next.moves;
        if(plan.changed&&game.moves>=3&&game.moves<6)achieved=true;
        if(plan.changed&&episode.stage==='payoff'&&next.moves<=3) {
          const copy=JSON.parse(JSON.stringify(episode)),spent=Feedback.observeEpisode(copy,moved);
          assert.equal(spent.stage,'done');assert.equal(T.resolvePayoff(next.board,next.rngState,spent).reason,'spent-stage');
          earlyGoalsCancelled++;
        }
      }
      let actual=next;
      // Reconstruct the frozen experiment without calling its advance helper.
      if(episode?.stage==='payoff'&&game.tray.filter(s=>!s.used).length===1) {
        const before=hash([next.board,episode]),r=T.resolvePayoff(next.board,next.rngState,episode);
        assert.equal(hash([next.board,episode]),before);maxPayoffChecks=Math.max(maxPayoffChecks,r.checks);
        completed=true;resolution={mode:r.mode,status:r.status,reason:r.reason,checks:r.checks};episode=r.episode;
        if(r.status==='found') {
          prove(next.board,r.tray,r.witness);
          actual={...next,tray:r.tray,rhythm:{...next.rhythm,recentBags:[...(next.rhythm.recentBags??[]).slice(0,-1),bag(r.tray)]},
            status:R.hasMove(next.board,r.tray)?'playing':'over'};
        }
        assert.equal(actual.rngState,next.rngState);
      }
      game=actual;
    }
    for(const key of Object.keys(counters))assert.equal(run[key],counters[key],`${run.seed}/${run.style}/${key}`);
    assert.equal(game.moves,run.moves);assert.equal(hash(game),run.finalHash);assert.equal(hash(episode),run.directorHash);
    assert.equal(run.firstLine,firstLine);assert.equal(run.firstClear,firstClear);
    assert.equal(run.maxClearGapIncludingCensoredTail,Math.max(maxGap,game.moves-lastClear));
    assert.equal(run.payoffCompleted,completed);assert.equal(run.payoffAchieved,achieved);assert.deepEqual(run.resolution,resolution);
    assert.equal(run.ended,game.status==='over');assert.equal(run.reachedLimit,game.status==='playing'&&game.moves===180);
    assert.equal(run.fallbacks,game.dealerFallbacks);assert.equal(run.finalOccupied,game.board.filter(Boolean).length);
  }
  assert(maxInitialObserved<=48000);assert(maxPayoffChecks<=12000);
  const result={valid:true,runs:report.runs.length,moves,witnesses,maxInitialObserved,maxPayoffChecks,earlyGoalsCancelled,
    resultsSha256:createHash('sha256').update(bytes).digest('hex'),
    note:'Frozen first-policy replay; feedback cancellation is checked separately and is not retroactively applied to its results. Initial counter includes independently audited legacy opening proof work for these runs.'};
  await fs.writeFile('docs/qa/director-two-tray/replay-audit.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
} finally {await server.close();}
