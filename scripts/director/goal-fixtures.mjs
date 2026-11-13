import fs from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {goalRuntime} from './goal-runtime.mjs';
const {server,D,H,A}=await goalRuntime();
try{
 const cases=JSON.parse(gunzipSync(await fs.readFile('docs/qa/director-order-load/load-risk.json.gz'))).observed,found={};
 for(let i=0;i<cases.length&&Object.keys(found).length<3;i++){
  const c=cases[i],board=A.toBoard(c.board),seed=1500001+i,moves=30,rhythm={...H.initialRhythmV4(),cycleMoves:30},saved={...D.initialGoalDirector(),payoff:1};
  const result=D.goalDirectorDeal(board,seed,moves,rhythm,saved),kind=result.diagnostic.certificate?.kind;
  if(kind&&!found[kind])found[kind]={kind,board,seed,moves,rhythm,saved};
 }
 await fs.mkdir('tests/fixtures',{recursive:true});await fs.writeFile('tests/fixtures/goal-decisions.json',JSON.stringify(Object.values(found),null,2)+'\n');
 console.log(JSON.stringify({kinds:Object.keys(found)}));
}finally{await server.close();}
