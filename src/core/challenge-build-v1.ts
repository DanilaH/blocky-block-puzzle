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
import { sparseBuildGoalDeal, type VerifiedAdmission } from "./verified-goal";
import type { goalDirectorDeal } from "./goal-director";

export const CHALLENGE_BUILD_CONFIG = {
  ...CHALLENGE_CONFIG,
  id: "challenge-build-v1",
  version: 1,
} as const;
export type ChallengeBuildState = Omit<ChallengeState, "configId"> & {
  configId: "challenge-build-v1";
};
export type ChallengeBuildDecision = Omit<ChallengeDecision, "configId"> & {
  configId: "challenge-build-v1";
  admission: VerifiedAdmission | null;
};
const windowState = (s: ChallengeBuildState): ChallengeState => ({
  ...s,
  configId: CHALLENGE_CONFIG.id,
});
export const initialChallengeBuildState = (
  variant: ChallengeVariant = "full",
): ChallengeBuildState => ({
  ...initialChallengeState(variant),
  configId: CHALLENGE_BUILD_CONFIG.id,
});
export const validChallengeBuildState = (s: ChallengeBuildState | undefined) =>
  !!s &&
  s.configId === CHALLENGE_BUILD_CONFIG.id &&
  validChallengeState(windowState(s));
export const observeChallengeBuild = (
  s: ChallengeBuildState,
  observation: ChallengeObservation | undefined,
  allClear: boolean,
  deals: number,
): ChallengeBuildState => ({
  ...observeChallenge(windowState(s), observation, allClear, deals),
  configId: CHALLENGE_BUILD_CONFIG.id,
});

/** Manual candidate: frozen v2 task windows/admission over sparse-board accumulation. */
export function challengeBuildDeal(
  board: Parameters<typeof challengeDirectorDeal>[0],
  seed: number,
  moves = 0,
  rhythm?: Parameters<typeof challengeDirectorDeal>[3],
  saved?: Parameters<typeof challengeDirectorDeal>[4],
  state = initialChallengeBuildState(),
) {
  if (!validChallengeBuildState(state)) throw Error("Invalid challenge-build state");
  let admission: VerifiedAdmission | null = null;
  const generate: typeof goalDirectorDeal = (...args) => {
    const d = sparseBuildGoalDeal(...args);
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
    challengeBuildState: {
      ...challengeState,
      configId: CHALLENGE_BUILD_CONFIG.id,
    } as ChallengeBuildState,
    challengeDecision: {
      ...d.challengeDecision,
      configId: CHALLENGE_BUILD_CONFIG.id,
      admission,
    } as ChallengeBuildDecision,
  };
}
