/** Offline comparator. Bounded rejection sampling with an explicit proved reserve. */
import { SHAPES, random, fits, place, type Board, type Slot, type Move } from '../../../src/core/rules';

export function solveRemaining(board: Board, tray: Slot[], budget = 5000) {
  let checks = 0, exhausted = false;
  function visit(b: Board, remaining: number[], path: Move[]): Move[] | null {
    if (!remaining.length) return path;
    for (const slot of remaining) {
      const shape = SHAPES.find(s => s.id === tray[slot]!.shapeId)!;
      for (let y = 0; y <= 8 - shape.height; y++) for (let x = 0; x <= 8 - shape.width; x++) {
        if (checks >= budget) { exhausted = true; return null; }
        checks++;
        if (!fits(b, shape, x, y)) continue;
        if (checks >= budget) { exhausted = true; return null; }
        checks++;
        const found = visit(place(b, shape, x, y).board, remaining.filter(i => i !== slot), [...path, { slot, x, y }]);
        if (found) return found;
        if (exhausted) return null;
      }
    }
    return null;
  }
  const witness = visit(board, tray.flatMap((s, i) => s.used ? [] : [i]), []);
  return { witness, checks, status: witness ? 'found' : exhausted ? 'unknown' : 'impossible' } as const;
}
export function strictRandomDeal(board: Board, seed: number, budget = 24000) {
  const reserve = Math.min(512, budget), searchLimit = budget - reserve;
  let state = seed, checks = 0, attempts = 0, unknown = 0, impossible = 0;
  const total = SHAPES.reduce((n, s) => n + s.weight, 0);
  const draw = () => {
    const r = random(state); state = r.state;
    let p = r.value * total;
    return SHAPES.find(s => (p -= s.weight) < 0) ?? SHAPES.at(-1)!;
  };
  while (attempts < 32 && checks < searchLimit) {
    attempts++;
    const tray = Array.from({ length: 3 }, (_, i) => ({ shapeId: draw().id, color: i + 1, used: false }));
    const proof = solveRemaining(board, tray, Math.min(1500, searchLimit - checks));
    checks += proof.checks;
    if (proof.witness) return { tray, rngState: state, fallback: false, witness: proof.witness,
      diagnostic: { checks, attempts, unknown, impossible, source: 'weighted-proved' } };
    unknown += Number(proof.status === 'unknown'); impossible += Number(proof.status === 'impossible');
  }
  // Do not relabel a failed bounded proof as an impossible board or as a fair
  // random draw. Three singles are separately identified emergency assistance.
  const tray: Slot[] = Array.from({ length: 3 }, (_, i) => ({ shapeId: 'S1-0', color: i + 1, used: false }));
  const proof = solveRemaining(board, tray, reserve); checks += proof.checks;
  if (!proof.witness) throw Error('No proved reserve within work limit');
  return { tray, rngState: random(state).state, fallback: true, witness: proof.witness,
    diagnostic: { checks, attempts, unknown, impossible, source: 'singletons-reserve' } };
}
