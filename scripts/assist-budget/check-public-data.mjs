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
