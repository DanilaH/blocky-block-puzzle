import { SHAPES, random, type Board, type Move } from "./rules";
import { initialRhythmV4, type RhythmState } from "./rhythm";
import {
  WorkBudget,
  POP,
  catalog,
  toRows,
  occupied,
  canPlace,
  transition,
  legalOperations,
  proveIds,
  packagePath,
  type Operation,
  type Rows,
} from "./director-search";

export type GoalKind =
  "prepare" | "payoff" | "load" | "relief" | "rest" | "recovery" | "emergency";
export interface GoalDirectorState {
  version: 2;
  deals: number;
  sinceLoad: number;
  rest: number;
  payoff: number;
  last: GoalKind;
}
export const initialGoalDirector = (): GoalDirectorState => ({
  version: 2,
  deals: 0,
  sinceLoad: 0,
  rest: 0,
  payoff: 0,
  last: "prepare",
});
export function validGoalDirector(s: GoalDirectorState | undefined) {
  return (
    !!s &&
    s.version === 2 &&
    Number.isInteger(s.deals) &&
    s.deals >= 0 &&
    s.deals <= 1000000 &&
    Number.isInteger(s.sinceLoad) &&
    s.sinceLoad >= 0 &&
    s.sinceLoad <= 32 &&
    Number.isInteger(s.rest) &&
    s.rest >= 0 &&
    s.rest <= 1 &&
    Number.isInteger(s.payoff) &&
    s.payoff >= 0 &&
    s.payoff <= 2 &&
    [
      "prepare",
      "payoff",
      "load",
      "relief",
      "rest",
      "recovery",
      "emergency",
    ].includes(s.last)
  );
}
export const observeGoalDirector = (
  s: GoalDirectorState,
  allClear: boolean,
): GoalDirectorState => (allClear ? { ...s, rest: 1, payoff: 0 } : s);

const permutations = [
  [0, 1, 2],
  [0, 2, 1],
  [1, 0, 2],
  [1, 2, 0],
  [2, 0, 1],
  [2, 1, 0],
];
type Node = {
  rows: Rows;
  path: Operation[];
  lines: number;
  clears: number;
  value: number;
};
export function boardGeometry(rows: Rows) {
  let edges = 0,
    holes = 0,
    fullness = 0;
  for (let y = 0; y < 8; y++) {
    const row = rows[y]!,
      empty = ~row & 255;
    fullness += POP[row]! ** 2;
    edges += POP[(row ^ (row << 1)) & 255]! + POP[row ^ (rows[y + 1] ?? 0)]!;
    const near =
      ((empty << 1) |
        (empty >> 1) |
        (~(rows[y - 1] ?? 255) & 255) |
        (~(rows[y + 1] ?? 255) & 255)) &
      255;
    holes += POP[empty & ~near]!;
  }
  for (let x = 0; x < 8; x++) {
    let n = 0;
    for (const row of rows) n += Number(!!(row & (1 << x)));
    fullness += n * n;
  }
  return { edges, holes, fullness, occupied: occupied(rows) };
}
let targets: { rows: Rows; area: number }[] | undefined;
function clearTargets() {
  if (targets) return targets;
  targets = [];
  for (let r = 0; r < 256; r++)
    for (let c = 0; c < 256; c++) {
      const n = POP[r]! + POP[c]!;
      if (!n || n > 4) continue;
      const rows = Array.from({ length: 8 }, (_, y) =>
        r & (1 << y) ? 255 : c,
      );
      targets.push({ rows, area: occupied(rows) });
    }
  targets.sort(
    (a, b) =>
      a.area - b.area ||
      (a.rows.join(",") < b.rows.join(",")
        ? -1
        : a.rows.join(",") > b.rows.join(",")
          ? 1
          : 0),
  );
  return targets;
}

