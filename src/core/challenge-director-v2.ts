import {
  challengeDirectorDeal,
  initialChallengeState,
  observeChallenge,
  validChallengeState,
  CHALLENGE_CONFIG,
  type ChallengeState,
  type ChallengeVariant,
  type ChallengeObservation,
  type ChallengeDecision,
} from "./challenge-director";
import { verifiedGoalDeal, type VerifiedAdmission } from "./verified-goal";
import type { goalDirectorDeal } from "./goal-director";

export const CHALLENGE_V2_CONFIG = {
  ...CHALLENGE_CONFIG,
  id: "challenge-content-v2",
  version: 1,
} as const;
export type ChallengeStateV2 = Omit<ChallengeState, "configId"> & {
  configId: "challenge-content-v2";
};
export type ChallengeDecisionV2 = Omit<ChallengeDecision, "configId"> & {
  configId: "challenge-content-v2";
  admission: VerifiedAdmission | null;
};
const windowState = (s: ChallengeStateV2): ChallengeState => ({
  ...s,
  configId: CHALLENGE_CONFIG.id,
});
export const initialChallengeStateV2 = (
  variant: ChallengeVariant = "full",
): ChallengeStateV2 => ({
  ...initialChallengeState(variant),
  configId: CHALLENGE_V2_CONFIG.id,
});
export const validChallengeStateV2 = (s: ChallengeStateV2 | undefined) =>
  !!s &&
  s.configId === CHALLENGE_V2_CONFIG.id &&
  validChallengeState(windowState(s));
export const observeChallengeV2 = (
  s: ChallengeStateV2,
  observation: ChallengeObservation | undefined,
  allClear: boolean,
  deals: number,
): ChallengeStateV2 => ({
  ...observeChallenge(windowState(s), observation, allClear, deals),
  configId: CHALLENGE_V2_CONFIG.id,
});

/** Reuse the frozen window protocol; the new policy changes admission only. */
export function challengeDirectorDealV2(
  board: Parameters<typeof challengeDirectorDeal>[0],
  seed: number,
  moves = 0,
  rhythm?: Parameters<typeof challengeDirectorDeal>[3],
  saved?: Parameters<typeof challengeDirectorDeal>[4],
  state = initialChallengeStateV2(),
) {
  if (!validChallengeStateV2(state)) throw Error("Invalid challenge-v2 state");
  let admission: VerifiedAdmission | null = null;
  const generate: typeof goalDirectorDeal = (...args) => {
    const d = verifiedGoalDeal(...args);
    admission = d.admission;
    return d;
  };
  const { challengeState, ...d } = challengeDirectorDeal(
    board,
    seed,
    moves,
    rhythm,
    saved,
    windowState(state),
    generate,
  );
  return {
    ...d,
    challengeV2State: {
      ...challengeState,
      configId: CHALLENGE_V2_CONFIG.id,
    } as ChallengeStateV2,
    challengeDecision: {
      ...d.challengeDecision,
      configId: CHALLENGE_V2_CONFIG.id,
      admission,
    } as ChallengeDecisionV2,
  };
}
