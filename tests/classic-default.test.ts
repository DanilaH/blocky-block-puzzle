import {expect,it} from 'vitest';
import {newGame} from '../src/core/rules';
import {createProfile,validProfile} from '../src/core/profile';
import {classicNewGameDealer,rememberClassicGame,ensureExperiment,COMPOSITION_EXPERIMENT} from '../src/core/experiment';

it('uses the selected default for a new game without changing an old manual save or assignment',()=>{
 const p=ensureExperiment(createProfile(newGame(92,'old','director-challenge-v1')),100,false,'installation');
 p.experiment!.manualDealer='director-challenge-v1';
 const before=structuredClone(p);
 expect(classicNewGameDealer(p)).toBe('director-challenge-v2');expect(p).toEqual(before);
 expect(classicNewGameDealer(p,{...COMPOSITION_EXPERIMENT,candidateEnabled:false})).toBe('director-v2');
});
it('retains the existing opt-in audience assignment contract when an experiment is explicitly enabled',()=>{
 const config={...COMPOSITION_EXPERIMENT,enabled:true};
 const p=ensureExperiment(createProfile(newGame(93,'old','director-v2')),100,true,'assigned',config);
 expect(classicNewGameDealer(p,config)).toBe(p.experiment!.assignment!.variant==='candidate'?'composition-v1':'director-v2');
});
it('commits initial history, and clears the old manual choice with the next ordinary game only',()=>{
 const p=ensureExperiment(createProfile(newGame(94,'first','director-challenge-v2')),100,true,'installation');
 const first=rememberClassicGame(p,p.game,true);expect(first.experiment!.challengeOpeningHistory).toEqual([p.game.challengeV2State!.openingKey]);
 const old={...first,experiment:{...first.experiment!,manualDealer:'director-challenge-v1' as const}};
 const g={...newGame(95,'next','director-challenge-v2'),comparisonMode:'default' as const};
 const staged=rememberClassicGame(old,g);
 expect(old.experiment.manualDealer).toBe('director-challenge-v1');expect(staged.game).toEqual(old.game);
 const committed={...staged,game:g};expect(committed.experiment!.manualDealer).toBeUndefined();
 expect(committed.experiment!.challengeOpeningHistory).toEqual([first.game.challengeV2State!.openingKey,g.challengeV2State!.openingKey]);expect(validProfile(committed)).toBe(true);
});
it('keeps explicit comparison choice and its opening in the same new-game profile',()=>{
 const p=ensureExperiment(createProfile(newGame(96,'old','director-v2')),100,false,'installation');
 const g={...newGame(97,'comparison','director-challenge-v1'),comparisonMode:'manual' as const};
 const next={...rememberClassicGame(p,g),game:g};
 expect(next.experiment!.manualDealer).toBe('director-challenge-v1');expect(next.experiment!.challengeOpeningHistory).toEqual([g.challengeState!.openingKey]);expect(validProfile(next)).toBe(true);
});
