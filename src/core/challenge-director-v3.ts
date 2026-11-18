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
import { opportunityGoalDeal, type VerifiedAdmission } from "./verified-goal";
import type { goalDirectorDeal } from "./goal-director";

export const CHALLENGE_V3_CONFIG = {
  ...CHALLENGE_CONFIG,
  id: "challenge-content-v3",
  version: 1,
} as const;
export type ChallengeStateV3 = Omit<ChallengeState, "configId"> & {
  configId: "challenge-content-v3";
};
export type ChallengeDecisionV3 = Omit<ChallengeDecision, "configId"> & {
  configId: "challenge-content-v3";
  admission: VerifiedAdmission | null;
};
const windowState = (s: ChallengeStateV3): ChallengeState => ({
  ...s,
  configId: CHALLENGE_CONFIG.id,
});
export const initialChallengeStateV3 = (
  variant: ChallengeVariant = "full",
): ChallengeStateV3 => ({
  ...initialChallengeState(variant),
  configId: CHALLENGE_V3_CONFIG.id,
});
export const validChallengeStateV3 = (s: ChallengeStateV3 | undefined) =>
  !!s &&
  s.configId === CHALLENGE_V3_CONFIG.id &&
  validChallengeState(windowState(s));
export const observeChallengeV3 = (
  s: ChallengeStateV3,
  observation: ChallengeObservation | undefined,
  allClear: boolean,
  deals: number,
): ChallengeStateV3 => ({
  ...observeChallenge(windowState(s), observation, allClear, deals),
  configId: CHALLENGE_V3_CONFIG.id,
});

/** Reuse the frozen window protocol; the new policy changes admission only. */
export function challengeDirectorDealV3(
  board: Parameters<typeof challengeDirectorDeal>[0],
  seed: number,
  moves = 0,
  rhythm?: Parameters<typeof challengeDirectorDeal>[3],
  saved?: Parameters<typeof challengeDirectorDeal>[4],
  state = initialChallengeStateV3(),
) {
  if (!validChallengeStateV3(state)) throw Error("Invalid challenge-v3 state");
  let admission: VerifiedAdmission | null = null;
  const generate: typeof goalDirectorDeal = (...args) => {
    const d = opportunityGoalDeal(...args);
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
    challengeV3State: {
      ...challengeState,
      configId: CHALLENGE_V3_CONFIG.id,
    } as ChallengeStateV3,
    challengeDecision: {
      ...d.challengeDecision,
      configId: CHALLENGE_V3_CONFIG.id,
      admission,
    } as ChallengeDecisionV3,
  };
}
