import { SHAPES, random, type Board } from "./rules";
import { initialRhythmV4, type RhythmState } from "./rhythm";
import {
  WorkBudget,
  toRows,
  occupied,
  legalOperations,
  proveIds,
  catalog,
  canPlace,
  transition,
  packagePath,
  type Rows,
  type Operation,
} from "./director-search";
import {
  boardGeometry,
  shortReward,
  directorBeam,
  type DirectorNode,
} from "./director-goal-tools";
import {
  assessForgivingTrio,
  remapRobustness,
  type Robustness,
} from "./director-robustness";

export type ForgivingKind =
  | "gentle"
  | "build"
  | "prepare"
  | "friendly"
  | "gift"
  | "relief"
  | "load"
  | "rest"
  | "recovery"
  | "emergency";
export interface RewardSetup {
  rows: Rows;
  route: { shape: number; x: number; y: number }[];
}
export interface ForgivingDirectorState {
  version: 4;
  deals: number;
  sinceLoad: number;
  nextLoad: number;
  rest: number;
  last: ForgivingKind;
  prepared: RewardSetup[];
}
export const initialForgivingDirector = (): ForgivingDirectorState => ({
  version: 4,
  deals: 0,
  sinceLoad: 0,
  nextLoad: 4,
  rest: 0,
  last: "gentle",
  prepared: [],
});
export function validForgivingDirector(s: ForgivingDirectorState | undefined) {
  const integer = (n: number, max: number) =>
    Number.isInteger(n) && n >= 0 && n <= max;
  return (
    !!s &&
    s.version === 4 &&
    integer(s.deals, 1000000) &&
    integer(s.sinceLoad, 32) &&
    integer(s.nextLoad, 5) &&
    s.nextLoad >= 3 &&
    integer(s.rest, 1) &&
    [
      "gentle",
      "build",
      "prepare",
      "friendly",
      "gift",
      "relief",
      "load",
      "rest",
      "recovery",
      "emergency",
    ].includes(s.last) &&
    Array.isArray(s.prepared) &&
    s.prepared.length <= 2 &&
    s.prepared.every(
      (p) =>
        p &&
        Array.isArray(p.rows) &&
        p.rows.length === 8 &&
        p.rows.every((r) => integer(r, 255)) &&
        Array.isArray(p.route) &&
        p.route.length === 3 &&
        p.route.every(
          (m) =>
            m &&
            integer(m.shape, SHAPES.length - 1) &&
            integer(m.x, 7) &&
            integer(m.y, 7) &&
            m.x + SHAPES[m.shape]!.width <= 8 &&
            m.y + SHAPES[m.shape]!.height <= 8,
        ),
    )
  );
}
export const observeForgivingDirector = (
  s: ForgivingDirectorState,
  allClear: boolean,
): ForgivingDirectorState => (allClear ? { ...s, rest: 1, prepared: [] } : s);

