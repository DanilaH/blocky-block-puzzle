import type { Profile } from "./profile";
import type { DealerVersion, GameState } from "./rules";
export const COMPOSITION_EXPERIMENT = { id: "blocky-composition-1", version: 1, enabled: false, candidateEnabled: true, candidateDealer: "composition-v1" as DealerVersion };
export const ASSIST_BUDGET_EXPERIMENT = {...COMPOSITION_EXPERIMENT,id:"blocky-assist-budget-1",candidateDealer:"director-budget-v1" as DealerVersion};
export const CHALLENGE_EXPERIMENT = {...COMPOSITION_EXPERIMENT,id:"blocky-challenge-content-1",version:3,candidateDealer:"director-challenge-v1" as DealerVersion};
export const CHALLENGE_V2_EXPERIMENT = {...COMPOSITION_EXPERIMENT,id:"blocky-challenge-content-2",candidateDealer:"director-challenge-v2" as DealerVersion};
export const CHALLENGE_V3_EXPERIMENT = {...COMPOSITION_EXPERIMENT,id:"blocky-challenge-content-3",candidateDealer:"director-challenge-v3" as DealerVersion};
export interface ExperimentState {
  installationId: string;
  cohort: "new" | "existing";
  manualDealer?: "director-v2" | "composition-v1" | "composition-v2" | "director-budget-v1" | "director-challenge-v1" | "director-challenge-v2" | "director-challenge-v3";
  challengeOpeningHistory?:string[];
  assignment?: { id: string; experimentId: string; configVersion: number; variant: "control" | "candidate"; assignedAt: number; cohort: "new" | "existing" };
}
export function ensureExperiment(p: Profile, now: number, fresh: boolean, installationId: string, config = COMPOSITION_EXPERIMENT): Profile {
  const experiment:ExperimentState = p.experiment ?? { installationId, cohort:fresh?"new":"existing" };
  if (config.enabled && !experiment.assignment && !experiment.manualDealer) {
    let h = 2166136261;
    for (const char of `${config.id}:${experiment.installationId}`) h=Math.imul(h^char.charCodeAt(0),16777619);
    return {...p,experiment:{...experiment,assignment:{id:`${config.id}:${experiment.installationId}`,experimentId:config.id,configVersion:config.version,variant:(h>>>0)%2?"candidate":"control",assignedAt:now,cohort:experiment.cohort}}};
  }
  return p.experiment ? p : {...p,experiment};
}
export function assignedDealer(p:Profile, config=COMPOSITION_EXPERIMENT):DealerVersion {
  if (p.experiment?.manualDealer) return config.candidateEnabled?p.experiment.manualDealer:"director-v2";
  return config.enabled && config.candidateEnabled && p.experiment?.assignment?.experimentId===config.id && p.experiment?.assignment?.configVersion===config.version && p.experiment?.assignment?.variant==="candidate" ? config.candidateDealer : "director-v2";
}
export function enabledDealer(dealer:DealerVersion, config=COMPOSITION_EXPERIMENT):DealerVersion {
  return ["composition-v1","composition-v2","director-budget-v1","director-challenge-v1","director-challenge-v2","director-challenge-v3"].includes(dealer)&&!config.candidateEnabled?"director-v2":dealer;
}
export function validExperiment(e:ExperimentState|undefined) {
  if (!e) return true;
  if (typeof e.installationId!=="string"||!e.installationId||e.installationId.length>128||!["new","existing"].includes(e.cohort)|| (e.manualDealer!==undefined&&!["director-v2","composition-v1","composition-v2","director-budget-v1","director-challenge-v1","director-challenge-v2","director-challenge-v3"].includes(e.manualDealer))) return false;
  if(e.challengeOpeningHistory!==undefined&&(!Array.isArray(e.challengeOpeningHistory)||e.challengeOpeningHistory.length>3||e.challengeOpeningHistory.some(k=>typeof k!=="string"||!k||k.length>80)))return false;
  const a=e.assignment;
  return !a || (typeof a.id==="string"&&!!a.id&&typeof a.experimentId==="string"&&!!a.experimentId&&Number.isSafeInteger(a.configVersion)&&a.configVersion>0&&Number.isSafeInteger(a.assignedAt)&&a.assignedAt>=0&&["control","candidate"].includes(a.variant)&&["new","existing"].includes(a.cohort));
}
export function experimentContext(p:Profile):Record<string,string|number|boolean> {
  const a=p.experiment?.assignment;
  return { experimentMode:p.game.comparisonMode??"default", ...(a?{assignmentId:a.id,experimentId:a.experimentId,variantId:a.variant,assignmentVersion:a.configVersion,cohort:a.cohort}:{}), dealerVersion:p.game.dealerVersion, rulesVersion:p.game.rulesVersion??"classic-v1", scoringVersion:p.game.scoringVersion??"classic-v1" };
}

/** Commit the bounded anti-repeat history in the same transaction as a new game. */
export function rememberChallengeOpening(p:Profile,g:GameState):Profile {
  const key=(g.challengeV3State??g.challengeV2State??g.challengeState)?.openingKey;
  if(!p.experiment||!key||!["director-challenge-v1","director-challenge-v2","director-challenge-v3"].includes(g.dealerVersion)||g.moves||g.revision||p.game.gameId===g.gameId)return p;
  return {...p,experiment:{...p.experiment,challengeOpeningHistory:[...(p.experiment.challengeOpeningHistory??[]),key].slice(-3)}};
}
