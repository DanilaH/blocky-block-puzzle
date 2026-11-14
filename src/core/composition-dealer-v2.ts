import { SHAPES, random, type Board } from "./rules";
import { goalDirectorDeal, initialGoalDirector, type GoalDirectorState } from "./goal-director";
import { diversifyDeal } from "./composition-dealer";
import { initialRhythmV4, type RhythmState } from "./rhythm";
import { catalog, packagePath } from "./director-search";
import { OPENINGS } from "./opening-catalog";

export const openingIndex = (seed: number) => Math.floor(random(seed >>> 0 || 1).value * OPENINGS.length);

/** Bounded reroll of the gameplay seed only; assignment RNG is independent. */
export function seedForDifferentOpening(seed: number, previous?: number): number {
  let next = seed >>> 0 || 1;
  for (let i = 0; i < 32; i++) {
    if (openingIndex(next) !== previous) return next;
    next = random(next).state;
  }
  return openingIndex(1) !== previous ? 1 : 0x9e3779b9;
}

export function openingDeal(seed: number) {
  let rng = seed >>> 0 || 1;
  const roll = () => { const r = random(rng); rng = r.state; return r.value; };
  const openingId = Math.floor(roll() * OPENINGS.length);
  const turns = Math.floor(roll() * 4);
  const opening = OPENINGS[openingId]!;
  const path = opening.witness.map(m => {
    const source = SHAPES.find(s => s.id === opening.shapeIds[m.slot])!;
    let cells = source.cells.map(([x,y]) => [x + m.x, y + m.y]);
    for (let i = 0; i < turns; i++) cells = cells.map(([x,y]) => [7-y!, x!]);
    const x = Math.min(...cells.map(c => c[0]!)), y = Math.min(...cells.map(c => c[1]!));
    const key = (points: readonly (readonly number[])[]) => points.map(c => `${c[0]},${c[1]}`).sort().join(";");
    const local = key(cells.map(c => [c[0]!-x, c[1]!-y]));
    const shape = SHAPES.findIndex(s => s.family === source.family && key(s.cells) === local);
    const op = catalog()[shape]?.find(o => o.x === x && o.y === y);
    if (!op) throw Error("Invalid generated opening rotation");
    return op;
  });
  const shuffle = [0,1,2].map(i => ({i,r:roll()})).sort((a,b)=>a.r-b.r).map(x=>x.i);
  return { ...packagePath(path,shuffle), rngState:rng, fallback:false, openingId,
    director:{...initialGoalDirector(),deals:1,rest:1},
    composition:{reason:"opening-catalog",checks:0,limit:12000} };
}

/** One manual candidate. Early deals and all three revive recoveries are frozen. */
export function compositionDealV2(board: Board, seed: number, moves = 0, rhythm: RhythmState = initialRhythmV4(), saved: GoalDirectorState = initialGoalDirector()) {
  if (moves === 0 && board.every(c=>!c)) return openingDeal(seed);
  const tempo = moves >= 72 && rhythm.recoveryDeals === 0;
  const payoffReduced = tempo && saved.payoff > 1;
  const controller = payoffReduced ? {...saved,payoff:1} : saved;
  const base = goalDirectorDeal(board,seed,moves,rhythm,controller);
  const lineAllowance = tempo && base.director.last === "prepare" ? 1 : 0;
  const result = diversifyDeal(base,board,rhythm,lineAllowance);
  return {...result,composition:{...result.composition,tempo,payoffReduced,lineAllowance}};
}
