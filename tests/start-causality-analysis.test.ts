import {expect,it} from 'vitest';
// @ts-ignore Offline research module, no production import.
import {pairedStats,analyzeIndependent} from '../scripts/challenge-content/start-causality-analysis.mjs';
it('preserves a constant paired effect and its exact bootstrap interval',()=>{
 const p=pairedStats([5,5,5,5],'constant');expect(p.mean).toBe(5);expect(p.median).toBe(5);expect(p.caseBootstrap95).toEqual([5,5]);expect(p.longer).toBe(4);
});
it('distinguishes zero, positive and negative paired effects reproducibly',()=>{
 const a=pairedStats([-4,0,0,4],'fixed'),b=pairedStats([-4,0,0,4],'fixed');expect(a).toEqual(b);expect(a.mean).toBe(0);expect(a.median).toBe(0);expect([a.shorter,a.same,a.longer]).toEqual([1,2,1]);expect(a.caseBootstrap95[0]).toBeLessThanOrEqual(0);expect(a.caseBootstrap95[1]).toBeGreaterThanOrEqual(0);
 expect(pairedStats(Array(16).fill(0),'zero').caseBootstrap95).toEqual([0,0]);
});
it('does not mutate caller data or confuse an even-sample median with its mean',()=>{
 const x=[-9,2,0,1];const p=pairedStats(x,'median');expect(p.mean).toBe(-1.5);expect(p.median).toBe(.5);expect(x).toEqual([-9,2,0,1]);
});
it('rejects incomplete or nonfinite paired input',()=>{
 expect(()=>pairedStats([])).toThrow();expect(()=>pairedStats([NaN])).toThrow();expect(()=>pairedStats([1], 'bad',0)).toThrow();
});
it('averages stream replications within cases and preserves the direction of a known interaction',()=>{
 const games:any[]=[];
 for(const style of ['clear','lapse'])for(let caseId=1;caseId<=16;caseId++)for(let stream=0;stream<4;stream++)for(let geometry=0;geometry<2;geometry++)for(let tasks=0;tasks<2;tasks++)games.push({style,caseId,stream,geometry,tasks,counter:1,moves:100+caseId+stream*2+geometry*5+tasks*(2+geometry*3),allClears:10,ordinary:20,ended:true,maxWork:100});
 const summary=analyzeIndependent({independent:true,games},1000);
 for(const p of summary.pooled){expect(p.nCaseClusters).toBe(16);expect(p.pairedGames).toBe(64);expect(p.plainTaskEffect.mean).toBe(2);expect(p.authoredTaskEffect.mean).toBe(5);expect(p.differenceInEffects.mean).toBe(3);expect(p.differenceInEffects.n).toBe(16);expect(p.differenceInEffects.caseBootstrap95).toEqual([3,3]);}
});
