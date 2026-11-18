// D82: offline current-tray construction and frozen D81 control.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { runtime, hash, sourceHashes, playerSeed } from './architecture/runtime.mjs';
const out='docs/qa/branch-preparation', rt=await runtime(), tmp=await fs.mkdtemp(path.join(os.tmpdir(),'blocky-branches-'));
const files=['scripts/director/branch-preparation.cpp','scripts/director/branch-preparation.mjs',
  'scripts/director/geometry-recovery.cpp','docs/qa/branch-preparation/protocol.md'];
const source={...await sourceHashes(),...Object.fromEntries(await Promise.all(files.map(async p=>[p,hash(await fs.readFile(p))])))};
try{
  const prep=path.join(tmp,'prepare'),reach=path.join(tmp,'reach'),exec=promisify(execFile);
  await exec('g++',['-std=c++17','-O3','-Wall','-Wextra','scripts/director/branch-preparation.cpp','-o',prep]);
  await exec('g++',['-std=c++17','-O3','-Wall','-Wextra','scripts/director/geometry-recovery.cpp','-o',reach]);
  const ops=rt.shapes.flatMap((s,shape)=>Array.from({length:9-s.height},(_,y)=>Array.from({length:9-s.width},(_,x)=>({shape,x,y,
    mask:s.cells.reduce((n,[dx,dy])=>n|1n<<BigInt((y+dy)*8+x+dx),0n).toString()}))).flat());
  const header=[ops.length,...ops.map(o=>`${o.shape} ${o.x} ${o.y} ${o.mask}`)].join('\n');
  const mask=rows=>rows.reduce((n,r,y)=>n|BigInt(r)<<BigInt(8*y),0n).toString();
  const prepareQueries=[],reachQueries=[],cache=new Map(),timings=[];
  async function query(boards,kind,horizon=0){
    const keys=boards.map(b=>mask(rt.A.toRows(b))),missing=[...new Set(keys)].filter(b=>!cache.has(`${kind}:${horizon}:${b}`));
    for(let start=0;start<missing.length;start+=12){
      const batch=missing.slice(start,start+12),before=performance.now();
      const cases=await new Promise((resolve,reject)=>{
        const child=spawn(kind==='prepare'?prep:reach,kind==='prepare'?[]:['96',String(horizon)]),chunks=[],errors=[];
        child.stdout.on('data',c=>chunks.push(c));child.stderr.on('data',c=>errors.push(c));child.on('error',reject);
        child.on('close',code=>code===0?resolve(JSON.parse(Buffer.concat(chunks)).cases):reject(Error(`native ${code}: ${Buffer.concat(errors)}`)));
        child.stdin.end(`${header}\n${batch.length}\n${batch.join('\n')}\n`);
      });
      assert.equal(cases.length,batch.length);
      const target=kind==='prepare'?prepareQueries:reachQueries;
      for(const [i,c]of cases.entries()){assert.equal(c.board,batch[i]);const row={horizon,...c};target.push(row);cache.set(`${kind}:${horizon}:${c.board}`,row);}
      timings.push({kind,horizon,cases:batch.length,ms:performance.now()-before});
      console.log(JSON.stringify({stage:kind,horizon,done:start+batch.length,total:missing.length}));
    }
    return keys.map(k=>cache.get(`${kind}:${horizon}:${k}`));
  }
  const oldBytes=await fs.readFile('docs/qa/reward-reachability/results.json'),old=JSON.parse(oldBytes);
  const inputs=old.cases.map(c=>({cohort:'engineering',seed:c.seed,move:c.move,rows:c.rows})),sourceGames=[],missing=[];
  for(let seed=3171001;seed<=3171008;seed++){
    let game={...rt.R.newGame(seed,`branch-preparation-source-${seed}`,'director-v2'),scoringVersion:'festival-v4',seriesBonusVersion:1};
    const initial=structuredClone(game),steps=[];let rng=playerSeed(seed);
    while(game.status==='playing'&&game.moves<24){
      const roll=rt.R.random(rng);rng=roll.state;
      const move=rt.choose(game.board,game.tray,'bounded',roll.value);assert(move);
      const a=rt.R.applyMove(game,move,game.revision);assert(a);game=a.state;
      steps.push({roll:roll.value,move,rows:rt.A.toRows(game.board),lines:a.lines,clear:a.allClear});
      if([12,24].includes(game.moves))inputs.push({cohort:'new-v2',seed,move:game.moves,rows:rt.A.toRows(game.board),sourceGame:sourceGames.length});
    }
    for(const move of[12,24])if(!inputs.some(p=>p.cohort==='new-v2'&&p.seed===seed&&p.move===move))missing.push({seed,move,reason:'game-ended-before-snapshot'});
    sourceGames.push({seed,initial,steps,finalHash:hash(game)});
  }
  const episodes=[];
  for(const [i,input]of inputs.entries()){
    if(input.rows.every(r=>!r))continue;
    const n=input.cohort==='engineering'?5:10;
    for(let trial=0;trial<n;trial++){
      const rolls=[];let rng=playerSeed(input.seed+input.move*100000+trial*1009);
      for(let j=0;j<9;j++){const r=rt.R.random(rng);rng=r.state;rolls.push(input.cohort==='engineering'?[0,.25,.5,.75,.999999][trial]:r.value);}
      for(const mode of['prepare','d81'])episodes.push({input:i,trial,rolls,mode,board:rt.A.toBoard(input.rows),events:[],deals:[],status:'playing'});
    }
  }
  function trayFromPath(board,ids){
    const first=ids.slice(0,3).map(i=>({shapeId:rt.shapes[ops[i].shape].id,x:ops[i].x,y:ops[i].y}));
    let b=board;
    for(const p of first)b=rt.R.place(b,rt.R.shapeById(p.shapeId),p.x,p.y).board;
    while(first.length<3){const n=b.findIndex(x=>!x);assert(n>=0);const p={shapeId:'S1-0',x:n%8,y:Math.floor(n/8)};first.push(p);b=rt.R.place(b,rt.R.shapeById(p.shapeId),p.x,p.y).board;}
    return[2,0,1].map(i=>({shapeId:first[i].shapeId,color:i+1,used:false}));
  }
  for(let wave=0;wave<3;wave++){
    const active=episodes.filter(e=>e.status==='playing');
    const p=active.filter(e=>e.mode==='prepare'),d=active.filter(e=>e.mode==='d81');
    const pqs=await query(p.map(e=>e.board),'prepare'),dqs=await query(d.map(e=>e.board),'reach',9-wave*3);
    const selected=new Map([...p.map((e,i)=>[e,pqs[i]]),...d.map((e,i)=>[e,dqs[i]])]);
    for(const e of active){
      const q=selected.get(e);let tray;
      if(e.mode==='prepare'){
        const bag=q.pool[0].bag;
        tray=[bag[2],bag[0],bag[1]].map((id,slot)=>({shapeId:rt.shapes[id].id,color:slot+1,used:false}));
      }else{
        if(q.status!=='found'){e.status=q.status==='impossible'?'short-impossible':'construction-unknown';continue;}
        tray=trayFromPath(e.board,q.ops);
      }
      e.deals.push({at:e.events.length,rows:rt.A.toRows(e.board),tray:structuredClone(tray),
        query:(e.mode==='prepare'?prepareQueries:reachQueries).indexOf(q)});
      for(let j=0;j<3;j++){
        const options=rt.MP.boundedOptions(e.board,tray);
        if(!options.length){e.status='dead';break;}
        const roll=e.rolls[e.events.length],choice=Math.min(options.length-1,Math.floor(roll*options.length)),move=options[choice].move;
        const shapeId=tray[move.slot].shapeId,shape=rt.R.shapeById(shapeId);assert(rt.R.fits(e.board,shape,move.x,move.y));
        const n=rt.R.place(e.board,shape,move.x,move.y);e.board=n.board;tray[move.slot].used=true;
        const clear=e.board.every(x=>!x);
        e.events.push({...move,shapeId,options,choice,rows:rt.A.toRows(e.board),lines:n.lines,clear});
        if(clear){e.status='reward';break;}
      }
    }
    console.log(JSON.stringify({stage:'wave',wave:wave+1,playing:episodes.filter(e=>e.status==='playing').length,rewards:episodes.filter(e=>e.status==='reward').length}));
    await fs.writeFile(`${out}/checkpoint.json`,JSON.stringify({source,inputs,sourceGames,missing,prepareQueries,reachQueries,episodes,timings}));
  }
  for(const e of episodes){if(e.status==='playing')e.status='horizon';e.finalRows=rt.A.toRows(e.board);delete e.board;}
  // Independent opportunity audit on every distinct new first-tray terminal.
  const opportunities=[];
  for(const [i,input]of inputs.entries())if(input.cohort==='new-v2'&&input.rows.some(Boolean)){
    const q=cache.get(`prepare:0:${mask(input.rows)}`);assert(q);
    for(const leaf of q.leaves)opportunities.push({input:i,board:leaf.board,alreadyReward:leaf.reward,dead:leaf.dead});
  }
  const need=[...new Set(opportunities.filter(o=>!o.alreadyReward&&!o.dead).map(o=>o.board))];
  await query(need.map(b=>rt.A.toBoard(Array.from({length:8},(_,y)=>Number(BigInt(b)>>BigInt(8*y)&255n)))),'reach',6);
  for(const o of opportunities)if(!o.alreadyReward&&!o.dead)o.query=reachQueries.indexOf(cache.get(`reach:6:${o.board}`));
  const result={schema:'blocky-branch-preparation-v1',source,oldInputSha256:hash(oldBytes),inputs,missing,sourceGames,
    emptyInputs:inputs.flatMap((p,i)=>p.rows.some(Boolean)?[]:[i]),prepareQueries,reachQueries,episodes,opportunities,timings};
  assert.deepEqual(await sourceHashes(),Object.fromEntries(Object.entries(source).filter(([p])=>!files.includes(p))));
  for(const p of files)assert.equal(hash(await fs.readFile(p)),source[p]);
  await fs.writeFile(`${out}/results.json`,JSON.stringify(result,null,2)+'\n');await fs.rm(`${out}/checkpoint.json`);
  console.log(JSON.stringify({output:`${out}/results.json`,inputs:inputs.length,missing:missing.length,empty:result.emptyInputs.length,
    prepareQueries:prepareQueries.length,reachQueries:reachQueries.length,episodes:episodes.length}));
}finally{await rt.server.close();await fs.rm(tmp,{recursive:true,force:true});}
