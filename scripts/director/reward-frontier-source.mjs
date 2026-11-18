import assert from 'node:assert/strict';

/** Instrument the checked-in flow-v4 rather than maintaining another dealer fork.
 * Every anchor fails closed if the production implementation changes. */
export function rewardFrontierSource(input) {
  let source = input;
  const inject = (needle, replacement) => {
    assert.equal(source.split(needle).length, 2, `Flow anchor: ${needle}`);
    source = source.replace(needle, replacement);
  };
  source = source
    .replaceAll('from "./rhythm"', 'from "/src/core/rhythm"')
    .replaceAll('from "./rules"', 'from "/src/core/rules"');
  source = 'import {selectRewardFrontier} from "/scripts/director/reward-frontier";\n' + source;
  inject('  let rng = seed;', '  const archive = new Map<string, any>();\n  let archiveCapped = false;\n  let rng = seed;');
  inject('    value: number;', '    value: number;\n    steps: string;');
  inject('path: [], lines: 0, clears: 0, value: 0', 'path: [], lines: 0, clears: 0, value: 0, steps: ""');
  inject('          const key = r.join(",");', `          const steps = parent.steps + cleared + ':' + Number(occupied === 0) + ';';
          if (depth === 2) {
            const bag = [...parent.path, op].map(p => SHAPES[p.shape]!.family).sort().join(',');
            const area = [...parent.path, op].reduce((n,p) => n + SHAPES[p.shape]!.cells.length, 0);
            const archiveKey = bag + '|' + steps + '|' + area + '|' + occupied;
            const existing = archive.get(archiveKey);
            if ((!existing || existing.value < value) && (existing || archive.size < 512))
              archive.set(archiveKey, {rows:r, path:[...parent.path, op], lines, clears, value, steps, bag, area, occupied});
            else if (!existing && archive.size >= 512) archiveCapped = true;
          }
          const key = r.join(",");`);
  inject('            value,\n          };', '            value,\n            steps,\n          };');
  inject('  const chosen =', '  let chosen =');
  inject('  const shuffle = [0, 1, 2]', `  const original = chosen;
  const describe = (n: Node) => ({...n,
    bag:n.path.map(p=>SHAPES[p.shape]!.family).sort().join(','),
    area:n.path.reduce((v,p)=>v+SHAPES[p.shape]!.cells.length,0),
    occupied:n.rows.reduce((v,r)=>v+POP[r]!,0)});
  const originalDescription = describe(original);
  const selected = selectRewardFrontier(originalDescription,[...archive.values()],history,moves);
  if (selected !== originalDescription) chosen = selected;
  const shuffle = [0, 1, 2]`);
  inject('  return { tray, rngState: rng, fallback: false, witness, visited };', `  return {tray, rngState:rng, fallback:false, witness, visited,
    changed:chosen!==original, archiveSize:archive.size, archiveCapped,
    originalTray:shuffle.map(i=>({shapeId:SHAPES[original.path[i]!.shape]!.id,used:false,color:(original.path[i]!.shape%6)+1})),
    originalWitness:original.path.map((op,i)=>({slot:shuffle.indexOf(i),x:op.x,y:op.y})),
    proof:{original:originalDescription, selected:describe(chosen)}};`);
  return source;
}
