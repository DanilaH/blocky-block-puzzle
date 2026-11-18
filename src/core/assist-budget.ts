import { goalDirectorDeal, initialGoalDirector, type GoalDirectorState } from "./goal-director";
import { initialRhythmV4, type RhythmState } from "./rhythm";
import { SHAPES, type Board, type Move, type Slot } from "./rules";
import { WorkBudget, catalog, canPlace, transition, toRows } from "./director-search";

/** One frozen manual candidate. These are hypotheses, not competitor constants. */
export const ASSIST_BUDGET_CONFIG = {
  id: "assist-budget-v1", version: 1, credits: 5, warmDeals: 12,
  minDealGap: 2, sourceCaps: { reward: 5, relief: 2 }, searchPerPlan: 11900,
} as const;
export type AssistSource = "reward" | "relief";
export interface AssistBudget {
  version: 1; configId: "assist-budget-v1"; left: number;
  spent: Record<AssistSource, number>; lastAppliedDeal: number | null;
}
export const freshAssistBudget = (): AssistBudget => ({
  version: 1, configId: ASSIST_BUDGET_CONFIG.id, left: 5,
  spent: {reward: 0, relief: 0}, lastAppliedDeal: null,
});
export function validAssistBudget(b: AssistBudget | undefined): boolean {
  return !!b && b.version === 1 && b.configId === ASSIST_BUDGET_CONFIG.id &&
    Number.isInteger(b.left) && b.left >= 0 && b.left <= 5 && !!b.spent &&
    Number.isInteger(b.spent.reward) && b.spent.reward >= 0 && b.spent.reward <= 5 &&
    Number.isInteger(b.spent.relief) && b.spent.relief >= 0 && b.spent.relief <= 2 &&
    b.left + b.spent.reward + b.spent.relief === 5 &&
    (b.lastAppliedDeal === null ? b.left === 5 :
      Number.isSafeInteger(b.lastAppliedDeal) && b.lastAppliedDeal >= 1 && b.left < 5);
}
export type AssistOutcome = { lines: number; allClears: number };
export interface AssistDecision {
  version: 1; configId: "assist-budget-v1"; source: AssistSource | null;
  reason: "protected-warm" | "protected-recovery" | "load" | "exhausted" | "source-cap" | "cooldown" | "no-improvement" | "selected-extra-reward";
  requested: boolean; attempted: boolean; applied: boolean; before: AssistBudget; after: AssistBudget;
  ordinaryIds: string[]; ordinarySeedAfter: number; alternativeIds?: string[]; alternativeSeedAfter?: number;
  ordinary?: AssistOutcome; alternative?: AssistOutcome;
  work: number; limit: 24000;
}
function outcome(board: Board, tray: Slot[], witness: Move[], meter: WorkBudget): AssistOutcome {
  let rows = toRows(board), lines = 0, allClears = 0;
  const used = new Set<number>();
  for (const m of witness) {
    if (used.has(m.slot)) throw Error("Duplicate candidate witness slot");
    used.add(m.slot);
    const shape = SHAPES.findIndex(s => s.id === tray[m.slot]!.shapeId);
    const op = catalog()[shape]!.find(o => o.x === m.x && o.y === m.y);
    if (!op || canPlace(rows,op,meter) !== true) throw Error("Invalid candidate witness");
    const next = transition(rows,op,meter); if (!next) throw Error("Candidate proof budget");
    rows = next.rows;lines += next.lines;allClears += Number(next.clear);
  }
  if (used.size !== 3) throw Error("Incomplete candidate witness");
  return {lines,allClears};
}

export function budgetDirectorDeal(board: Board, seed: number, moves = 0,
  rhythm: RhythmState = initialRhythmV4(), saved: GoalDirectorState = initialGoalDirector(),
  budget: AssistBudget = freshAssistBudget()) {
  if (!validAssistBudget(budget)) throw Error("Invalid assist budget");
  const protectedReason = rhythm.recoveryDeals > 0 ? "protected-recovery" : saved.deals < ASSIST_BUDGET_CONFIG.warmDeals ? "protected-warm" : null;
  if (protectedReason) {
    const d = goalDirectorDeal(board,seed,moves,rhythm,saved);
    const assistDecision: AssistDecision = {version:1,configId:ASSIST_BUDGET_CONFIG.id,
      source:null,reason:protectedReason,requested:false,attempted:false,applied:false,before:budget,after:budget,
      ordinaryIds:d.tray.map(s=>s.shapeId),ordinarySeedAfter:d.rngState,work:d.diagnostic.checks,limit:24000};
    return {...d,assistBudget:budget,assistDecision};
  }
  const normal = goalDirectorDeal(board,seed,moves,rhythm,saved,ASSIST_BUDGET_CONFIG.searchPerPlan,true);
  const source: AssistSource = normal.diagnostic.requested === "relief" ? "relief" : "reward";
  const index = Math.min(1000000, saved.deals + 1);
  let reason: AssistDecision["reason"] = normal.diagnostic.actual === "load" ? "load" :
    budget.left === 0 ? "exhausted" : budget.spent[source] >= ASSIST_BUDGET_CONFIG.sourceCaps[source] ? "source-cap" :
      budget.lastAppliedDeal !== null && index - budget.lastAppliedDeal < ASSIST_BUDGET_CONFIG.minDealGap ? "cooldown" : "no-improvement";
  const meter = new WorkBudget(24000);meter.ceiling=meter.limit;meter.used=normal.diagnostic.checks;
  let chosen=normal, next=budget, alternativeIds:string[]|undefined;
  let ordinary:AssistOutcome|undefined, alternative:AssistOutcome|undefined, alternativeSeedAfter:number|undefined;
  ordinary=outcome(board,normal.tray,normal.witness,meter);
  if (reason === "no-improvement") {
    const help=goalDirectorDeal(board,seed,moves,rhythm,saved,ASSIST_BUDGET_CONFIG.searchPerPlan);
    meter.used+=help.diagnostic.checks;
    alternativeIds=help.tray.map(s=>s.shapeId);alternativeSeedAfter=help.rngState;
    alternative=outcome(board,help.tray,help.witness,meter);
    const changed=normal.tray.some((s,i)=>s.shapeId!==help.tray[i]!.shapeId);
    if (!help.fallback && changed && (alternative.allClears>ordinary.allClears || alternative.lines>ordinary.lines)) {
      chosen=help;
      next={...budget,left:budget.left-1,lastAppliedDeal:index,spent:{...budget.spent,[source]:budget.spent[source]+1}};
      reason="selected-extra-reward";
    }
  }
  const assistDecision:AssistDecision={version:1,configId:ASSIST_BUDGET_CONFIG.id,source,reason,
    requested:reason!=="load",attempted:!!alternativeIds,applied:next!==budget,before:budget,after:next,ordinaryIds:normal.tray.map(s=>s.shapeId),ordinarySeedAfter:normal.rngState,
    ...(alternativeIds?{alternativeIds,alternativeSeedAfter}:{}),...(ordinary?{ordinary}:{}),...(alternative?{alternative}:{}),work:meter.used,limit:24000};
  return {...chosen,assistBudget:next,assistDecision,
    diagnostic:{...chosen.diagnostic,checks:meter.used,limit:24000}};
}
