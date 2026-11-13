import { SHAPES } from "./rules";
import {
  type Rows,
  type Operation,
  type WorkBudget,
  catalog,
  canPlace,
  transition,
  occupied,
  POP,
} from "./director-search";
import { boardGeometry, compactReward } from "./director-goal-tools";

type Branch = { rows: Rows; path: Operation[]; lines: number; earned: boolean };
type Prefix = { ids: number[]; branches: Branch[]; value: number };
function potential(b: Branch) {
  const g = boardGeometry(b.rows);
  let columns = 0,
    rows = 0;
  for (const r of b.rows) {
    columns |= r;
    rows += Number(!!r);
  }
  const deficit = Math.min(rows, POP[columns]!) * 8 - g.occupied;
  return (
    b.lines * 500 +
    Number(b.earned) * 8000 -
    deficit * 80 -
    g.holes * 30 -
    g.edges * 2
  );
}

/** Build shape bags over several ordinary placements, rather than choosing a
 * single ideal six-move route. Missing cells in a line envelope guide every
 * prefix. A bounded payoff search participates before a completed bag wins.
 * Ordered prefix samples are construction heuristics, never safety proofs. */
export function constructRewardCandidates(
  rows: Rows,
  meter: WorkBudget,
  rank: number[],
  reverse: boolean,
) {
  const cap = meter.ceiling;
  meter.ceiling = Math.min(cap, meter.used + 8500);
  try {
    const cache = new Map<
      string,
      | {
          op: Operation;
          rows: Rows;
          lines: number;
          clear: boolean;
          local: number;
        }[]
      | null
    >();
    function options(b: Rows, id: number) {
      const key = b.join() + ":" + id;
      if (cache.has(key)) return cache.get(key)!;
      const choices: {
        op: Operation;
        rows: Rows;
        lines: number;
        clear: boolean;
        local: number;
      }[] = [];
      for (const op of catalog()[id]!) {
        const fits = canPlace(b, op, meter);
        if (fits === null) {
          cache.set(key, null);
          return null;
        }
        if (!fits) continue;
        const n = transition(b, op, meter);
        if (!n) {
          cache.set(key, null);
          return null;
        }
        const g = boardGeometry(n.rows);
        choices.push({
          op,
          rows: n.rows,
          lines: n.lines,
          clear: n.clear,
          local: n.lines * 180 - g.holes * 25 - g.edges - g.occupied * 2,
        });
      }
      choices.sort((a, b) => b.local - a.local);
      const selected = choices
        .filter((c) => c.local >= (choices[0]?.local ?? 0) - 16)
        .slice(0, 3);
      cache.set(key, selected);
      return selected;
    }
    function extend(parent: Prefix, id: number): Prefix | null {
      const branches: Branch[] = [];
      for (const b of parent.branches) {
        const next = options(b.rows, id);
        if (!next?.length) return null;
        for (const n of next)
          branches.push({
            rows: n.rows,
            path: [...b.path, n.op],
            lines: b.lines + n.lines,
            earned: b.earned || n.clear,
          });
      }
      const value =
        branches.reduce((s, b) => s + potential(b), 0) / branches.length;
      // Keep a fixed spread across the local ranking, not its best endpoints.
      const selected =
        branches.length <= 3
          ? branches
          : [
              branches[0]!,
              branches[Math.floor(branches.length / 2)]!,
              branches.at(-1)!,
            ];
      return { ids: [...parent.ids, id], branches: selected, value };
    }
    let beam: Prefix[] = [
      {
        ids: [],
        branches: [{ rows, path: [], lines: 0, earned: false }],
        value: 0,
      },
    ];
    let pool = rank;
    for (let depth = 0; depth < 3; depth++) {
      const end = Math.min(
        meter.ceiling,
        meter.used + (depth === 0 ? 2300 : 2400),
      );
      const next: Prefix[] = [];
      outer: for (const parent of beam)
        for (const id of pool) {
          if (SHAPES[id]!.cells.length < 2) continue;
          const old = meter.ceiling;
          meter.ceiling = end;
          let node: Prefix | null;
          try {
            node = extend(parent, id);
          } finally {
            meter.ceiling = old;
          }
          if (node) next.push(node);
          if (meter.used >= end) break outer;
        }
      next.sort((a, b) => b.value - a.value);
      if (!next.length) return [];
      if (depth === 0) {
        // Geometrically useful choices plus two seeded alternatives. Every
        // extension still ranks all legal placements of the selected shape.
        pool = [
          ...new Set([
            ...next.slice(0, 5).map((n) => n.ids[0]!),
            ...rank.slice(0, 2),
          ]),
        ];
      }
      const seen = new Set<string>();
      beam = next
        .filter((n) => {
          const k = [...n.ids].sort((a, b) => a - b).join();
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        })
        .slice(0, depth === 2 ? 4 : 2);
    }
    const evaluated = [];
    for (const node of beam) {
      let proved = 0;
      const completions = [];
      for (const b of node.branches) {
        if (b.earned) {
          proved++;
          continue;
        }
        const old = meter.ceiling;
        meter.ceiling = Math.min(old, meter.used + 400);
        let tail: Operation[] | null;
        try {
          tail = compactReward(b.rows, meter, rank);
        } finally {
          meter.ceiling = old;
        }
        if (tail) {
          proved++;
          completions.push({ via: b.path, tail });
        }
      }
      evaluated.push({
        path: node.branches[0]!.path,
        earned: node.branches[0]!.earned,
        value: node.value + (proved / node.branches.length) * 5000,
        completions,
      });
      if (meter.used >= meter.ceiling) break;
    }
    return evaluated.sort((a, b) => b.value - a.value).slice(0, 2);
  } finally {
    meter.ceiling = cap;
  }
}
