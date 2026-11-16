/** Publication guard: new QA JSON contains aggregates only, not gameplay states. */
import fs from "node:fs/promises";
import assert from "node:assert/strict";
const summary=JSON.parse(await fs.readFile('docs/qa/assist-budget-2026-11-16/comparison-summary.json','utf8'));
const jsonFiles=(await fs.readdir('docs/qa/assist-budget-2026-11-16')).filter(p=>p.endsWith('.json')).sort();
assert.deepEqual(jsonFiles,['comparison-summary.json']);
const prohibited=new Set(['board','tray','state','events','move','movesPlayed','witness','gameId','trace','cases','frames','frameTimes']);
function walk(v){if(v&&typeof v==='object')for(const [k,x] of Object.entries(v)){assert(!prohibited.has(k),`Private/record-level key in public data: ${k}`);walk(x);}}
walk(summary);
assert(summary.provenance.startsWith('Synthetic only'));
for(const p of ['dev','holdout']){assert.equal(summary[p].runs,64);assert.equal(summary[p].comparisons.length,4);}
console.log('Public QA aggregates contain no boards, moves, witnesses or owner identifiers');
for(const file of await fs.readdir('docs/qa/challenge-content-2026-11-16'))if(file.endsWith('.json')){
 const data=JSON.parse(await fs.readFile(`docs/qa/challenge-content-2026-11-16/${file}`,'utf8'));walk(data);
 assert(data.provenance.startsWith('Synthetic only'));assert.equal(data.runs,128);assert(data.byArm&&data.gates);
}
console.log('Challenge QA is aggregate-only; rejected development generations remain visible');
for(const file of await fs.readdir('docs/qa/challenge-balance-2026-11-16'))if(file.endsWith('.json')){
 const data=JSON.parse(await fs.readFile(`docs/qa/challenge-balance-2026-11-16/${file}`,'utf8'));walk(data);
 assert(data.provenance.startsWith('Synthetic only'));assert.equal(data.runs,256);assert(data.byArm&&data.gates);
}
console.log('Verified challenge QA contains aggregates only; no raw states or owner inputs');
for(const file of await fs.readdir('docs/qa/challenge-opportunity-2026-11-16'))if(file.endsWith('.json')){
 const data=JSON.parse(await fs.readFile(`docs/qa/challenge-opportunity-2026-11-16/${file}`,'utf8'));walk(data);
 assert(data.provenance.startsWith('Synthetic only'));assert.equal(data.runs,256);assert(data.byArm&&data.gates);
}
console.log('Opportunity QA is aggregate-only; independent content and negative gates remain explicit');
const causalityDir='docs/qa/challenge-start-causality-2026-11-16';
assert.deepEqual((await fs.readdir(causalityDir)).filter(p=>p.endsWith('.json')).sort(),['crossed-summary.json','independent-summary.json']);
for(const file of ['crossed-summary.json','independent-summary.json']){
 const data=JSON.parse(await fs.readFile(`${causalityDir}/${file}`,'utf8'));walk(data);
 assert(data.provenance.startsWith('Synthetic only'));assert.equal(data.runs,512);assert.equal(data.nCases,16);
 assert(data.byCell);assert(data.maxWork<=24000);
 if(file==='crossed-summary.json')assert.equal(data.nativeOutcomesExact,128);
 else {assert.equal(data.streamsPerCase,4);for(const p of data.pooled){assert.equal(p.nCaseClusters,16);assert.equal(p.pairedGames,64);}}
}
console.log('D98 diagnostics are aggregate-only; paired stream games retain sixteen case clusters');
const humanDir='docs/qa/human-selection-071-2026-11-17';
assert.deepEqual((await fs.readdir(humanDir)).filter(p=>p.endsWith('.json')),['selection-summary.json']);
const human=JSON.parse(await fs.readFile(`${humanDir}/selection-summary.json`,'utf8'));walk(human);
assert(human.provenance.startsWith('Owner playtest aggregates'));assert.equal(human.humanParticipants,1);
assert.equal(human.recordings,2);assert.equal(human.exactMoves,685);assert.equal(human.uniqueMoves,685);assert.equal(human.playedGames,5);
assert.equal(human.games.reduce((n,g)=>n+g.all.moves,0),685);assert(human.games.every(g=>g.ended&&g.hinted===0));
assert(!/gameId|installationId|blocky-play|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(JSON.stringify(human)));
console.log('Human selection QA contains anonymous counts only; source recordings remain private');
