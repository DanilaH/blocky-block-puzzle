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
  compactReward,
  directorBeam,
  type DirectorNode,
} from "./director-goal-tools";
import {
  assessForgivingTrio,
  remapRobustness,
  type Robustness,
} from "./director-robustness";
import { constructRewardCandidates } from "./reward-construction";

export type RewardKind =
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
export interface RewardDirectorState {
  version: 5 | 6;
  deals: number;
  sinceLoad: number;
  nextLoad: number;
  rest: number;
  last: RewardKind;
  prepared: RewardSetup[];
}
export const initialRewardDirector = (
  version: 5 | 6 = 5,
): RewardDirectorState => ({
  version,
  deals: 0,
  sinceLoad: 0,
  nextLoad: 4,
  rest: 0,
  last: "gentle",
  prepared: [],
});
export function validRewardDirector(
  s: RewardDirectorState | undefined,
  version: 5 | 6 = 5,
) {
  const integer = (n: number, max: number) =>
    Number.isInteger(n) && n >= 0 && n <= max;
  return (
    !!s &&
    s.version === version &&
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
    s.prepared.length <= 12 &&
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
export const observeRewardDirector = (
  s: RewardDirectorState,
  allClear: boolean,
): RewardDirectorState => (allClear ? { ...s, rest: 1, prepared: [] } : s);

export function rewardDirectorDeal(
  board: Board,
  seed: number,
  moves = 0,
  rhythm: RhythmState = initialRhythmV4(),
  saved = initialRewardDirector(),
  budget = 24000,
  version: 5 | 6 = 5,
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
  const requested: RewardKind = rhythm.recoveryDeals
    ? "recovery"
    : saved.rest
      ? "rest"
      : saved.prepared.length && cycle >= 6
        ? "gift"
        : saved.last === "load"
          ? "relief"
          : dueLoad
            ? "load"
            : moves < 6
              ? "gentle"
              : count > 0 && cycle >= 9 && phaseRoll < 0.65
                ? "gift"
                : danger
                  ? "relief"
                  : variation < 0.22
                    ? "friendly"
                    : "build";
  const soft = requested !== "load",
    support = ["gift", "relief", "recovery"].includes(requested);
  const maxSize =
    requested === "rest" || requested === "friendly"
      ? 4
      : support
        ? version === 6
          ? 9
          : 6
        : moves < 12
          ? 6
          : 9;
  const secondLarge = requested === "load" && moves >= 36 && count <= 28;
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
      spread * (support ? 650 : 180) +
      fresh +
      variety
    );
  };
  type Candidate = {
    path: Operation[];
    value: number;
    goal: boolean;
    source: string;
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
      const prefix =
        compactReward(start, meter, rank) ?? shortReward(start, meter, rank);
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
  let construction: ReturnType<typeof constructRewardCandidates> = [];
  if (version === 6 && soft && requested !== "rest" && count && cycle >= 3) {
    construction = constructRewardCandidates(rows, meter, rank, reverse);
    for (const c of construction) {
      const goal = requested === "gift" && c.earned;
      candidates.push({
        path: c.path,
        value: goal ? 100000 : 20000 + c.value,
        goal,
        source: "branch-built",
      });
      goalConstructed ||= goal;
    }
  }
  const frontier =
    requested === "rest" || requested === "friendly"
      ? []
      : (version === 6 ? directorBeam : plausibleBeam)({
          rows,
          meter,
          rank,
          reverse,
          width: 3,
          work: version === 6 ? 4000 : 7500,
          allow: (id, depth) => {
            const n = SHAPES[id]!.cells.length;
            return requested === "load"
              ? depth === 0 || (depth === 2 && secondLarge)
                ? n >= 6
                : n >= 2 && n <= 4
              : n <= maxSize;
          },
          score:
            version === 6 && soft
              ? (node, depth) => {
                  const g = boardGeometry(node.rows);
                  return (
                    node.clears * (requested === "gift" ? 8000 : 1000) +
                    node.lines * 500 +
                    g.fullness -
                    g.holes * 65 -
                    g.edges * 2 -
                    g.occupied * 4 +
                    (depth === 2 &&
                    !(rhythm.recentBags ?? []).includes(bag(node.path))
                      ? 60
                      : 0)
                  );
                }
              : score,
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
  const candidateKey = (c: Candidate) =>
    c.path.map((o) => o.shape + ":" + o.x + "," + o.y).join(";");
  const outcomeValues = new Map<string, number>();
  const preparationStats = new Map<
    string,
    { sampled: number; reachable: number; coverage: number }
  >();
  const preparationSamples = new Map<
    string,
    {
      rows: Rows;
      via: { slot: number; x: number; y: number }[];
      earned: boolean;
      route: Operation[] | null;
    }[]
  >();
  const preparations: {
    via: { slot: number; x: number; y: number }[];
    plan: RewardSetup;
  }[] = [];
  function prepare(c: Candidate, assessment: Robustness, work: number) {
    return allowance(work, () => {
      const choices = (b: Rows, slots: number[]) => {
        const options: {
          move: { slot: number; x: number; y: number };
          rows: Rows;
          value: number;
          clear: boolean;
          lines: number;
        }[] = [];
        const seen = new Set<string>();
        for (const slot of slots)
          for (const op of catalog()[c.path[slot]!.shape]!) {
            const key = op.shape + ":" + op.x + "," + op.y;
            if (seen.has(key)) continue;
            seen.add(key);
            const fits = canPlace(b, op, meter);
            if (fits === null) return null;
            if (!fits) continue;
            const n = transition(b, op, meter);
            if (!n) return null;
            const g = boardGeometry(n.rows);
            options.push({
              move: { slot, x: op.x, y: op.y },
              rows: n.rows,
              clear: n.clear,
              lines: n.lines,
              value: n.lines * 180 - g.holes * 25 - g.edges - g.occupied * 2,
            });
          }
        return options.sort((a, b) => b.value - a.value).slice(0, 3);
      };
      const ends: {
        rows: Rows;
        via: { slot: number; x: number; y: number }[];
        earned: boolean;
        lines?: number;
      }[] = [];
      // Every sampled final placement is evaluated, rather than the solver's
      // first legal witness. The sample is board-only and never reads players.
      for (const root of assessment.roots.slice(0, 3))
        for (const second of root.seconds?.choices.slice(0, 3) ?? []) {
          let b = rows,
            earned = false,
            lines = 0;
          for (const m of [root.move, second.move]) {
            const op = catalog()[c.path[m.slot]!.shape]!.find(
              (o) => o.x === m.x && o.y === m.y,
            )!;
            const n = transition(b, op, meter);
            if (!n) return [];
            b = n.rows;
            earned ||= n.clear;
            lines += n.lines;
          }
          const left = [0, 1, 2].filter(
            (i) => i !== root.move.slot && i !== second.move.slot,
          );
          const last = choices(b, left);
          if (!last) return [];
          for (const option of last)
            ends.push({
              rows: option.rows,
              via: [root.move, second.move, option.move],
              earned: earned || option.clear,
              ...(version === 6 ? { lines: lines + option.lines } : {}),
            });
        }
      const unique = [...new Map(ends.map((e) => [e.rows.join(), e])).values()];
      const plans: RewardSetup[] = [],
        samples: {
          rows: Rows;
          via: { slot: number; x: number; y: number }[];
          earned: boolean;
          route: Operation[] | null;
        }[] = [];
      let successes = 0,
        totalValue = 0;
      for (let i = 0; i < unique.length; i++) {
        const e = unique[i]!;
        const g = boardGeometry(e.rows);
        let cols = 0;
        for (const r of e.rows) cols |= r;
        const span = Math.min(
          e.rows.filter(Boolean).length,
          Array.from({ length: 8 }, (_, x) =>
            Number(!!(cols & (1 << x))),
          ).reduce((a, b) => a + b, 0),
        );
        totalValue +=
          (version === 6 ? (e.lines ?? 0) * 500 : 0) +
          (e.earned ? 8000 : 0) -
          (span * 8 - g.occupied) * 80 -
          g.holes * 30 -
          g.edges * 2 -
          g.occupied * 2;
        if (e.earned) {
          successes++;
          samples.push({ ...e, route: null });
          continue;
        }
        const path = allowance(
          Math.min(
            550,
            Math.floor((meter.ceiling - meter.used) / (unique.length - i)),
          ),
          () => {
            const reward = compactReward(e.rows, meter, rank);
            return reward ? pad(e.rows, reward) : null;
          },
        );
        samples.push({ ...e, route: path });
        if (path) {
          successes++;
          const plan = {
            rows: e.rows,
            route: path.map(({ shape, x, y }) => ({ shape, x, y })),
          };
          if (plans.length < 12) {
            plans.push(plan);
            preparations.push({ via: e.via, plan });
          }
        }
      }
      const coverage = unique.length ? successes / unique.length : 0;
      preparationSamples.set(candidateKey(c), samples);
      preparationStats.set(candidateKey(c), {
        sampled: unique.length,
        reachable: successes,
        coverage,
      });
      if (unique.length)
        outcomeValues.set(
          candidateKey(c),
          totalValue / unique.length + coverage * 5000,
        );
      // A narrow endpoint is neither stored nor advertised as preparation.
      return unique.length >= 3 && successes / unique.length >= 0.6
        ? plans
        : [];
    });
  }
  function projectedValue(c: Candidate, assessment: Robustness) {
    if (outcomeValues.has(candidateKey(c)))
      return outcomeValues.get(candidateKey(c))!;
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
      const prepared =
        !c.goal && soft && requested !== "rest" && cycle >= 3
          ? prepare(c, assessment, 5500)
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
  let actual: RewardKind = requested;
  if (!chosen) {
    meter.ceiling = meter.limit;
    const id = SHAPES.findIndex((s) => s.id === "S1-0"),
      path: Operation[] = [];
    let b = rows;
    for (let i = 0; i < 3; i++) {
      const p = proveIds(b, [id], meter);
      if (!p.path) throw Error("Reward emergency invariant");
      const op = p.path[0]!,
        n = transition(b, op, meter);
      if (!n) throw Error("Reward emergency budget");
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
  const director: RewardDirectorState = {
    version,
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
      ...(version === 6 ? { construction } : {}),
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
      preparationCoverage:
        preparationStats.get(candidateKey(chosen.candidate)) ?? null,
      preparationSamples: (
        preparationSamples.get(candidateKey(chosen.candidate)) ?? []
      ).map((s) => ({
        ...s,
        via: s.via.map((m) => ({ ...m, slot: permutation.indexOf(m.slot) })),
      })),
      preparations: preparations
        .filter((p) => prepared.includes(p.plan))
        .map((p) => ({
          ...p,
          via: p.via.map((m) => ({ ...m, slot: permutation.indexOf(m.slot) })),
        })),
      large: packaged.tray.filter(
        (s) => SHAPES.find((x) => x.id === s.shapeId)!.cells.length >= 6,
      ).length,
    },
  };
}

/** Construct with ordinary, locally attractive placements. An ideal endpoint
 * reached through unattractive intermediate moves is a poor preparation. */
function plausibleBeam(options: Parameters<typeof directorBeam>[0]) {
  const {
    rows,
    meter,
    rank,
    reverse,
    allow,
    score,
    width = 3,
    work = 7500,
    key,
  } = options;
  const end = Math.min(meter.ceiling, meter.used + work);
  let current: DirectorNode[] = [
      { rows, path: [], lines: 0, clears: 0, value: 0 },
    ],
    final: DirectorNode[] = [];
  for (let depth = 0; depth < 3; depth++) {
    const depthEnd = meter.used + Math.floor((end - meter.used) / (3 - depth));
    const children = new Map<string, DirectorNode>();
    for (let pi = 0; pi < current.length; pi++) {
      const parent = current[pi]!,
        cap = meter.ceiling;
      meter.ceiling = Math.min(
        cap,
        meter.used +
          Math.floor((depthEnd - meter.used) / (current.length - pi)),
      );
      for (const id of rank) {
        if (!allow(id, depth)) continue;
        const moves: { node: DirectorNode; local: number }[] = [];
        let complete = true;
        const ops = catalog()[id]!;
        for (let i = 0; i < ops.length; i++) {
          const op = ops[reverse ? ops.length - 1 - i : i]!,
            fits = canPlace(parent.rows, op, meter);
          if (fits === null) {
            complete = false;
            break;
          }
          if (!fits) continue;
          const next = transition(parent.rows, op, meter);
          if (!next) {
            complete = false;
            break;
          }
          const g = boardGeometry(next.rows);
          const node: DirectorNode = {
            rows: next.rows,
            path: [...parent.path, op],
            lines: parent.lines + next.lines,
            clears: parent.clears + Number(next.clear),
            value: 0,
          };
          node.value = score(node, depth);
          moves.push({
            node,
            local: next.lines * 180 - g.occupied * 2 - g.edges - g.holes * 25,
          });
        }
        if (!complete) break;
        moves.sort((a, b) => b.local - a.local);
        for (const { node } of moves
          .filter((m) => m.local >= (moves[0]?.local ?? 0) - 16)
          .slice(0, 5)) {
          const stateKey = key ? key(node) : node.rows.join();
          if ((children.get(stateKey)?.value ?? -Infinity) < node.value)
            children.set(stateKey, node);
        }
      }
      meter.ceiling = cap;
    }
    const ranked = [...children.values()].sort((a, b) => b.value - a.value);
    if (!ranked.length) break;
    current = ranked.slice(0, width);
    if (depth === 2) final = ranked;
  }
  return final;
}
