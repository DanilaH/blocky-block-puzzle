import { expect, it } from "vitest";
import { createProfile, validProfile } from "../src/core/profile";
import { newGame } from "../src/core/rules";
import { COMPOSITION_EXPERIMENT, CHALLENGE_EXPERIMENT, ensureExperiment, assignedDealer, enabledDealer } from "../src/core/experiment";

it('keeps challenge assignment independent of gameplay seeds and holds audience rollout off',()=>{
 const config={...CHALLENGE_EXPERIMENT,enabled:true},counts={control:0,candidate:0};
 expect(CHALLENGE_EXPERIMENT.enabled).toBe(false);
 for(let i=0;i<100;i++){
  const p=createProfile(newGame(i+1,'g','director-v2')),a=ensureExperiment(p,100,true,`challenge-install-${i}`,config);
  const b=ensureExperiment(createProfile(newGame(i+200,'other','director-v2')),900,true,`challenge-install-${i}`,config);
  expect(a.experiment!.assignment!.variant).toBe(b.experiment!.assignment!.variant);expect(a.game).toBe(p.game);
  counts[a.experiment!.assignment!.variant]++;
  expect(assignedDealer(a,config)).toBe(a.experiment!.assignment!.variant==='candidate'?'director-challenge-v1':'director-v2');
  expect(assignedDealer(a,{...config,candidateEnabled:false})).toBe('director-v2');
  expect(ensureExperiment(JSON.parse(JSON.stringify(a)),1000,true,'different',config).experiment).toEqual(a.experiment);
 }
 expect(counts.control).toBeGreaterThan(35);expect(counts.candidate).toBeGreaterThan(35);
});
it("persists assignment independent of game RNG and never silently reassigns on config changes", () => {
  const p=createProfile(newGame(123,"existing")), rng=p.game.rngState;
  const config={...COMPOSITION_EXPERIMENT,enabled:true};
  const a=ensureExperiment(p,100,false,"install",config);
  expect(a.game).toBe(p.game);expect(a.game.rngState).toBe(rng);
  expect(validProfile(a)).toBe(true);
  const loaded=JSON.parse(JSON.stringify(a));
  expect(ensureExperiment(loaded,900,true,"different",{...config,id:"changed",version:2}).experiment).toEqual(a.experiment);
  expect(assignedDealer(a,{...config,candidateEnabled:false})).toBe("director-v2");
  expect(enabledDealer("composition-v1",{...config,candidateEnabled:false})).toBe("director-v2");
  expect(a.experiment!.assignment!.cohort).toBe("existing");
  expect(COMPOSITION_EXPERIMENT.enabled).toBe(false);
});
it("uses both arms and separates manual playtest from audience assignment", () => {
  const config={...COMPOSITION_EXPERIMENT,enabled:true};
  const counts={control:0,candidate:0};
  for(let i=0;i<100;i++) {
    const p=ensureExperiment(createProfile(newGame(1,"g")),100,true,`installation-${i}`,config);
    counts[p.experiment!.assignment!.variant]++;
    p.experiment!.manualDealer="director-v2";
    expect(assignedDealer(p,config)).toBe("director-v2");
  }
  expect(counts.control).toBeGreaterThan(35);expect(counts.candidate).toBeGreaterThan(35);
});
