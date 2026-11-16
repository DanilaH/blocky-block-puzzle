import {
  goalDirectorDeal,
  initialGoalDirector,
  type GoalDirectorState,
} from "./goal-director";
import { challengeOpening } from "./challenge-openings";
import { initialRhythmV4, type RhythmState } from "./rhythm";
import type { Board } from "./rules";

export const CHALLENGE_CONFIG = {
  id: "challenge-content-v1-r3",
  version: 3,
  warmDeals: 12,
  windowDeals: 2,
  gapDeals: 2,
  gapActiveMs: 4000,
} as const;
export type ChallengeVariant = "control" | "starts" | "tasks" | "full";
export type ContentPhase =
  | "WARM"
  | "BUILD"
  | "CHALLENGE"
  | "REWARD"
  | "PRESSURE"
  | "POST_REVIVE";
export type ChallengeObservation = { activeMs: number };
export interface ChallengeState {
  version: 1;
  configId: "challenge-content-v1-r3";
  variant: ChallengeVariant;
  phase: ContentPhase;
  activeMs: number;
  clockKnown: boolean;
  trayStartedMs: number;
  recentTrayMs: number[];
  nextFocus: "chain" | "choice";
  windowEndsAt: number;
  nextWindowAt: number;
  lastBeatMs: number | null;
  openingKey: string | null;
}
export const hasChallengeStarts = (s: ChallengeState) =>
  s.variant === "full" || s.variant === "starts";
const hasTasks = (s: ChallengeState) =>
  s.variant === "full" || s.variant === "tasks";
export const initialChallengeState = (
  variant: ChallengeVariant = "full",
): ChallengeState => ({
  version: 1,
  configId: CHALLENGE_CONFIG.id,
  variant,
  phase: "WARM",
  activeMs: 0,
  clockKnown: false,
  trayStartedMs: 0,
  recentTrayMs: [],
  nextFocus: "chain",
  windowEndsAt: 0,
  nextWindowAt: 13,
  lastBeatMs: null,
  openingKey: null,
});
const natural = (n: unknown, max = 1e12) =>
  Number.isSafeInteger(n) && Number(n) >= 0 && Number(n) <= max;
export function validChallengeState(s: ChallengeState | undefined): boolean {
  return (
    !!s &&
    s.version === 1 &&
    s.configId === CHALLENGE_CONFIG.id &&
    ["control", "starts", "tasks", "full"].includes(s.variant) &&
    [
      "WARM",
      "BUILD",
      "CHALLENGE",
      "REWARD",
      "PRESSURE",
      "POST_REVIVE",
    ].includes(s.phase) &&
    natural(s.activeMs) &&
    typeof s.clockKnown === "boolean" &&
    natural(s.trayStartedMs) &&
    s.trayStartedMs <= s.activeMs &&
    Array.isArray(s.recentTrayMs) &&
    s.recentTrayMs.length <= 8 &&
    s.recentTrayMs.every((n) => natural(n)) &&
    ["chain", "choice"].includes(s.nextFocus) &&
    natural(s.windowEndsAt, 1000010) &&
    natural(s.nextWindowAt, 1000010) &&
    (s.lastBeatMs === null ||
      (natural(s.lastBeatMs) && s.lastBeatMs <= s.activeMs)) &&
    (s.openingKey === null ||
      (typeof s.openingKey === "string" && s.openingKey.length <= 80))
  );
}
export function observeChallenge(
  s: ChallengeState,
  observation: ChallengeObservation | undefined,
  allClear: boolean,
  deals: number,
) {
  const observed =
    observation &&
    natural(observation.activeMs) &&
    observation.activeMs >= s.activeMs;
  const next = {
    ...s,
    ...(observed ? { activeMs: observation.activeMs, clockKnown: true } : {}),
  };
  if (allClear) {
    if (next.windowEndsAt)
      next.nextFocus = next.nextFocus === "chain" ? "choice" : "chain";
    next.nextWindowAt = Math.max(next.nextWindowAt, deals + 2);
    next.windowEndsAt = 0;
    next.lastBeatMs = next.clockKnown ? next.activeMs : null;
  }
  return next;
}
export interface ChallengeDecision {
  configId: "challenge-content-v1-r3";
  variant: ChallengeVariant;
  requestedPhase: ContentPhase;
  selectedPhase: ContentPhase;
  focus: "chain" | "choice" | null;
  attempted: boolean;
  selected: boolean;
  changedHand: boolean;
  initialPieceIds: string[];
  task: "CHAIN" | "CHOICE" | "REWARD_CHOICE" | "ORDER" | "ORDINARY" | "UNKNOWN";
  reason: string;
  activeMs: number;
  clockKnown: boolean;
  recentTrayMs: number[];
  legalFirstMoveCount: number | null;
  initialSlots: number | null;
  certificate: ReturnType<typeof goalDirectorDeal>["diagnostic"]["certificate"];
}

