import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {frontierRuntime} from './reward-frontier-runtime.mjs';

const input=process.argv[2]??'docs/qa/director-reward-frontier/opening-results.json.gz';
const stored=await fs.readFile(input),bytes=input.endsWith('.gz')?gunzipSync(stored):stored,report=JSON.parse(bytes);
assert.equal(report.policy,'opening');assert.equal(report.runs.length,160);
const runtime=await frontierRuntime();
const {R,server}=runtime;
const {variedOpening,catalogAreaBags}=await server.ssrLoadModule('/scripts/director/varied-opening.ts');
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const family=tray=>tray.map(s=>R.shapeById(s.shapeId).family).sort().join(',');
let verifiedMoves=0;
try {
  assert.deepEqual(catalogAreaBags(24),['O3,O3,R6']);
  assert.deepEqual(catalogAreaBags(18,6),['R6,R6,R6']);
  for(const run of report.runs) {
    let state=R.newGame(run.seed,'reward-frontier-'+run.seed,'flow-v4');
    if(run.mode==='candidate') {
      const opening=variedOpening(state,run.seed);
      assert.equal(opening.state.rngState,state.rngState);assert(opening.witness);
      state=opening.state;
    }
    const initialBag=family(state.tray),initialArea=state.tray.reduce((n,s)=>n+R.shapeById(s.shapeId).cells.length,0);
    const counters={lines:0,clears:0,rewardMoves:0,repeats:0,deals:0,totalArea:0};
    const history=[];let firstLine=null,firstClear=null,previousClear=0,maxClearGap=0;
    for(const [slot,x,y] of run.actions) {
      assert.equal(state.status,'playing');
      if(state.tray.every(s=>!s.used)) {
        const signature=family(state.tray);
        counters.repeats+=Number(history.slice(-4).includes(signature));history.push(signature);
        counters.deals++;counters.totalArea+=state.tray.reduce((n,s)=>n+R.shapeById(s.shapeId).cells.length,0);
      }
      assert(R.fits(state.board,R.shapeById(state.tray[slot].shapeId),x,y));
      const moved=R.applyMove(state,{slot,x,y},state.revision);assert(moved);
      state=moved.state;verifiedMoves++;
      counters.lines+=moved.lines;counters.rewardMoves+=Number(moved.lines>0);counters.clears+=Number(moved.allClear);
      if(moved.lines&&firstLine===null)firstLine=state.moves;
      if(moved.allClear) {
        if(firstClear===null)firstClear=state.moves;
        maxClearGap=Math.max(maxClearGap,state.moves-previousClear);previousClear=state.moves;
      }
    }
    for(const key of Object.keys(counters))assert.equal(counters[key],run[key],`${run.seed}/${run.style}/${run.mode}/${key}`);
    assert.equal(run.moves,state.moves);assert.equal(run.moves,run.actions.length);
    assert.equal(run.finalHash,hash(state));assert.equal(run.openingBag,initialBag);assert.equal(run.openingArea,initialArea);
    assert.equal(run.firstLine,firstLine);assert.equal(run.firstClear,firstClear);
    assert.equal(run.maxClearGapIncludingCensoredTail,Math.max(maxClearGap,state.moves-previousClear));
    assert.equal(run.ended,state.status==='over');assert.equal(run.reachedLimit,state.status==='playing'&&state.moves===180);
    assert.equal(run.fallbacks,state.dealerFallbacks);assert.equal(run.finalOccupied,state.board.filter(Boolean).length);
  }
  for(const row of report.summary) {
    const selected=report.runs.filter(r=>r.split===row.split&&(row.style==='all'||r.style===row.style));
    const b=selected.filter(r=>r.mode==='baseline'),c=selected.filter(r=>r.mode==='candidate');
    const total=(rows,key)=>rows.reduce((n,r)=>n+Number(r[key]),0);
    for(const [prefix,rows] of [['base',b],['candidate',c]]) {
      assert.equal(row[prefix+'Games'],rows.length);assert.equal(row[prefix+'Moves'],total(rows,'moves'));
      assert.equal(row[prefix+'Repeats'],total(rows,'repeats'));assert.equal(row[prefix+'Clears'],total(rows,'clears'));
      assert.equal(row[prefix+'EarlyLines'],rows.filter(r=>r.firstLine!==null&&r.firstLine<=12).length);
      assert.equal(row[prefix+'EarlyClears'],rows.filter(r=>r.firstClear!==null&&r.firstClear<=30).length);
    }
    for(const [field,metric,denominator] of [['lineRatio','lines','moves'],['clearRatio','clears','moves'],['repeatRatio','repeats','deals']]) {
      const expected=total(b,metric)?(total(c,metric)/total(c,denominator))/(total(b,metric)/total(b,denominator)):null;
      assert.equal(row[field],expected);
    }
    const gates={
      lines:row.lineRatio===null?total(c,'lines')>=total(b,'lines'):row.lineRatio>=.95,
      clears:row.clearRatio===null?row.candidateClears>=row.baseClears:row.clearRatio>=.9,
      survival:total(c,'reachedLimit')-total(b,'reachedLimit')>=-1,
      fallback:total(c,'fallbacks')-total(b,'fallbacks')<=1,
      firstLine:row.candidateEarlyLines>=row.baseEarlyLines-1,
      firstClear:row.candidateEarlyClears>=row.baseEarlyClears-1,
    };
    assert.deepEqual(row.gates,gates);
  }
  const unique=new Set(report.runs.filter(r=>r.mode==='candidate').map(r=>r.openingBag));
  assert.equal(report.openingGate.uniqueCandidateBags,unique.size);
  assert(report.runs.filter(r=>r.mode==='candidate').every(r=>!r.homogeneousOpening));
  const behaviorGate=report.summary.every(r=>Object.values(r.gates).every(Boolean))&&unique.size>=8;
  assert.equal(report.behaviorGate,behaviorGate);
  const result={valid:true,runs:report.runs.length,verifiedMoves,metricsRecomputed:true,behaviorGate,
    resultsSha256:createHash('sha256').update(bytes).digest('hex'),catalogCertificate:{area24:['O3,O3,R6'],area18Max6:['R6,R6,R6']}};
  const output='docs/qa/director-reward-frontier/verification.json';
  await fs.writeFile(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
} finally {await server.close();}
