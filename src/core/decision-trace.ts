import type { Board, DealerVersion, GameState, Move, Slot } from "./rules";
import type { ShapeCatalogDecision } from "./reference-shape-dealer";
import type { AssistDecision } from "./assist-budget";
import type { ChallengeDecision } from "./challenge-director";
import type {ChallengeDecisionV2} from './challenge-director-v2';
import type {ChallengeBuildDecision} from './challenge-build-v1';
import type {ChallengeDecisionV3} from './challenge-director-v3';

/** Only opted-in local captures. Not authoritative state or product analytics. */
export type DealInput = {
  board: Board;
  seed: number;
  policy: DealerVersion;
  moves: number;
  previous: string;
  context: Pick<GameState, "rhythm" | "director" | "goalDirector" | "mixedDirector" | "forgivingDirector" | "rewardDirector" | "assistBudget" | "challengeState" | "challengeV2State" | "challengeV3State" | "challengeBuildState">;
};
export type DecisionOutput = {
  tray: Slot[]; rngState: number; fallback: boolean; witness: Move[] | null;
  diagnostic?: { requested: string; actual: string; source: string; checks: number; limit: number; certificate?: { kind: string } | null };
  composition?: { reason: string; checks: number; limit: number; from?: string; to?: string; slot?: number };
  assistDecision?: AssistDecision;
  shapeDecision?: ShapeCatalogDecision;
  challengeDecision?: ChallengeDecision|ChallengeDecisionV2|ChallengeDecisionV3|ChallengeBuildDecision;
};
export type DecisionTrace = {
  schema: 1;
  decisionId: string; gameId: string; revision: number; dealIndex: number;
  input: DealInput;
  configVersion: string;
  seedAfter: number;
  requestedFamily: string; selectedFamily: string; source: string;
  initialPieceIds: string[]; finalPieceIds: string[];
  overrides: { stage: string; reason: string; accepted: boolean; from: string[]; to: string[] }[];
  validation: { kind: "SOLVABLE" | "NOT_CHECKED"; witness: Move[]; work: number; limit: number };
  fallback: boolean;
  certificate: string | null;
  assistance?: AssistDecision;
  catalog?: ShapeCatalogDecision;
  challenge?: ChallengeDecision|ChallengeDecisionV2|ChallengeDecisionV3|ChallengeBuildDecision;
};
export type DecisionSink = (trace: DecisionTrace) => void;

export function decisionKey(value: unknown): string {
  const canonical = (v: any): any => Array.isArray(v) ? v.map(canonical) : v && typeof v === "object"
    ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])])) : v;
  return JSON.stringify(canonical(value));
}

export function finalDecision(gameId: string, revision: number, input: DealInput, d: DecisionOutput): DecisionTrace {
  const finalPieceIds = d.tray.map(s => s.shapeId), initialPieceIds = [...finalPieceIds];
  const q = d.diagnostic, c = d.composition;
  const overrides: DecisionTrace["overrides"] = [];
  if(d.challengeDecision){
    const content=d.challengeDecision;
    initialPieceIds.splice(0,3,...content.initialPieceIds);
    if(content.focus||content.changedHand)overrides.push({stage:content.focus&&content.selected?"challenge-content":"goal-selection",reason:content.reason,accepted:content.changedHand,from:[...initialPieceIds],to:[...finalPieceIds]});
  }
  if (d.assistDecision) {
    initialPieceIds.splice(0,3,...d.assistDecision.ordinaryIds);
    overrides.push({stage:"assist-budget",reason:d.assistDecision.reason,accepted:d.assistDecision.applied,from:[...initialPieceIds],to:[...finalPieceIds]});
  }
  if (q && q.requested !== q.actual)
    overrides.push({ stage: "family", reason: q.source, accepted: true, from: [q.requested], to: [q.actual] });
  if (c) {
    if (c.reason === "equal-area-proven" && c.slot !== undefined && c.from)
      initialPieceIds[c.slot] = c.from;
    overrides.push({ stage: "composition", reason: c.reason, accepted: c.reason === "equal-area-proven", from: [...initialPieceIds], to: [...finalPieceIds] });
  }
  if(d.shapeDecision?.changed)overrides.push({stage:"shape-catalog",reason:d.shapeDecision.reason,accepted:true,from:[...initialPieceIds],to:[...finalPieceIds]});
  if (d.fallback)
    overrides.push({ stage: "technical-fallback", reason: q?.source ?? "bounded-fallback", accepted: true, from: [q?.requested ?? input.policy], to: [...finalPieceIds] });
  return {
    schema: 1, decisionId: `${gameId}:${revision}:deal`, gameId, revision,
    dealIndex: (input.context.goalDirector?.deals ?? Math.floor(input.moves / 3)) + 1,
    input: structuredClone(input), configVersion: d.challengeDecision?`${input.policy}:${d.challengeDecision.configId}:${d.challengeDecision.variant}`:input.policy, seedAfter: d.rngState,
    requestedFamily: q?.requested ?? (c?.reason === "opening-catalog" ? "opening" : input.policy),
    selectedFamily: q?.actual ?? (c?.reason === "opening-catalog" ? "opening" : input.policy),
    source: q?.source ?? c?.reason ?? input.policy,
    initialPieceIds, finalPieceIds, overrides,
    validation: { kind: d.witness ? "SOLVABLE" : "NOT_CHECKED", witness: structuredClone(d.witness ?? []), work: (q?.checks ?? 0) + (c?.checks ?? 0), limit: (q?.limit ?? 0) + (c?.limit ?? 0) },
    fallback: d.fallback, certificate: q?.certificate?.kind ?? null,
    ...(d.assistDecision ? {assistance:structuredClone(d.assistDecision)} : {}),
    ...(d.shapeDecision ? {catalog:structuredClone(d.shapeDecision)} : {}),
    ...(d.challengeDecision ? {challenge:structuredClone(d.challengeDecision)} : {}),
  };
}

/** A failed diagnostic consumer cannot reject or alter an authoritative move. */
export function emitDecision(sink: DecisionSink | undefined, trace: () => DecisionTrace) {
  if (sink) try { sink(trace()); } catch { /* Diagnostics are optional. */ }
}