/** A bounded focus window inside the existing goal director. No ad/SDK input. */
export function challengeDirectorDeal(
  board: Board,
  seed: number,
  moves = 0,
  rhythm: RhythmState = initialRhythmV4(),
  saved: GoalDirectorState = initialGoalDirector(),
  state: ChallengeState = initialChallengeState(),
) {
  if (!validChallengeState(state)) throw Error("Invalid content state");
  if (!saved.deals && !moves && hasChallengeStarts(state)) {
    const o = challengeOpening(seed);
    if (board.some((v, i) => v !== o.board[i]))
      throw Error("Starting board mismatch");
    return {
      tray: o.tray,
      witness: o.witness,
      rngState: o.rngState,
      fallback: false,
      openingId: o.openingId,
      director: { ...initialGoalDirector(), deals: 1, payoff: 1 },
      challengeState: { ...state, openingKey: o.key },
      diagnostic: {
        requested: "opening",
        actual: "opening",
        source: `opening-${o.kind}`,
        checks: o.work,
        limit: 512,
        certificate: null,
      },
      challengeDecision: {
        configId: CHALLENGE_CONFIG.id,
        variant: state.variant,
        requestedPhase: "WARM",
        selectedPhase: "WARM",
        focus: null,
        attempted: false,
        selected: false,
        changedHand: false,
        initialPieceIds: o.tray.map((s) => s.shapeId),
        task: o.kind === "space-unlock" ? "CHAIN" : "ORDINARY",
        reason: o.kind,
        activeMs: state.activeMs,
        clockKnown: state.clockKnown,
        recentTrayMs: [],
        legalFirstMoveCount: null,
        initialSlots: null,
        certificate: null,
      } as ChallengeDecision,
    };
  }
  const index = saved.deals + 1,
    protectedWarm = saved.deals < CHALLENGE_CONFIG.warmDeals,
    recovery = rhythm.recoveryDeals > 0;
  let next = { ...state, recentTrayMs: [...state.recentTrayMs] },
    focus: "chain" | "choice" | null = null;
  if (next.windowEndsAt && index > next.windowEndsAt) {
    next.nextFocus = next.nextFocus === "chain" ? "choice" : "chain";
    next.nextWindowAt = Math.max(
      next.nextWindowAt,
      next.windowEndsAt + CHALLENGE_CONFIG.gapDeals,
    );
    next.windowEndsAt = 0;
  }
  const rewardWindow = !!(saved.rest || saved.payoff);
  const gapReady =
    state.lastBeatMs === null ||
    !state.clockKnown ||
    state.activeMs - state.lastBeatMs >= CHALLENGE_CONFIG.gapActiveMs;
  if (
    hasTasks(state) &&
    !protectedWarm &&
    !recovery &&
    !saved.rest &&
    index >= next.nextWindowAt &&
    gapReady
  ) {
    if (!next.windowEndsAt || index > next.windowEndsAt)
      next.windowEndsAt = index + CHALLENGE_CONFIG.windowDeals - 1;
    focus = next.nextFocus;
  }
  const d = goalDirectorDeal(
    board,
    seed,
    moves,
    rhythm,
    saved,
    24000,
    false,
    focus ?? "observe",
  );
  const q = d.focusResult!,
    certificate = d.diagnostic.certificate;
  const task: ChallengeDecision["task"] = !q.initialComplete
    ? "UNKNOWN"
    : q.chain
      ? "CHAIN"
      : certificate?.kind === "placement"
        ? "CHOICE"
        : certificate?.kind === "reward-choice"
          ? "REWARD_CHOICE"
          : certificate?.kind === "slot-order"
            ? "ORDER"
            : "ORDINARY";
  if (focus && (q.selected || index >= next.windowEndsAt)) {
    next.nextFocus = focus === "chain" ? "choice" : "chain";
    next.windowEndsAt = 0;
    next.nextWindowAt = index + CHALLENGE_CONFIG.gapDeals;
    if (q.selected) next.lastBeatMs = next.clockKnown ? next.activeMs : null;
  }
  const phase: ContentPhase = recovery
    ? "POST_REVIVE"
    : protectedWarm
      ? "WARM"
      : task === "CHAIN" || task === "CHOICE"
        ? "CHALLENGE"
        : d.diagnostic.actual === "load"
          ? "PRESSURE"
          : rewardWindow || d.diagnostic.goalFound
            ? "REWARD"
            : "BUILD";
  const duration = next.activeMs - next.trayStartedMs;
  if (next.clockKnown && duration > 0)
    next.recentTrayMs = [...next.recentTrayMs, duration].slice(-8);
  next.trayStartedMs = next.activeMs;
  next.phase = phase;
  const decision: ChallengeDecision = {
    configId: CHALLENGE_CONFIG.id,
    variant: state.variant,
    requestedPhase: recovery
      ? "POST_REVIVE"
      : protectedWarm
        ? "WARM"
        : focus
          ? "CHALLENGE"
          : rewardWindow
            ? "REWARD"
            : "BUILD",
    selectedPhase: phase,
    focus,
    attempted: q.attempted,
    selected: q.selected,
    changedHand: q.changedHand,
    initialPieceIds: q.initialPieceIds,
    task,
    reason: recovery
      ? "protected-recovery"
      : protectedWarm
        ? "protected-warm"
        : !hasTasks(state)
          ? "ablation-no-tasks"
          : q.selected
            ? q.changedHand
              ? "selected-content"
              : "target-already-present"
            : focus
              ? q.attempted
                ? "target-not-certified"
                : "existing-reward-priority"
              : "cooldown-or-reward",
    activeMs: next.activeMs,
    clockKnown: next.clockKnown,
    recentTrayMs: next.recentTrayMs,
    legalFirstMoveCount: q.initialMoves,
    initialSlots: q.initialSlots,
    certificate,
  };
  return { ...d, challengeState: next, challengeDecision: decision };
}
