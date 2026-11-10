// Engineering only. Not an acceptance cohort and never presented as a holdout.
import assert from 'node:assert/strict';
import {goalRuntime} from './goal-runtime.mjs';
const {server,R,D,H,P}=await goalRuntime();
try{
 for(let seed=941001;seed<=941006;seed++)for(const style of ['clear','three','plausible']){
  let g=R.newGame(seed,'goal-engineering-'+seed,'director-v2'),rng=(seed^0x9e3779b9)>>>0;
  const count={},cert={},failures=[];let clears=0,lines=0,maxWork=0,initial=null;
  function audit(deal){
    maxWork=Math.max(maxWork,deal.diagnostic.checks);assert(maxWork<=24000);
    const {actual,certificate}=deal.diagnostic;count[actual]=(count[actual]??0)+1;
    if(certificate)cert[certificate.kind]=(cert[certificate.kind]??0)+1;
    let board=g.board;for(const m of deal.witness){const s=R.shapeById(deal.tray[m.slot].shapeId);assert(R.fits(board,s,m.x,m.y));board=R.place(board,s,m.x,m.y).board;}
  }
  audit(D.goalDirectorDeal(g.board,seed));
  while(g.status==='playing'&&g.moves<180){
    const roll=R.random(rng);rng=roll.state;
    const move=P.choose(g.board,g.tray,style,roll.value),before=g,refill=g.tray.filter(s=>!s.used).length===1;
    const moved=R.applyMove(g,move,g.revision);assert(moved);g=moved.state;
    clears+=Number(moved.allClear);lines+=moved.lines;if(moved.lines&&initial===null)initial=g.moves;
    if(refill){
      const rhythm=H.advanceRhythmV4(before.rhythm,g.board,moved.lines,moved.allClear,R.random(before.rngState).value);
      const deal=D.goalDirectorDeal(g.board,before.rngState,g.moves,rhythm,D.observeGoalDirector(before.goalDirector,moved.allClear));
      assert.deepEqual(deal.tray,g.tray);audit(deal);
    }
  }
  console.log(JSON.stringify({seed,style,moves:g.moves,ended:g.status==='over',clears,lines,initial,count,cert,maxWork}));
 }
}finally{await server.close();}
