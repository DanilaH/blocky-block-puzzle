import { expect, it } from "vitest";
import { createProfile, validProfile } from "../src/core/profile";
import { newGame } from "../src/core/rules";
import { COMPOSITION_EXPERIMENT, ensureExperiment, assignedDealer, enabledDealer } from "../src/core/experiment";
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
