import { SHAPES } from "./rules";
import { goalDirectorDeal, type GoalRefinement } from "./goal-director";
import {
  decisionCertificate,
  finishGoal,
  type DirectorNode,
  type DecisionCertificate,
} from "./director-goal-tools";
import { transition, occupied, type Operation } from "./director-search";

type Context = Parameters<GoalRefinement["select"]>[0];
type Metrics = { lines: number; clears: number; occupied: number };
export interface VerifiedAdmission {
  version: 1 | 2;
  qualityBand?: "one-line";
  lineAllowance?: 1;
  occupiedAllowance?: 8;
  reason: string;
  pool: number;
  beforeWork: number;
  afterWork: number;
  baselineIds: string[];
  finalIds: string[];
  baseline: Metrics | null;
  accepted: Metrics | null;
  rejectedQuality: number;
  unknownProofs: number;
}
const handKey = (path: Operation[]) =>
  path
    .map((op) => op.shape)
    .sort((a, b) => a - b)
    .join(",");

/** Observe only already expanded nodes; never change the v2 beam's decisions. */
export function verifiedRefinement(
  focus: "chain" | "choice",
  additionalAllowance?: number,
  qualityBand: "strict" | "one-line" = "strict",
): GoalRefinement & { admission: VerifiedAdmission } {
  const pool = new Map<string, DirectorNode>();
  let worstKey = "",
    worstValue = -Infinity;
  const admission: VerifiedAdmission = {
    version: qualityBand === "strict" ? 1 : 2,
    ...(qualityBand === "one-line"
      ? {
          qualityBand: "one-line" as const,
          lineAllowance: 1 as const,
          occupiedAllowance: 8 as const,
        }
      : {}),
    reason: "not-run",
    pool: 0,
    beforeWork: 0,
    afterWork: 0,
    baselineIds: [],
    finalIds: [],
    baseline: null,
    accepted: null,
    rejectedQuality: 0,
    unknownProofs: 0,
  };
  const findWorst = () => {
    worstValue = Infinity;
    for (const [key, node] of pool)
      if (node.value < worstValue) {
        worstValue = node.value;
        worstKey = key;
      }
  };
  const result: GoalRefinement & { admission: VerifiedAdmission } = {
    focus,
    selected: false,
    attempted: false,
    admission,
    completed(node, available) {
      if (
        focus === "chain" &&
        !node.path.some((op) => !available.has(op.shape))
      )
        return;
      const key = handKey(node.path),
        old = pool.get(key);
      if (old) {
        if (node.value > old.value) {
          pool.set(key, node);
          if (key === worstKey) findWorst();
        }
        return;
      }
      if (pool.size < 64) {
        pool.set(key, node);
        findWorst();
        return;
      }
      if (node.value <= worstValue) return;
      pool.delete(worstKey);
      pool.set(key, node);
      findWorst();
    },
    select(c) {
      const { meter } = c,
        cap = meter.ceiling,
        baselineKey = handKey(c.path);
      admission.pool = pool.size;
      admission.beforeWork = meter.used;
      admission.afterWork = meter.used;
      if (
        !c.initialComplete ||
        ["rest", "recovery", "emergency"].includes(c.actual)
      ) {
        admission.reason = "protected-or-unknown";
        return null;
      }
      if (
        c.path.some((op) => !c.available.has(op.shape)) ||
        c.certificate?.kind === "placement"
      ) {
        result.selected = true;
        admission.reason = "baseline-already-task";
        return null;
      }
      result.attempted = true;
      if (focus === "chain" && c.available.size === SHAPES.length) {
        admission.reason = "no-blocked-piece";
        return null;
      }
      meter.ceiling = Math.min(cap, meter.used + (additionalAllowance ?? cap));
      try {
        if (meter.used >= meter.ceiling) {
          admission.reason = "proof-budget";
          return null;
        }
        const baseNode = c.frontier.find((n) => n.path === c.path);
        const measure = (path: Operation[]): Metrics | null => {
          let rows = c.rows,
            lines = 0,
            clears = 0;
          for (const op of path) {
            const n = transition(rows, op, meter);
            if (!n) return null;
            rows = n.rows;
            lines += n.lines;
            clears += Number(n.clear);
          }
          return { lines, clears, occupied: occupied(rows) };
        };
        const baseline = baseNode
          ? {
              lines: baseNode.lines,
              clears: baseNode.clears,
              occupied: occupied(baseNode.rows),
            }
          : measure(c.path);
        admission.baseline = baseline;
        if (!baseline) {
          admission.reason = "proof-budget";
          return null;
        }
        const quality = (m: Metrics) =>
          m.lines >= baseline.lines - (qualityBand === "one-line" ? 1 : 0) &&
          m.clears === baseline.clears &&
          (qualityBand === "strict" || m.occupied <= baseline.occupied + 8);
        const accept = (
          path: Operation[],
          m: Metrics,
          certificate: DecisionCertificate | null,
        ) => {
          result.selected = true;
          admission.reason = "verified-task";
          admission.accepted = m;
          return { path, certificate, source: `verified-${focus}` };
        };
        if (baseNode) {
          c.explore();
          admission.pool = pool.size;
          const positions = new Map<number, number>();
          for (const op of c.initial)
            positions.set(op.shape, (positions.get(op.shape) ?? 0) + 1);
          const candidates = [...pool.values()]
            .filter(
              (n) =>
                handKey(n.path) !== baselineKey &&
                (qualityBand === "one-line" || n.value >= baseNode.value - 80),
            )
            .sort((a, b) =>
              focus === "chain"
                ? b.value - a.value
                : a.path.reduce(
                    (v, o) => v + (positions.get(o.shape) ?? 0),
                    0,
                  ) -
                    b.path.reduce(
                      (v, o) => v + (positions.get(o.shape) ?? 0),
                      0,
                    ) || b.value - a.value,
            );
          const possible = candidates.filter((n) => {
            const ok = quality({
              lines: n.lines,
              clears: n.clears,
              occupied: occupied(n.rows),
            });
            if (!ok) admission.rejectedQuality++;
            return ok;
          });
          if (focus === "chain" && possible.length) {
            const n = possible[0]!;
            return accept(
              n.path,
              { lines: n.lines, clears: n.clears, occupied: occupied(n.rows) },
              null,
            );
          }
          const attempts = possible.slice(0, 4),
            end = Math.min(meter.ceiling, meter.used + 5000);
          for (const [index, n] of attempts.entries()) {
            const previous = meter.ceiling;
            meter.ceiling =
              meter.used +
              Math.floor((end - meter.used) / (attempts.length - index));
            const proof = decisionCertificate(
              c.rows,
              n.path,
              meter,
              "placement",
            );
            const exhausted = meter.used >= meter.ceiling;
            meter.ceiling = previous;
            if (proof?.kind === "placement")
              return accept(
                n.path,
                {
                  lines: n.lines,
                  clears: n.clears,
                  occupied: occupied(n.rows),
                },
                proof,
              );
            admission.unknownProofs += Number(exhausted);
            if (meter.used >= end) break;
          }
        }
        if (c.goalFound && meter.used < meter.ceiling) {
          const end = meter.ceiling,
            seen = new Set<string>();
          let attempts = 0,
            chosen: ReturnType<typeof accept> | null = null;
          meter.ceiling = Math.min(end, meter.used + 6000);
          finishGoal(c.rows, meter, c.rank, undefined, (path) => {
            const key = handKey(path);
            if (key === baselineKey || seen.has(key)) return false;
            seen.add(key);
            if (
              focus === "chain" &&
              !path.some((op) => !c.available.has(op.shape))
            )
              return false;
            const m = measure(path);
            if (!m) return false;
            if (!quality(m)) {
              admission.rejectedQuality++;
              return false;
            }
            if (focus === "chain") {
              chosen = accept(path, m, null);
              return true;
            }
            if (attempts++ >= 2) return false;
            const previous = meter.ceiling;
            meter.ceiling = Math.min(previous, meter.used + 1800);
            const proof = decisionCertificate(c.rows, path, meter, "placement");
            const exhausted = meter.used >= meter.ceiling;
            meter.ceiling = previous;
            if (proof?.kind !== "placement") {
              admission.unknownProofs += Number(exhausted);
              return false;
            }
            chosen = accept(path, m, proof);
            return true;
          });
          meter.ceiling = end;
          if (chosen) return chosen;
        }
        admission.reason =
          meter.used >= meter.ceiling
            ? "proof-budget"
            : admission.rejectedQuality
              ? "quality-or-task-miss"
              : "no-verified-task";
        return null;
      } finally {
        admission.afterWork = meter.used;
        meter.ceiling = cap;
      }
    },
  };
  return result;
}

