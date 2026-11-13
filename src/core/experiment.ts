import type { Profile } from "./profile";
import type { DealerVersion } from "./rules";
export const COMPOSITION_EXPERIMENT = { id: "blocky-composition-1", version: 1, enabled: false, candidateEnabled: true };
export interface ExperimentState {
  installationId: string;
  cohort: "new" | "existing";
  manualDealer?: "director-v2" | "composition-v1";
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
  return config.enabled && config.candidateEnabled && p.experiment?.assignment?.experimentId===config.id && p.experiment?.assignment?.configVersion===config.version && p.experiment?.assignment?.variant==="candidate" ? "composition-v1" : "director-v2";
}
export function enabledDealer(dealer:DealerVersion, config=COMPOSITION_EXPERIMENT):DealerVersion {
  return dealer==="composition-v1"&&!config.candidateEnabled?"director-v2":dealer;
}
export function validExperiment(e:ExperimentState|undefined) {
  if (!e) return true;
  if (typeof e.installationId!=="string"||!e.installationId||e.installationId.length>128||!["new","existing"].includes(e.cohort)|| (e.manualDealer!==undefined&&!["director-v2","composition-v1"].includes(e.manualDealer))) return false;
  const a=e.assignment;
  return !a || (typeof a.id==="string"&&!!a.id&&typeof a.experimentId==="string"&&!!a.experimentId&&Number.isSafeInteger(a.configVersion)&&a.configVersion>0&&Number.isSafeInteger(a.assignedAt)&&a.assignedAt>=0&&["control","candidate"].includes(a.variant)&&["new","existing"].includes(a.cohort));
}
export function experimentContext(p:Profile):Record<string,string|number|boolean> {
  const a=p.experiment?.assignment;
  return { experimentMode:p.game.comparisonMode??"default", ...(a?{assignmentId:a.id,experimentId:a.experimentId,variantId:a.variant,assignmentVersion:a.configVersion,cohort:a.cohort}:{}), dealerVersion:p.game.dealerVersion, rulesVersion:p.game.rulesVersion??"classic-v1", scoringVersion:p.game.scoringVersion??"classic-v1" };
}