let covering: Operation[][] | undefined;
function goalCovering() {
  if (covering) return covering;
  covering = Array.from({ length: 64 }, () => []);
  for (const ops of catalog())
    for (const op of ops)
      for (let y = 0; y < 8; y++) {
        for (let bits = op.rows[y]!; bits; bits &= bits - 1) {
          const x = 31 - Math.clz32(bits & -bits);
          covering[y * 8 + x]!.push(op);
        }
      }
  return covering;
}
const lastPieceIndex = new Map<number, Operation[]>();
function coverCell(shape: number, cell: number) {
  const key = shape * 64 + cell;
  let ops = lastPieceIndex.get(key);
  if (!ops) {
    ops = goalCovering()[cell]!.filter((o) => o.shape === shape);
    lastPieceIndex.set(key, ops);
  }
  return ops;
}
function lastRewardCandidates(rows: Rows, shape: number) {
  const y = rows.findIndex((r) => r !== 0);
  if (y < 0) return [];
  const x = 31 - Math.clz32(rows[y]! & -rows[y]!),
    rowHole = ~rows[y]! & 255;
  const columnHole = rows.findIndex((r) => !(r & (1 << x)));
  if (!rowHole || columnHole < 0) return catalog()[shape]!;
  const holeX = 31 - Math.clz32(rowHole & -rowHole);
  // To erase this occupied cell, the last piece must complete its row or
  // column. Each has an empty cell that the piece must cover. This index is
  // exhaustive (<=18 origins), unlike a heuristic target-class cutoff.
  return [
    ...new Set([
      ...coverCell(shape, y * 8 + holeX),
      ...coverCell(shape, columnHole * 8 + x),
    ]),
  ];
}
/** A target-class miss is unknown. The route is replayed, including early clears. */
function finishGoal(rows: Rows, meter: WorkBudget, rank: number[]) {
  const count = occupied(rows),
    priority = new Map(rank.map((id, i) => [id, i]));
  const byCell = goalCovering().map((ops) =>
    [...ops].sort((a, b) => priority.get(a.shape)! - priority.get(b.shape)!),
  );
  let answer: Operation[] | null = null,
    exhausted = false;
  function visit(missing: Rows, path: Operation[]): boolean {
    const left = occupied(missing),
      remaining = 3 - path.length;
    if (!left) {
      if (remaining) return false;
      for (const order of permutations) {
        let board = rows;
        const route: Operation[] = [];
        let valid = true;
        for (const i of order) {
          const op = path[i]!,
            fits = canPlace(board, op, meter);
          if (fits === null) {
            exhausted = true;
            return false;
          }
          if (!fits) {
            valid = false;
            break;
          }
          const next = transition(board, op, meter);
          if (!next) {
            exhausted = true;
            return false;
          }
          board = next.rows;
          route.push(op);
        }
        if (valid && occupied(board) === 0) {
          answer = route;
          return true;
        }
      }
      return false;
    }
    if (!remaining || left < remaining || left > remaining * 9) return false;
    const y = missing.findIndex((r) => r !== 0),
      x = 31 - Math.clz32(missing[y]! & -missing[y]!);
    for (const op of byCell[y * 8 + x]!) {
      if (!meter.spend()) {
        exhausted = true;
        return false;
      }
      const size = SHAPES[op.shape]!.cells.length;
      if (
        size > left - (remaining - 1) ||
        left - size > (remaining - 1) * 9 ||
        op.rows.some((r, y) => (r & missing[y]!) !== r)
      )
        continue;
      if (
        visit(
          missing.map((r, y) => r & ~op.rows[y]!),
          [...path, op],
        )
      )
        return true;
      if (exhausted) return false;
    }
    return false;
  }
  for (const target of clearTargets()) {
    if (!meter.spend()) break;
    const deficit = target.area - count;
    if (
      deficit < 3 ||
      deficit > 27 ||
      rows.some((r, y) => (r & target.rows[y]!) !== r)
    )
      continue;
    if (
      visit(
        target.rows.map((r, y) => r & ~rows[y]!),
        [],
      )
    )
      return answer;
    if (exhausted) break;
  }
  return null;
}

type Certificate =
  | { kind: "slot-order"; forbiddenOrder: number[] }
  | { kind: "placement" | "reward-choice"; badFirst: Move; goodFirst: Move };