/** Same v2 incumbent, RNG and controller; only a certified replacement may differ. */
export function verifiedGoalDeal(...args: Parameters<typeof goalDirectorDeal>) {
  return qualityGoalDeal("strict", false, ...args);
}

/** A separately versioned one-line tradeoff; no search or phase changes. */
export function opportunityGoalDeal(
  ...args: Parameters<typeof goalDirectorDeal>
) {
  return qualityGoalDeal("one-line", false, ...args);
}

/** Same verified task admission; only the sparse baseline objective differs. */
export function sparseBuildGoalDeal(...args: Parameters<typeof goalDirectorDeal>) {
  return qualityGoalDeal("strict", true, ...args);
}

function qualityGoalDeal(
  qualityBand: "strict" | "one-line",
  sparseBuild: boolean,
  ...[
    board,
    seed,
    moves = 0,
    rhythm,
    saved,
    budget = 24000,
    ordinary = false,
    focus,
  ]: Parameters<typeof goalDirectorDeal>
) {
  const enabled =
    focus &&
    focus !== "observe" &&
    moves >= 36 &&
    !rhythm?.recoveryDeals &&
    !saved?.rest &&
    !ordinary;
  const refinement = enabled
    ? verifiedRefinement(focus, undefined, qualityBand)
    : undefined;
  const d = goalDirectorDeal(
    board,
    seed,
    moves,
    rhythm,
    saved,
    budget,
    ordinary,
    "observe",
    refinement,
    sparseBuild,
  );
  if (!refinement && d.focusResult) {
    d.focusResult.initialPieceIds = d.tray.map((s) => s.shapeId);
    d.focusResult.changedHand = false;
  }
  if (refinement) {
    refinement.admission.baselineIds = d.focusResult!.initialPieceIds;
    refinement.admission.finalIds = d.tray.map((s) => s.shapeId);
  }
  return Object.assign(d, { admission: refinement?.admission ?? null });
}
