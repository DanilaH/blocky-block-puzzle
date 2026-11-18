/** Opt-in trace overhead and bounded recording growth; not phone frame timing. */
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { createServer } from "vite";
const output=process.argv[2];if(!output)throw Error('Usage: trace-cost.mjs OUTPUT');
const server=await createServer({server:{middlewareMode:true,hmr:false,watch:null}});
try {
  const R=await server.ssrLoadModule('/src/core/rules.ts'),T=await server.ssrLoadModule('/src/core/decision-trace.ts'),P=await server.ssrLoadModule('/src/platform/play-capture.ts');
  const cases=JSON.parse(await fs.readFile(process.argv[3]??'artifacts/assist-budget/dev.cases.json','utf8'));
  const selected=cases.filter(c=>c.trace.input.policy==='director-budget-v1').slice(0,8).map(c=>c.trace);
  const samples={off:[],on:[]};let largest=0;
  for(let repeat=0;repeat<8;repeat++)for(const mode of repeat%2?['on','off']:['off','on'])for(const t of selected){
    const i=t.input,c=i.context,at=performance.now();
    const d=R.deal(i.board,i.seed,i.policy,i.moves,i.previous,c.rhythm,c.director,c.goalDirector,c.mixedDirector,c.forgivingDirector,c.rewardDirector,c.assistBudget);
    const trace=mode==='on'?T.finalDecision(t.gameId,t.revision,i,d):null;
    const elapsed=performance.now()-at;
    if(repeat>0)samples[mode].push(elapsed);
    if(trace){assert.deepEqual(trace,t);largest=Math.max(largest,Buffer.byteLength(JSON.stringify(trace)));}
  }
  let trace,g=R.newGame(7601001,'resource-check','director-budget-v1',t=>trace=t),index=0;
  const capture=new P.PlayCapture(()=>0);capture.start(g);
  for(let n=0;n<300;n++){
    const m=trace.validation.witness[index++],r=R.applyMove(g,m,g.revision,true);assert(r);
    capture.record(g,m,r.state,r.decision);g=r.state;
    if(r.decision){trace=r.decision;index=0;}
  }
  const record=capture.snapshot(),V=await server.ssrLoadModule('/scripts/calibration/replay.ts');
  assert.equal(V.replayRecord(record).moves.length,300);
  const result={environment:`${process.version}, serial synchronous Node wall duration; no worker/phone CPU or FPS`,
    samples,largestTraceBytes:largest,record:{moves:capture.count,bytes:Buffer.byteLength(JSON.stringify(record)),limit:P.PLAY_CAPTURE_LIMIT,stopped:record.stopped,events:record.events.length},
    modelStateBytes:Buffer.byteLength(JSON.stringify(g)),credits:g.assistBudget};
  await fs.writeFile(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({...result,samples:Object.fromEntries(Object.entries(samples).map(([k,a])=>[k,{n:a.length,p95:[...a].sort((a,b)=>a-b)[Math.floor(a.length*.95)]}]))}));
}finally{await server.close();}