/** Certify an actual restriction, never classify an exhausted branch as failure. */
function decisionCertificate(
  rows: Rows,
  path: Operation[],
  meter: WorkBudget,
): Certificate | null {
  const ids = path.map((o) => o.shape),
    positiveOrder = [0, 1, 2];
  let witnessed = rows,
    reward = false;
  for (const op of path) {
    const next = transition(witnessed, op, meter);
    if (!next) return null;
    witnessed = next.rows;
    reward ||= next.clear;
  }
  const first = path[0]!,
    good = transition(rows, first, meter);
  if (!good) return null;
  const value = (r: Rows, lines: number) => {
    const g = boardGeometry(r);
    return lines * 200 - g.occupied * 2 - g.edges - g.holes * 20;
  };
  const goodValue = value(good.rows, good.lines),
    options: { op: Operation; slot: number; next: Rows; value: number }[] = [],
    seen = new Set<string>();
  for (let slot = 0; slot < 3; slot++)
    for (const op of catalog()[ids[slot]!]!) {
      const key = op.shape + ":" + op.x + "," + op.y;
      if (seen.has(key)) continue;
      seen.add(key);
      const fits = canPlace(rows, op, meter);
      if (fits === null) break;
      if (!fits || (slot === 0 && op.x === first.x && op.y === first.y))
        continue;
      const next = transition(rows, op, meter);
      if (!next) break;
      if (next.clear) continue;
      const score = value(next.rows, next.lines);
      if (score >= goodValue - 12)
        options.push({ op, slot, next: next.rows, value: score });
    }
  options.sort((a, b) => b.value - a.value);
  function rewardRoute(
    board: Rows,
    left: number[],
  ): "found" | "unknown" | "unsolvable" {
    if (!left.length) return "unsolvable";
    for (let i = 0; i < left.length; i++)
      for (const op of left.length === 1
        ? lastRewardCandidates(board, left[i]!)
        : catalog()[left[i]!]!) {
        const fits = canPlace(board, op, meter);
        if (fits === null) return "unknown";
        if (!fits) continue;
        const next = transition(board, op, meter);
        if (!next) return "unknown";
        if (next.clear) return "found";
        const status = rewardRoute(
          next.rows,
          left.filter((_, j) => i !== j),
        );
        if (status !== "unsolvable") return status;
      }
    return "unsolvable";
  }
  if (reward)
    for (const c of options.slice(0, 5)) {
      const status = rewardRoute(
        c.next,
        ids.filter((_, i) => i !== c.slot),
      );
      if (status === "unsolvable") {
        const survival=proveIds(c.next,ids.filter((_,i)=>i!==c.slot),meter);
        if(survival.status==='unknown')return null;
        return {
          kind: survival.path?'reward-choice':'placement',
          badFirst: { slot: c.slot, x: c.op.x, y: c.op.y },
          goodFirst: { slot: 0, x: first.x, y: first.y },
        };
      }
      if (status === "unknown") return null;
    }
  function fixed(
    board: Rows,
    order: number[],
    depth = 0,
  ): "found" | "unknown" | "unsolvable" {
    if (depth === 3) return "found";
    for (const op of catalog()[ids[order[depth]!]!]!) {
      const fits = canPlace(board, op, meter);
      if (fits === null) return "unknown";
      if (!fits) continue;
      const next = transition(board, op, meter);
      if (!next) return "unknown";
      const status = fixed(next.rows, order, depth + 1);
      if (status !== "unsolvable") return status;
    }
    return "unsolvable";
  }
  // Start with the reverse witnessed order; an easy success need not consume
  // the whole diagnostic allowance before looking for a bad placement.
  const old = meter.ceiling;
  meter.ceiling = Math.min(old, meter.used + 1600);
  for (const order of [permutations[5]!, permutations[2]!, permutations[3]!]) {
    if (order.join() === positiveOrder.join()) continue;
    if (fixed(rows, order) === "unsolvable") {
      meter.ceiling = old;
      return { kind: "slot-order", forbiddenOrder: order };
    }
    if (meter.used >= meter.ceiling) break;
  }
  meter.ceiling = old;
  for (const c of options.slice(0, 5)) {
    const result = proveIds(
      c.next,
      ids.filter((_, i) => i !== c.slot),
      meter,
    );
    if (result.status === "unsolvable")
      return {
        kind: "placement",
        badFirst: { slot: c.slot, x: c.op.x, y: c.op.y },
        goodFirst: { slot: 0, x: first.x, y: first.y },
      };
    if (result.status === "unknown") break;
  }
  return null;
}

