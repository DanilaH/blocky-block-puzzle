/** Seen engineering contexts only; no development or holdout acceptance. */
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {createServer} from 'vite';
const out=process.argv[2]??'artifacts/challenge-opportunity';
const input='artifacts/challenge-balance/probe.json';
const bytes=await fs.readFile(input),fixtures=JSON.parse(bytes);
const server=await createServer({server:{middlewareMode:true,hmr:false,watch:null}});
try {
 const R=await server.ssrLoadModule('/src/core/rules.ts'),G=await server.ssrLoadModule('/src/core/goal-director.ts');
 const V=await server.ssrLoadModule('/src/core/verified-goal.ts'),O=await server.ssrLoadModule('/scripts/challenge-content/oracle.ts');
 const rows=[];
 for(const fixture of fixtures){
  const i=fixture.input,c=i.context;
  const baseline=G.goalDirectorDeal(i.board,i.seed,i.moves,c.rhythm,c.goalDirector);
  const original=O.inspectChoices(i.board,baseline.tray);
  for(const focus of ['chain','choice']){
   const pair=[];
   for(const mode of ['shape','interleaved']){
    const ref=V.verifiedRefinement(focus),completed=ref.completed,select=ref.select;
    if(mode==='interleaved')ref.explorationOrder='interleaved';
    let phase='baseline',snapshot;
    const pools={baseline:new Map(),extra:new Map()};
    ref.completed=(node,available)=>{
     const key=node.path.map(x=>x.shape).sort((a,b)=>a-b).join();
     const pool=pools[phase];if(!pool.has(key)||pool.get(key).value<node.value)pool.set(key,node);
     completed(node,available);
    };
    ref.select=context=>{
     snapshot={available:context.available.size,rank:context.rank,path:context.path,goalFound:context.goalFound,actual:context.actual,beforeWork:context.meter.used};
     phase='extra';return select(context);
    };
    const d=G.goalDirectorDeal(i.board,i.seed,i.moves,c.rhythm,c.goalDirector,24000,false,'observe',ref);
    assert.equal(d.rngState,baseline.rngState);assert.deepEqual(d.director,baseline.director);
    assert(d.diagnostic.checks<=24000);O.verifyWitness(i.board,d.tray,d.witness);
    const changed=JSON.stringify(d.tray)!==JSON.stringify(baseline.tray);
    const assessment=changed?O.inspectChoices(i.board,d.tray):original;
    if(changed){assert(ref.selected);assert(ref.admission.accepted);assert(ref.admission.accepted.lines>=ref.admission.baseline.lines);assert.equal(ref.admission.accepted.clears,ref.admission.baseline.clears);assert(assessment[focus]);}
    else assert.deepEqual(d.witness,baseline.witness);
    const describe=pool=>({hands:pool.size,shapes:new Set([...pool.values()].flatMap(n=>n.path.map(o=>o.shape))).size});
    pair.push({mode,changed,reason:ref.admission.reason,assessment:{chain:assessment.chain,choice:assessment.choice,complete:assessment.complete},novel:assessment[focus]&&!original[focus],work:d.diagnostic.checks,beforeWork:snapshot.beforeWork,available:snapshot.available,goalFound:snapshot.goalFound,actual:snapshot.actual,baselinePool:describe(pools.baseline),extraPool:describe(pools.extra),admission:ref.admission,ids:d.tray.map(s=>s.shapeId)});
   }
   rows.push({seed:fixture.seed,style:fixture.style,at:fixture.at,focus,input:i,original:{chain:original.chain,choice:original.choice,complete:original.complete},pair});
  }
 }
 const summary={provenance:'Synthetic only; seen engineering contexts, not acceptance',sourceInputSha256:crypto.createHash('sha256').update(bytes).digest('hex'),contexts:fixtures.length,rows:rows.length,modes:{}};
 for(const mode of ['shape','interleaved']){
  const entries=rows.map(r=>({...r.pair.find(p=>p.mode===mode),focus:r.focus}));
  const reasons={};for(const e of entries)reasons[e.reason]=(reasons[e.reason]??0)+1;
  summary.modes[mode]={changed:entries.filter(x=>x.changed).length,novelChain:entries.filter(x=>x.focus==='chain'&&x.novel).length,novelChoice:entries.filter(x=>x.focus==='choice'&&x.novel).length,unknown:entries.filter(x=>!x.assessment.complete).length,maxWork:Math.max(...entries.map(x=>x.work)),extraHands:entries.reduce((n,x)=>n+x.extraPool.hands,0),extraShapes:entries.reduce((n,x)=>n+x.extraPool.shapes,0),reasons};
 }
 summary.pairedGains=rows.filter(r=>r.pair[1].novel&&!r.pair[0].novel).map(r=>({seed:r.seed,style:r.style,at:r.at,focus:r.focus}));
 summary.pairedLosses=rows.filter(r=>r.pair[0].novel&&!r.pair[1].novel).map(r=>({seed:r.seed,style:r.style,at:r.at,focus:r.focus}));
 await fs.mkdir(out,{recursive:true});
 await fs.writeFile(`${out}/engineering.json`,JSON.stringify({summary,rows},null,2)+'\n');
 await fs.writeFile(`${out}/engineering-summary.json`,JSON.stringify(summary,null,2)+'\n');
 console.log(JSON.stringify(summary,null,2));
}finally{await server.close();}
