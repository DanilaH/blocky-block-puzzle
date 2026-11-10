import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {goalRuntime} from './goal-runtime.mjs';
const {server,R}=await goalRuntime();
try{
 const bytes=await fs.readFile('docs/qa/director-goal-cycle/results.json.gz'),data=JSON.parse(gunzipSync(bytes));
 let moves=0;
 for(const run of data.runs){
  let g=R.newGame(run.seed,'goal-cycle-'+run.seed,run.mode==='baseline'?'flow-v4':'director-v2');
  for(let i=0;i<run.actions.length;i++){
   const [slot,x,y]=run.actions[i],m=R.applyMove(g,{slot,x,y},g.revision);assert(m);
   assert.deepEqual([m.lines,Number(m.allClear),m.state.board.filter(Boolean).length],run.events[i]);g=m.state;moves++;
  }
  assert.equal(createHash('sha256').update(JSON.stringify(g)).digest('hex'),run.finalHash);
 }
 const result={valid:true,games:data.runs.length,moves,sourceResultsSha256:createHash('sha256').update(bytes).digest('hex')};
 await fs.mkdir('docs/qa/director-mixed',{recursive:true});await fs.writeFile('docs/qa/director-mixed/legacy-replay.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await server.close();}