export function goalDirectorDeal(
  board: Board,
  seed: number,
  moves = 0,
  rhythm: RhythmState = initialRhythmV4(),
  saved = initialGoalDirector(),
  budget = 24000,
) {
  const meter = new WorkBudget(budget),
    rows = toRows(board),
    count = occupied(rows);
  let rng = seed >>> 0 || 1;
  const roll = () => {
    const r = random(rng);
    rng = r.state;
    return r.value;
  };
  const rank = SHAPES.map((_, i) => ({ i, r: roll() }))
      .sort((a, b) => a.r - b.r)
      .map((x) => x.i),
    reverse = roll() > 0.5;
  const initial = legalOperations(rows, meter),
    available = new Set(initial.ops.map((o) => o.shape));
  const large = [...available].some((i) => SHAPES[i]!.cells.length >= 6);
  const requested: GoalKind = rhythm.recoveryDeals
    ? "recovery"
    : saved.rest
      ? "rest"
      : saved.payoff
        ? "payoff"
        : moves < 12
          ? "prepare"
          : count >= 40 || rhythm.dryMoves >= 6
            ? "relief"
            : saved.sinceLoad >= 3 && large
              ? "load"
              : "prepare";
  let actual: GoalKind = requested,
    source = "goal-beam",
    path: Operation[] | null = null,
    goalFound = false;
  const old = meter.ceiling;
  if (
    count &&
    (requested === "payoff" ||
      requested === "relief" ||
      requested === "recovery")
  ) {
    meter.ceiling = Math.min(old, meter.used + 6000);
    path = finishGoal(rows, meter, rank);
    goalFound = !!path;
    meter.ceiling = old;
    if (path) source = "exact-clear";
  }
  const bag = (p: Operation[]) =>
    p
      .map((o) => SHAPES[o.shape]!.family)
      .sort()
      .join(",");
  const history = rhythm.recentBags ?? [];
  function beam(load: boolean) {
    const support =
      requested === "payoff" ||
      requested === "relief" ||
      requested === "recovery";
    const maxSize = requested === "rest" ? 4 : moves < 12 ? 6 : 9;
    const maxWork = Math.min(meter.ceiling, meter.used + 14000);
    let current: Node[] = [{ rows, path: [], lines: 0, clears: 0, value: 0 }],
      final: Node[] = [];
    for (let depth = 0; depth < 3; depth++) {
      const perDepth = Math.floor((maxWork - meter.used) / (3 - depth));
      const depthEnd = meter.used + perDepth,
        children = new Map<string, Node>();
      for (let pi = 0; pi < current.length; pi++) {
        const parent = current[pi]!,
          parentEnd =
            meter.used +
            Math.floor((depthEnd - meter.used) / (current.length - pi));
        const cap = meter.ceiling;
        meter.ceiling = Math.min(cap, parentEnd);
        outer: for (const id of rank) {
          const size = SHAPES[id]!.cells.length;
          if (
            load
              ? depth === 0 || (depth === 2 && saved.deals >= 8)
                ? size < 6
                : depth === 1
                  ? size > 4
                  : false
              : size > maxSize
          )
            continue;
          const ops = catalog()[id]!;
          for (let k = 0; k < ops.length; k++) {
            const op = ops[reverse ? ops.length - 1 - k : k]!,
              fits = canPlace(parent.rows, op, meter);
            if (fits === null) break outer;
            if (!fits) continue;
            const next = transition(parent.rows, op, meter);
            if (!next) break outer;
            const p = [...parent.path, op],
              lines = parent.lines + next.lines,
              clears = parent.clears + Number(next.clear),
              g = boardGeometry(next.rows);
            const novelty =
              depth === 2 ? (history.includes(bag(p)) ? -100 : 60) : 0;
            const variety =
              depth === 2 &&
              new Set(p.map((o) => SHAPES[o.shape]!.family)).size >= 2
                ? 60
                : 0;
            const value = load
              ? g.occupied * 4 - lines * 10 - g.holes * 20 - g.edges * 0.5
              : clears * (support ? 8000 : 2500) +
                lines * (support ? 500 : 180) +
                g.fullness * 1.1 -
                g.edges * 2 -
                g.holes * 65 -
                Math.abs(g.occupied - (support ? 0 : 16)) * 2 +
                novelty +
                variety;
            const child = { rows: next.rows, path: p, lines, clears, value },
              key = next.rows.join(",");
            if ((children.get(key)?.value ?? -Infinity) < value)
              children.set(key, child);
          }
        }
        meter.ceiling = cap;
      }
      const ranked = [...children.values()].sort((a, b) => b.value - a.value);
      if (!ranked.length) break;
      current = ranked.slice(0, 4);
      if (depth === 2) final = ranked;
    }
    return final;
  }
  let frontier: Node[] = [];
  if (!path) {
    frontier = beam(requested === "load");
    path = frontier[0]?.path ?? null;
    if (!path && requested === "load") {
      actual = "prepare";
      source = "load-miss";
      frontier = beam(false);
      path = frontier[0]?.path ?? null;
    }
  }
  // Retain a complete incumbent if a better-target search exhausts its budget.
  if (!path) {
    const pool = [...available].filter((i) => SHAPES[i]!.cells.length <= 4);
    for (let attempt = 0; attempt < 3 && pool.length; attempt++) {
      const ids = Array.from(
        { length: 3 },
        () => pool[Math.floor(roll() * pool.length)]!,
      );
      const proof = proveIds(rows, ids, meter);
      if (proof.path) {
        path = proof.path;
        source = "mixed-proven";
        if (requested === "load") actual = "prepare";
        break;
      }
      if (proof.status === "unknown") break;
    }
  }
  if (!path) {
    meter.ceiling = meter.limit;
    let b = rows;
    path = [];
    const single = SHAPES.findIndex((s) => s.id === "S1-0");
    for (let n = 0; n < 3; n++) {
      let chosen: Operation | undefined;
      for (const op of catalog()[single]!) {
        const fits = canPlace(b, op, meter);
        if (fits) {
          chosen = op;
          break;
        }
        if (fits === null) break;
      }
      if (!chosen) throw Error("Goal director emergency invariant");
      const next = transition(b, chosen, meter);
      if (!next) throw Error("Goal director emergency budget");
      b = next.rows;
      path.push(chosen);
    }
    actual = "emergency";
    source = "bounded-singletons";
  }
  let certificate: Certificate | null = null;
  if (
    moves >= 12 &&
    actual !== "rest" &&
    actual !== "recovery" &&
    actual !== "emergency"
  ) {
    meter.ceiling = Math.min(old, meter.used + 5000);
    certificate = decisionCertificate(rows, path, meter);
    if (!certificate && !goalFound) {
      const best = frontier[0];
      for (const alternative of frontier.slice(1, 4)) {
        if (
          meter.used >= meter.ceiling ||
          !best ||
          alternative.value < best.value - 80 ||
          alternative.clears < best.clears
        )
          break;
        const candidate = decisionCertificate(rows, alternative.path, meter);
        if (candidate) {
          path = alternative.path;
          certificate = candidate;
          source = "goal-beam-decision";
          break;
        }
      }
    }
    meter.ceiling = old;
  }
  const permutation = [0, 1, 2]
      .map((i) => ({ i, r: roll() }))
      .sort((a, b) => a.r - b.r)
      .map((x) => x.i),
    packaged = packagePath(path, permutation);
  if (certificate?.kind === "slot-order")
    certificate = {
      ...certificate,
      forbiddenOrder: certificate.forbiddenOrder.map((i) =>
        permutation.indexOf(i),
      ),
    };
  if (certificate && certificate.kind !== "slot-order")
    certificate = {
      ...certificate,
      badFirst: {
        ...certificate.badFirst,
        slot: permutation.indexOf(certificate.badFirst.slot),
      },
      goodFirst: {
        ...certificate.goodFirst,
        slot: permutation.indexOf(certificate.goodFirst.slot),
      },
    };
  const director: GoalDirectorState = {
    version: 2,
    deals: Math.min(1000000, saved.deals + 1),
    sinceLoad: actual === "load" ? 0 : Math.min(32, saved.sinceLoad + 1),
    rest: requested === "rest" ? 0 : saved.rest,
    payoff:
      actual === "load"
        ? 2
        : actual === "prepare"
          ? 1
          : actual === "payoff"
            ? Math.max(0, saved.payoff - 1)
            : saved.payoff,
    last: actual,
  };
  return {
    ...packaged,
    rngState: rng,
    fallback: actual === "emergency",
    director,
    diagnostic: {
      requested,
      actual,
      source,
      checks: meter.used,
      limit: meter.limit,
      goalFound,
      certificate,
      large: packaged.tray.filter(
        (s) => SHAPES.find((x) => x.id === s.shapeId)!.cells.length >= 6,
      ).length,
    },
  };
}
