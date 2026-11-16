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

import {boardGeometry,finishGoal,decisionCertificate,directorBeam,type DirectorNode as Node,type DecisionCertificate as Certificate} from './director-goal-tools';
export {boardGeometry} from './director-goal-tools';

export function goalDirectorDeal(
  board: Board,
  seed: number,
  moves = 0,
  rhythm: RhythmState = initialRhythmV4(),
  saved = initialGoalDirector(),
  budget = 24000,
  ordinary = false,
  focus?: "chain" | "choice" | "observe",
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
  // Only the separately versioned budget candidate uses this mode. Keep the
  // normal constructive promise, without rearming a free support phase.
  if (ordinary && requested !== "recovery")
    actual = saved.sinceLoad >= 3 && large ? "load" : "prepare";
  const old = meter.ceiling;
  if (
    !ordinary && count &&
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
    const support=!ordinary&&(requested==='payoff'||requested==='relief'||requested==='recovery');
    const positions=new Map<number,number>();
    if(focus&&focus!=="observe")for(const op of initial.ops)positions.set(op.shape,(positions.get(op.shape)??0)+1);
    const maxSize=!ordinary&&requested==='rest'?4:moves<12?6:9;
    const contentSearch=focus&&focus!=="observe"&&moves>=36&&!["rest","recovery"].includes(requested);
    return directorBeam({rows,meter,rank,reverse,
      ...(contentSearch?{key:(node:Node)=>`${node.rows.join()}/${bag(node.path)}`,
        diversity:(node:Node)=>bag(node.path)}:{}),
      allow:(id,depth)=>{
        const size=SHAPES[id]!.cells.length;
        return !(load?(depth===0||depth===2&&saved.deals>=8?size<6:depth===1?size>4:false):size>maxSize);
      },
      score:(node,depth)=>{
        const p=node.path,lines=node.lines,clears=node.clears,g=boardGeometry(node.rows);
        const novelty=depth===2?(history.includes(bag(p))?-100:60):0;
        const variety=depth===2&&new Set(p.map(o=>SHAPES[o.shape]!.family)).size>=2?60:0;
        const preference=focus==="chain"&&p.some(op=>!available.has(op.shape))?80:
          focus==="choice"&&depth===2?Math.max(0,80-p.reduce((n,op)=>n+(positions.get(op.shape)??0),0)):0;
        return preference+(load?g.occupied*4-lines*10-g.holes*20-g.edges*.5:
          clears*(support?8000:2500)+lines*(support?500:180)+g.fullness*1.1-g.edges*2-g.holes*65-Math.abs(g.occupied-(support?0:16))*2+novelty+variety);
      }
    });
  }

  let frontier: Node[] = [];
  if (!path) {
    frontier = beam(actual === "load");
    path = frontier[0]?.path ?? null;
    if (!path && actual === "load") {
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
  const incumbentPath=[...path],incumbentIds=path.map(op=>op.shape).join(",");
  let focused = false, focusAttempted = false;
  if (focus && focus !== "observe" && moves >= 36 && initial.complete &&
      !goalFound && !["rest", "recovery", "emergency"].includes(actual)) {
    const best = frontier[0];
    const pool = frontier.slice(0, 12).filter(n => !!best &&
      n.value >= best.value - 80 && n.clears >= best.clears && n.lines >= best.lines);
    if (focus === "chain") {
      focusAttempted = pool.length > 0;
      const next = pool.find(n => n.path.some(op => !available.has(op.shape)));
      if (next) { path = next.path; focused = true; source = "goal-beam-chain"; }
    } else if (pool.length) {
      focusAttempted = true;
      // Same completed frontier, not another generator. Prefer constrained
      // alternatives but retain the original incumbent on an unknown proof.
      const positions = new Map<number,number>();
      for (const op of initial.ops) positions.set(op.shape,(positions.get(op.shape)??0)+1);
      const constrained = (n:Node) => n.path.reduce((v,op)=>v+(positions.get(op.shape)??0),0);
      pool.sort((a,b)=>constrained(a)-constrained(b)||b.value-a.value);
      meter.ceiling = Math.min(old,meter.used+5000);
      for (const n of pool.slice(0,4)) {
        const proof = decisionCertificate(rows,n.path,meter,"placement");
        if (proof?.kind === "placement") {
          path=n.path;certificate=proof;focused=true;source="goal-beam-choice";break;
        }
        if (meter.used >= meter.ceiling) break;
      }
      meter.ceiling=old;
    }
  }
  if (
    moves >= 12 &&
    actual !== "rest" &&
    actual !== "recovery" &&
    actual !== "emergency"
  ) {
    meter.ceiling = Math.min(old, meter.used + 5000);
    certificate ??= decisionCertificate(rows, path, meter);
    if (!certificate && !goalFound && !focused) {
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
  if(focusAttempted&&focus&&focus!=="observe")
    focused ||= focus==="chain"?path.some(op=>!available.has(op.shape)):certificate?.kind==="placement";
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
    rest: ordinary ? 0 : requested === "rest" ? 0 : saved.rest,
    payoff:
      ordinary ? 0 : actual === "load"
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
    ...(focus ? {focusResult:{requested:focus,attempted:focusAttempted,selected:focused,
      initialPieceIds:permutation.map(i=>SHAPES[incumbentPath[i]!.shape]!.id),
      changedHand:path.map(op=>op.shape).join(",")!==incumbentIds,
      initialComplete:initial.complete,
      initialSlots:initial.complete?path.filter(op=>available.has(op.shape)).length:null,
      initialMoves:initial.complete?path.reduce((n,op)=>n+initial.ops.filter(p=>p.shape===op.shape).length,0):null,
      chain:initial.complete?path.some(op=>!available.has(op.shape)):null,
      certificate}} : {}),
    diagnostic: {
      requested,
      actual,
      source: ordinary ? `ordinary-${source}` : source,
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
