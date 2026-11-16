/** Frozen policy comparison. Players see board/tray only. */
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createServer } from "vite";
const [partition,output]=process.argv.slice(2);
if(!["dev","holdout"].includes(partition)||!output)throw Error("Usage: compare.mjs dev|holdout OUTPUT");
const first=partition==="dev"?7601001:7602001;
const server=await createServer({server:{middlewareMode:true,hmr:false,watch:null}});
const quantile=(a,q)=>a.length?[...a].sort((a,b)=>a-b)[Math.floor((a.length-1)*q)]:null;
try {
  const R=await server.ssrLoadModule('/src/core/rules.ts');
  const G=await server.ssrLoadModule('/src/core/goal-director.ts');
  const B=await server.ssrLoadModule('/src/core/assist-budget.ts');
  const P=await server.ssrLoadModule('/scripts/director/mixed-players.ts');
  const C=await server.ssrLoadModule('/src/platform/play-capture.ts');
  const games=[],cases=[];
  function witness(t) {
    const cells=new Map(t.input.board.flatMap((v,i)=>v?[[i,v]]:[]));
    let lines=0,allClears=0;const used=new Set();
    for(const m of t.validation.witness) {
      assert(!used.has(m.slot));used.add(m.slot);
      for(const [dx,dy] of R.shapeById(t.finalPieceIds[m.slot]).cells){const x=m.x+dx,y=m.y+dy;assert(x>=0&&x<8&&y>=0&&y<8);const i=y*8+x;assert(!cells.has(i));cells.set(i,1);}
      const rows=[],cols=[];
      for(let n=0;n<8;n++){if(Array.from({length:8},(_,x)=>cells.has(n*8+x)).every(Boolean))rows.push(n);if(Array.from({length:8},(_,y)=>cells.has(y*8+n)).every(Boolean))cols.push(n);}
      for(const i of [...cells.keys()])if(rows.includes(i>>3)||cols.includes(i%8))cells.delete(i);
      lines+=rows.length+cols.length;allClears+=Number(cells.size===0);
    }
    assert.equal(used.size,3);return {lines,allClears};
  }
  for(const style of ["bounded","clear","three","lapse"])for(let seed=first;seed<first+8;seed++) {
    const order=seed%2?["director-v2","director-budget-v1"]:["director-budget-v1","director-v2"];
    for(const policy of order) {
      let initial, g=R.newGame(seed,`${partition}-${seed}-${style}-${policy}`,policy,t=>initial=t),player=(seed^0x85ebca6b)>>>0;
      const row={style,seed,policy,moves:0,ended:false,lines:0,clearMoves:0,ordinaryClearMoves:0,allClears:0,
        lateMoves:0,lateAllClears:0,lateOrdinary:0,deals:0,lateDeals:0,helpApplied:0,helpRequested:0,helpAttempted:0,
        reasons:{},roles:{},sources:{},certificates:{},fallback:0,work:[],generationMs:[],generationCpuMs:[],creditsLeft:null};
      function issued(t) {
        const payoff=witness(t);assert(t.validation.work<=24000);row.deals++;row.work.push(t.validation.work);
        row.roles[t.selectedFamily]=(row.roles[t.selectedFamily]??0)+1;row.sources[t.source]=(row.sources[t.source]??0)+1;
        row.fallback+=Number(t.fallback);if(t.certificate)row.certificates[t.certificate]=(row.certificates[t.certificate]??0)+1;
        const a=t.assistance;let applied=false;
        if(t.input.moves>=36) {
          row.lateDeals++;
          if(a) {
            applied=a.applied;assert(B.validAssistBudget(a.after));assert(a.after.left<=a.before.left);
            if(applied){assert.equal(a.before.left-a.after.left,1);assert(a.alternative.allClears>a.ordinary.allClears||a.alternative.lines>a.ordinary.lines);}
            else assert.deepEqual(a.after,a.before);
            row.helpRequested+=Number(a.requested);row.helpAttempted+=Number(a.attempted);
          } else if(t.selectedFamily!=="load") {
            // Common counterfactual definition, outside the measured move.
            const i=t.input,n=G.goalDirectorDeal(i.board,i.seed,i.moves,i.context.rhythm,i.context.goalDirector,B.ASSIST_BUDGET_CONFIG.searchPerPlan,true);
            const ordinary=witness({...t,finalPieceIds:n.tray.map(s=>s.shapeId),validation:{witness:n.witness}});
            applied=t.finalPieceIds.some((id,j)=>id!==n.tray[j].shapeId)&&(payoff.allClears>ordinary.allClears||payoff.lines>ordinary.lines);
            row.helpRequested++;
          }
          row.helpApplied+=Number(applied);
        }
        const reason=a?.reason??t.source;row.reasons[reason]=(row.reasons[reason]??0)+1;
        const key=`${policy}:${reason}`;
        if(!cases.some(c=>c.key===key))cases.push({key,trace:t});
      }
      issued(initial);
      while(g.status==="playing"&&g.moves<300) {
        const random=R.random(player);player=random.state;
        const move=P.chooseMixed(g.board,g.tray,style,random.value).move;assert(move);
        const refill=g.tray.filter(s=>!s.used).length===1,at=performance.now(),cpu=process.cpuUsage();
        const next=R.applyMove(g,move,g.revision,true);assert(next);
        if(refill){const used=process.cpuUsage(cpu);row.generationMs.push(performance.now()-at);row.generationCpuMs.push((used.user+used.system)/1000);}
        g=next.state;row.lines+=next.lines;row.clearMoves+=Number(next.lines>0);
        row.ordinaryClearMoves+=Number(next.lines>0&&!next.allClear);row.allClears+=Number(next.allClear);
        if(g.moves>72){row.lateMoves++;row.lateAllClears+=Number(next.allClear);row.lateOrdinary+=Number(next.lines>0&&!next.allClear);}
        if(next.decision)issued(next.decision);
      }
      row.moves=g.moves;row.ended=g.status==="over";row.finalHash=C.stateHash(g);row.creditsLeft=g.assistBudget?.left??null;games.push(row);
      console.log(`${partition} ${style} ${seed} ${policy}: ${row.moves} ${row.ended?'ended':'censored'};help=${row.helpApplied}`);
    }
  }
  const sum=(a,k)=>a.reduce((n,g)=>n+g[k],0),rate=(a,k,d)=>sum(a,k)/sum(a,d),tail=a=>a.reduce((n,g)=>n+Math.max(0,g.moves-72),0);
  const comparisons=["bounded","clear","three","lapse"].map(style=>{
    const b=games.filter(g=>g.style===style&&g.policy==="director-v2"),c=games.filter(g=>g.style===style&&g.policy==="director-budget-v1");
    const stats=a=>({moves:sum(a,"moves"),early:a.filter(g=>g.ended&&g.moves<=36).length,censored:a.filter(g=>!g.ended).length,tail:tail(a),
      ordinaryRate:rate(a,"ordinaryClearMoves","moves"),allClearRate:rate(a,"allClears","moves"),
      helpPer100:100*rate(a,"helpApplied","lateDeals"),fallback:sum(a,"fallback"),p95:quantile(a.flatMap(g=>g.generationMs),.95),cpuP95:quantile(a.flatMap(g=>g.generationCpuMs),.95)});
    const base=stats(b),candidate=stats(c);
    const gates={early:candidate.early<=base.early,ordinary:candidate.ordinaryRate>=.8*base.ordinaryRate,
      tail:["clear","lapse"].includes(style)?base.tail?candidate.tail<=.9*base.tail:"unknown":"not-gated",
      reward:style==="three"?candidate.allClearRate>=.25*base.allClearRate:"not-gated",
      help:base.helpPer100?candidate.helpPer100<base.helpPer100:"unknown",fallback:candidate.fallback<=2*base.fallback+1,
      compute:candidate.p95<=1.25*base.p95+2};
    return {style,base,candidate,gates};
  });
  await fs.mkdir(path.dirname(path.resolve(output)),{recursive:true});
  const report={partition,source:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),config:B.ASSIST_BUDGET_CONFIG,cap:300,revive:false,
    environment:`${process.version} ${process.platform}/${process.arch}; serial Node process; trace ON; CPU process user+system separately from wall; no phone`,comparisons,games};
  await fs.writeFile(output,JSON.stringify(report,null,2)+'\n');
  await fs.writeFile(output.replace(/\.json$/,'.cases.json'),JSON.stringify(cases,null,2)+'\n');
  console.log(JSON.stringify(comparisons,null,2));
} finally {await server.close();}
