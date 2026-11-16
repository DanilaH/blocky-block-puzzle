/** D98: crossed initial-state interventions, seen engineering data only. */
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {createServer} from 'vite';
import {challengeSeedPlan} from './seed-plan.mjs';
const independent=process.argv.includes('--independent');
const out=independent?'artifacts/challenge-start-causality-independent':'artifacts/challenge-start-causality';
const originalFile='artifacts/challenge-opportunity/development-v3.json';
const originalBytes=await fs.readFile(originalFile),original=JSON.parse(originalBytes);
const inputSha=crypto.createHash('sha256').update(originalBytes).digest('hex');
// Resume only complete saved games; no draw, policy, or outcome is changed.
const saved=process.argv.includes('--resume')?JSON.parse(await fs.readFile(`${out}/diagnostic.json`)):null;
if(saved){assert.equal(saved.independent,independent);assert.equal(saved.expectedRuns,512);assert.equal(saved.sourceInputSha256,inputSha);assert(saved.games.length<512);}
const runKey=g=>[g.style,g.caseId,g.geometry,g.counter,g.stream,g.tasks].join('/');
const savedKeys=new Set(saved?.games.map(runKey)??[]);assert.equal(savedKeys.size,saved?.games.length??0);
const plan=challengeSeedPlan('development-v3');
const server=await createServer({server:{middlewareMode:true,hmr:false,watch:null}});
try{
 const R=await server.ssrLoadModule('/src/core/rules.ts'),P=await server.ssrLoadModule('/scripts/director/mixed-players.ts'),C=await server.ssrLoadModule('/src/platform/play-capture.ts');
 const O=await server.ssrLoadModule('/scripts/challenge-content/oracle.ts'),F=await server.ssrLoadModule('/src/core/profile.ts');
 const games=saved?.games??[],initialChecks=saved?.initialChecks??[];let reproduced=saved?.reproduced??0;
 assert.equal(reproduced,games.filter(g=>g.native).length);
 const rows=()=>({provenance:'Synthetic only; D98 diagnostic counterfactuals, not acceptance or phone',independent,sourceInputSha256:inputSha,expectedRuns:512,reproduced,initialChecks,games});
 await fs.mkdir(out,{recursive:true});
 for(const [style,ms] of Object.entries({clear:1500,lapse:2400}))for(const {seed,caseId,opening,rotation} of plan){
  const ordinary=R.newGame(seed,'ordinary-init','director-challenge-v3',undefined,'tasks'),authored=R.newGame(seed,'authored-init','director-challenge-v3',undefined,'full');
  const {sinceLoad:a,...aa}=ordinary.goalDirector,{sinceLoad:b,...bb}=authored.goalDirector;
  assert.equal(a,1);assert.equal(b,0);assert.deepEqual(aa,bb);assert.equal(aa.payoff,1);
  const distance=target=>{let state=seed;for(let n=0;n<128;n++){if(state===target)return n;state=R.random(state).state;}throw Error('Unknown initial RNG consumption');};
  if(style==='clear'){
   const check={caseId,opening,rotation,ordinarySinceLoad:a,authoredSinceLoad:b,payoff:aa.payoff,ordinaryRngDraws:distance(ordinary.rngState),authoredRngDraws:distance(authored.rngState)};
   const old=initialChecks.find(x=>x.caseId===caseId);if(old)assert.deepEqual(old,check);else initialChecks.push(check);
  }
  const offset=(opening+rotation+(style==='lapse'?1:0))%16;
  const codes=Array.from({length:16},(_,i)=>(i+offset)%16);
  for(const code of codes){
   const geometry=(code>>3)&1,counter=independent?1:(code>>2)&1,stream=independent?(code>>1)&3:(code>>1)&1,tasks=code&1;
   if(savedKeys.has(runKey({style,caseId,geometry,counter,stream,tasks})))continue;
   const variant=geometry?(tasks?'full':'starts'):(tasks?'tasks':'control');
   const native=!independent&&counter===(geometry?0:1)&&stream===(geometry?0:1);
   const baseId=`challenge-development-v3-${style}-${seed}-${variant}`;
   let g=R.newGame(seed,native?baseId:`d98-${independent?'independent-':''}${style}-${seed}-${code}`,variant==='control'?'director-v2':'director-challenge-v3',undefined,variant);
   const before=structuredClone(g);
   const future=independent?(crypto.createHash('sha256').update(`blocky-d98-independent-future-v1:${caseId}:${stream}`).digest().readUInt32LE(0)||1):(stream?ordinary.rngState:authored.rngState);
   g={...g,goalDirector:{...g.goalDirector,sinceLoad:counter},rngState:future};
   const expected={...before,goalDirector:{...before.goalDirector,sinceLoad:counter},rngState:g.rngState};assert.deepEqual(g,expected);
   assert.deepEqual(g.board,before.board);assert.deepEqual(g.tray,before.tray);assert.equal(g.reviveUsed,false);assert(F.validProfile(F.createProfile(g)));
   const initial=structuredClone(g),trajectory=crypto.createHash('sha256'),events=[];
   let player=(seed^0x85ebca6b)>>>0,active=0,allClears=0,ordinaryClears=0,lines=0,firstReward=null,firstLoad=null,changedHands=0,certifiedTasks=0,maxWork=0,proofUnknowns=0;
   let afterOpening;
   while(g.status==='playing'&&g.moves<300){
    const roll=R.random(player);player=roll.state;
    const move=P.chooseMixed(g.board,g.tray,style,roll.value).move;assert(move);
    const shape=g.tray[move.slot].shapeId,result=R.applyMove(g,move,g.revision,true,{activeMs:active+=ms});assert(result);g=result.state;
    allClears+=Number(result.allClear);ordinaryClears+=Number(result.lines>0&&!result.allClear);lines+=result.lines;
    if(result.allClear&&firstReward===null)firstReward=g.moves;
    trajectory.update(JSON.stringify([move,shape,g.board.map(Boolean),result.lines,result.allClear]));
    if(g.moves===3)afterOpening={occupied:g.board.filter(Boolean).length,goal:g.goalDirector,rng:g.rngState,rhythm:g.rhythm};
    const t=result.decision;
    if(t){
     O.verifyWitness(t.input.board,g.tray,t.validation.witness);assert(t.validation.work<=24000);maxWork=Math.max(maxWork,t.validation.work);
     changedHands+=Number(t.challenge?.changedHand??false);certifiedTasks+=Number(['CHAIN','CHOICE'].includes(t.challenge?.task));proofUnknowns+=t.challenge?.admission?.unknownProofs??0;
     if(t.requestedPhase==='load'||t.validation?.actual==='load'||g.goalDirector.last==='load')if(firstLoad===null)firstLoad=g.moves;
     events.push({at:g.moves,ids:g.tray.map(s=>s.shapeId),occupied:g.board.filter(Boolean).length,goal:{...g.goalDirector},rng:g.rngState,source:t.source,task:t.challenge?.task??null,changed:t.challenge?.changedHand??false});
    }
   }
   assert(F.validProfile({...F.createProfile(g),best:g.score}));
   const actual={finalHash:C.stateHash(g),moves:g.moves,allClears,ordinary:ordinaryClears,ended:g.status==='over'};
   if(native){const old=original.games.find(x=>x.seed===seed&&x.style===style&&x.arm===variant);assert(old);for(const [k,v] of Object.entries(actual))assert.equal(v,old[k],`${style}/${seed}/${variant}/${k}`);reproduced++;}
   games.push({caseId,seed,opening,rotation,style,geometry,counter,stream,tasks,variant,native,initial,afterOpening,...actual,lines,firstReward,firstLoad,changedHands,certifiedTasks,maxWork,proofUnknowns,trajectoryHash:trajectory.digest('hex'),physicalHash:C.stateHash({...g,gameId:'paired'}),events});
   if(games.length%16===0){await fs.writeFile(`${out}/diagnostic.json`,JSON.stringify(rows(),null,2)+'\n');console.log(`${games.length}/512, original outcomes ${reproduced}/${independent?0:128} exact`);}
  }
 }
 assert.equal(games.length,512);assert.equal(reproduced,independent?0:128);await fs.writeFile(`${out}/diagnostic.json`,JSON.stringify(rows(),null,2)+'\n');
 console.log('All 512 diagnostic runs completed;',reproduced,'original outcomes exactly reproduced');
}finally{await server.close();}