export function forgivingDirectorDeal(
  board: Board,
  seed: number,
  moves = 0,
  rhythm: RhythmState = initialRhythmV4(),
  saved = initialForgivingDirector(),
  budget = 24000,
) {
  const meter = new WorkBudget(budget),
    rows = toRows(board),
    count = occupied(rows),
    normal = meter.ceiling;
  let rng = seed >>> 0 || 1;
  const roll = () => {
    const r = random(rng);
    rng = r.state;
    return r.value;
  };
  const phaseRoll = roll(),
    variation = roll(),
    rank = SHAPES.map((_, i) => ({ i, r: roll() }))
      .sort((a, b) => a.r - b.r)
      .map((x) => x.i),
    reverse = roll() > 0.5;
  const initial = legalOperations(rows, meter),
    available = [...new Set(initial.ops.map((o) => o.shape))];
  const cycle = rhythm.cycleMoves ?? moves,
    danger = count >= 28 || (rhythm.dryMoves >= 4 && count >= 18);
  const large = available.some((i) => SHAPES[i]!.cells.length >= 6),
    dueLoad =
      saved.sinceLoad >= saved.nextLoad &&
      large &&
      count <= 26 &&
      moves >= 18 &&
      cycle >= 6;
  const requested: ForgivingKind = rhythm.recoveryDeals
    ? "recovery"
    : saved.rest
      ? "rest"
      : saved.last === "load"
        ? "relief"
        : dueLoad
          ? "load"
          : saved.prepared.length && cycle >= 6
            ? "gift"
            : moves < 6
              ? "gentle"
              : count > 0 && cycle >= 9 && phaseRoll < 0.65
                ? "gift"
                : danger
                  ? "relief"
                  : variation < 0.22
                    ? "friendly"
                    : "build";
  const soft = requested !== "load" && requested !== "build",
    support = ["gift", "relief", "recovery"].includes(requested);
  const maxSize =
    requested === "rest" || requested === "friendly"
      ? 4
      : support
        ? 6
        : moves < 12
          ? 6
          : 9;
  const secondLarge =
    requested === "load" && moves >= 48 && count <= 24 && variation < 0.65;
  const bag = (p: Operation[]) =>
    p
      .map((o) => SHAPES[o.shape]!.family)
      .sort()
      .join(",");
  const score = (node: DirectorNode, depth: number) => {
    const g = boardGeometry(node.rows),
      fresh =
        depth === 2
          ? (rhythm.recentBags ?? []).includes(bag(node.path))
            ? -60
            : 35
          : 0;
    const variety =
      depth === 2 &&
      new Set(node.path.map((o) => SHAPES[o.shape]!.family)).size >= 2
        ? 35
        : 0;
    if (requested === "load")
      return (
        g.occupied * 3 -
        node.lines * 8 -
        g.holes * 25 -
        g.edges +
        fresh +
        variety
      );
    let columns = 0;
    for (const r of node.rows) columns |= r;
    const spread = Math.min(
      node.rows.filter(Boolean).length,
      Array.from({ length: 8 }, (_, x) =>
        Number(!!(columns & (1 << x))),
      ).reduce((a, b) => a + b, 0),
    );
    return (
      node.clears *
        (requested === "gift" ? 8000 : requested === "gentle" ? 1000 : 0) +
      node.lines * (support ? 500 : 240) +
      node.path.reduce((n, o) => n + SHAPES[o.shape]!.cells.length, 0) *
        (support ? 0 : 10) +
      g.fullness * 0.7 -
      g.holes * 60 -
      g.edges * 2 -
      g.occupied * (support ? 4 : 2) -
      spread * (support ? 80 : 24) +
      fresh +
      variety
    );
  };
  type Candidate = {
    path: Operation[];
    value: number;
    goal: boolean;
    source: string;
    setup?: RewardSetup;
  };
  type Assessed = {
    candidate: Candidate;
    assessment: Robustness;
    prepared?: RewardSetup[];
  };
  const candidates: Candidate[] = [],
    safe: Assessed[] = [];
  let rejected = 0,
    goalConstructed = false,
    planStatus: "none" | "matched" | "replanned" | "lost" = "none";
  function allowance<T>(work: number, fn: () => T): T {
    const cap = meter.ceiling;
    meter.ceiling = Math.min(cap, meter.used + Math.max(0, work));
    try {
      return fn();
    } finally {
      meter.ceiling = cap;
    }
  }
  function validRoute(start: Rows, path: Operation[], reward = false) {
    let b = start,
      earned = false;
    for (const op of path) {
      if (!canPlace(b, op, meter)) return false;
      const n = transition(b, op, meter);
      if (!n) return false;
      b = n.rows;
      earned ||= n.clear;
    }
    return path.length === 3 && (!reward || earned);
  }
  function pad(start: Rows, prefix: Operation[]): Operation[] | null {
    let b = start;
    const path = [...prefix];
    for (const op of prefix) {
      const n = transition(b, op, meter);
      if (!n) return null;
      b = n.rows;
    }
    for (let i = path.length; i < 3; i++) {
      const pool = rank.filter((id) => SHAPES[id]!.cells.length <= 2);
      const id = pool[(i - prefix.length) % pool.length]!,
        p = proveIds(b, [id], meter);
      if (!p.path) return null;
      const op = p.path[0]!,
        n = transition(b, op, meter);
      if (!n) return null;
      path.push(op);
      b = n.rows;
    }
    return path;
  }
  function rewardPath(start: Rows, work: number) {
    return allowance(work, () => {
      const prefix = shortReward(start, meter, rank);
      return prefix ? pad(start, prefix) : null;
    });
  }
  // Leave room for a separately verified small-piece fallback. No rejected
  // candidate is relabelled as help when the main allowance is exhausted.
  const reserve = Math.min(5500, Math.max(0, normal - meter.used));
  meter.ceiling = Math.max(meter.used, normal - reserve);
  if (requested === "gift" && count) {
    for (const p of saved.prepared) {
      if (p.rows.join() !== rows.join()) continue;
      const path = p.route.map(
        (m) => catalog()[m.shape]!.find((op) => op.x === m.x && op.y === m.y)!,
      );
      if (validRoute(rows, path, true)) {
        candidates.push({
          path,
          value: 100000,
          goal: true,
          source: "prepared-payoff",
        });
        planStatus = "matched";
        break;
      }
    }
    if (!candidates.length) {
      const path = rewardPath(rows, 2600);
      if (path) {
        candidates.push({
          path,
          value: 100000,
          goal: true,
          source: "short-payoff",
        });
        planStatus = saved.prepared.length ? "replanned" : "none";
      } else if (saved.prepared.length) planStatus = "lost";
    }
    goalConstructed = candidates.length > 0;
    if (!candidates.length) {
      // Construct the preparation itself, not just a counter asking to try
      // again. The two trays have a complete route within this same meter.
      const route = allowance(4200, () => shortReward(rows, meter, rank, 6, 4));
      if (route) {
        const path = route.slice(0, 3);
        let after = rows;
        for (const op of path) {
          const n = transition(after, op, meter);
          if (!n) break;
          after = n.rows;
        }
        const payoff = pad(after, route.slice(3));
        if (payoff)
          candidates.push({
            path,
            value: 50000,
            goal: false,
            source: "constructed-setup",
            setup: {
              rows: after,
              route: payoff.map(({ shape, x, y }) => ({ shape, x, y })),
            },
          });
      }
    }
  }
  // Complete paths produced here are incumbents, not claims of forgiveness.
  if (requested === "rest" || requested === "friendly") {
    const pool = available.filter(
      (id) => SHAPES[id]!.cells.length >= 2 && SHAPES[id]!.cells.length <= 4,
    );
    for (let i = 0; i < 3 && pool.length; i++) {
      const ids = Array.from(
          { length: 3 },
          () => pool[Math.floor(roll() * pool.length)]!,
        ),
        p = allowance(500, () => proveIds(rows, ids, meter));
      if (p.path)
        candidates.push({
          path: p.path,
          value: 3 - i,
          goal: false,
          source: "varied-light",
        });
    }
  }
  const frontier =
    requested === "rest" || requested === "friendly"
      ? []
      : directorBeam({
          rows,
          meter,
          rank,
          reverse,
          width: 4,
          work: requested === "gift" ? 6200 : 9000,
          allow: (id, depth) => {
            const n = SHAPES[id]!.cells.length;
            return requested === "load"
              ? depth === 0 || (depth === 2 && secondLarge)
                ? n >= 6
                : n >= 2 && n <= 4
              : n <= maxSize;
          },
          score,
          key: (node) => node.rows.join(",") + ":" + bag(node.path),
        });
  const known = new Set(candidates.map((c) => bag(c.path)));
  for (const node of frontier) {
    const key = bag(node.path);
    if (known.has(key)) continue;
    known.add(key);
    const goal = requested === "gift" && node.clears > 0;
    goalConstructed ||= goal;
    candidates.push({
      path: node.path,
      value: node.value + (goal ? 100000 : 0),
      goal,
      source: goal ? "beam-payoff" : "line-and-space",
    });
    if (known.size >= 6) break;
  }
  candidates.sort((a, b) => b.value - a.value);
  function prepare(c: Candidate, assessment: Robustness, work: number) {
    const plans: RewardSetup[] = [],
      endpoints = new Set<string>();
    return allowance(work, () => {
      for (const root of assessment.roots.slice(0, 2)) {
        const route = root.seconds?.choices[0]?.witness;
        if (!route) continue;
        let b = rows,
          complete = true;
        for (const m of route) {
          const op = catalog()[c.path[m.slot]!.shape]!.find(
              (o) => o.x === m.x && o.y === m.y,
            )!,
            n = transition(b, op, meter);
          if (!n) {
            complete = false;
            break;
          }
          b = n.rows;
        }
        const key = b.join();
        if (!complete || !occupied(b) || endpoints.has(key)) continue;
        endpoints.add(key);
        const path = rewardPath(
          b,
          Math.max(
            0,
            Math.floor((meter.ceiling - meter.used) / (2 - plans.length)),
          ),
        );
        if (path)
          plans.push({
            rows: b,
            route: path.map(({ shape, x, y }) => ({ shape, x, y })),
          });
      }
      return plans;
    });
  }
  function projectedValue(c: Candidate, assessment: Robustness) {
    const routes = assessment.roots
      .flatMap((r) => r.seconds?.choices.map((s) => s.witness) ?? [])
      .filter((r) => !!r);
    if (!routes.length) return c.value;
    let total = 0,
      n = 0;
    for (const route of routes) {
      let b = rows,
        lines = 0,
        complete = true;
      for (const m of route!) {
        const op = catalog()[c.path[m.slot]!.shape]!.find(
            (o) => o.x === m.x && o.y === m.y,
          )!,
          next = transition(b, op, meter);
        if (!next) {
          complete = false;
          break;
        }
        b = next.rows;
        lines += next.lines;
      }
      if (!complete) break;
      const g = boardGeometry(b);
      let cols = 0;
      for (const r of b) cols |= r;
      const spread = Math.min(
        b.filter(Boolean).length,
        Array.from({ length: 8 }, (_, x) => Number(!!(cols & (1 << x)))).reduce(
          (a, b) => a + b,
          0,
        ),
      );
      total +=
        lines * 300 - g.occupied * 4 - g.holes * 50 - g.edges * 2 - spread * 80;
      n++;
    }
    return n ? total / n : c.value;
  }
  for (const c of candidates) {
    const assessment = allowance(c.goal ? 5000 : 2800, () =>
      assessForgivingTrio(rows, c.path, meter, soft, c.goal),
    );
    if (assessment.adequate) {
      const prepared = c.setup
        ? [c.setup]
        : !c.goal && soft && requested !== "rest" && cycle >= 3
          ? prepare(c, assessment, 2200)
          : [];
      safe.push({
        candidate:
          soft && !c.goal ? { ...c, value: projectedValue(c, assessment) } : c,
        assessment,
        prepared,
      });
      if (c.goal || prepared.length) break;
    } else rejected++;
    if (safe.length >= 2 || meter.used >= meter.ceiling) break;
  }
  safe.sort((a, b) => b.candidate.value - a.candidate.value);
  let chosen =
    safe.find((s) => s.candidate.goal) ??
    safe.find((s) => s.prepared?.length) ??
    safe[0] ??
    null;
  // A load is explicitly allowed to require a narrow order. Its complete
  // construction witness remains mandatory; it is never advertised as help.
  if (
    requested === "load" &&
    candidates[0] &&
    (!chosen || chosen.candidate !== candidates[0])
  ) {
    const first = candidates[0];
    const assessment = allowance(1600, () =>
      assessForgivingTrio(rows, first.path, meter, false),
    );
    chosen = { candidate: { ...first, source: "load-order" }, assessment };
  }
  meter.ceiling = normal;
  if (!chosen) {
    const pool = rank.filter(
      (id) =>
        SHAPES[id]!.cells.length <= (support ? 3 : 4) &&
        SHAPES[id]!.cells.length >= 2 &&
        available.includes(id),
    );
    for (let n = 0; n < 4 && pool.length; n++) {
      const ids =
        n === 3
          ? [SHAPES.findIndex((s) => s.id === "S1-0"), ...pool.slice(0, 2)]
          : [
              pool[n % pool.length]!,
              pool[(n + 1) % pool.length]!,
              pool[(n + 2) % pool.length]!,
            ];
      if (ids.length !== 3) continue;
      const p = allowance(400, () => proveIds(rows, ids, meter));
      if (!p.path) continue;
      const assessment = allowance(2800, () =>
        assessForgivingTrio(rows, p.path!, meter, true),
      );
      if (assessment.adequate) {
        chosen = {
          candidate: {
            path: p.path,
            value: 0,
            goal: false,
            source: "verified-support",
          },
          assessment,
        };
        break;
      }
    }
  }
  let actual: ForgivingKind = requested;
  if (!chosen) {
    meter.ceiling = meter.limit;
    const id = SHAPES.findIndex((s) => s.id === "S1-0"),
      path: Operation[] = [];
    let b = rows;
    for (let i = 0; i < 3; i++) {
      const p = proveIds(b, [id], meter);
      if (!p.path) throw Error("Forgiving emergency invariant");
      const op = p.path[0]!,
        n = transition(b, op, meter);
      if (!n) throw Error("Forgiving emergency budget");
      b = n.rows;
      path.push(op);
    }
    chosen = {
      candidate: { path, value: 0, goal: false, source: "bounded-singletons" },
      assessment: {
        adequate: false,
        required: 3,
        safe: 0,
        unknown: 0,
        rewardSafe: 0,
        roots: [],
        secondRequired: 3,
      },
    };
    actual = "emergency";
  } else if (chosen.candidate.source === "verified-support")
    actual =
      requested === "rest"
        ? "rest"
        : requested === "recovery"
          ? "recovery"
          : "relief";
  else if (requested === "gift" && !chosen.candidate.goal) actual = "prepare";

  const prepared = chosen.prepared?.length
    ? chosen.prepared
    : !chosen.candidate.goal &&
        actual !== "rest" &&
        actual !== "emergency" &&
        cycle >= 3
      ? prepare(
          chosen.candidate,
          chosen.assessment,
          Math.min(5200, Math.max(0, normal - meter.used)),
        )
      : [];
  const permutation = [0, 1, 2]
      .map((i) => ({ i, r: roll() }))
      .sort((a, b) => a.r - b.r)
      .map((x) => x.i),
    packaged = packagePath(chosen.candidate.path, permutation);
  const director: ForgivingDirectorState = {
    version: 4,
    deals: Math.min(1000000, saved.deals + 1),
    sinceLoad: actual === "load" ? 0 : Math.min(32, saved.sinceLoad + 1),
    nextLoad: actual === "load" ? 3 + Math.floor(roll() * 3) : saved.nextLoad,
    rest: requested === "rest" ? 0 : saved.rest,
    last: actual,
    prepared,
  };
  return {
    ...packaged,
    rngState: rng,
    fallback: actual === "emergency",
    director,
    diagnostic: {
      requested,
      actual,
      source: chosen.candidate.source,
      checks: meter.used,
      limit: meter.limit,
      goalAttempted: requested === "gift",
      goalConstructed,
      goalFound: chosen.candidate.goal,
      planStatus,
      prepared: prepared.length,
      secondLarge,
      rejected,
      certifiedChoices: safe.length,
      robustness: remapRobustness(chosen.assessment, permutation),
      large: packaged.tray.filter(
        (s) => SHAPES.find((x) => x.id === s.shapeId)!.cells.length >= 6,
      ).length,
    },
  };
}
