import {expect, it} from 'vitest';
import {selectRewardFrontier, type RewardCandidate} from '../scripts/director/reward-frontier';
const base: RewardCandidate = {bag:'O3,O3,R6',area:24,lines:3,clears:1,steps:'0:0;1:0;2:1;',occupied:0,value:200};
const other = {...base,bag:'I3,R6,R6',value:201};
it('preserves opening and never changes a nonrepeating original',()=>{
  expect(selectRewardFrontier(base,[other],[base.bag],11)).toBe(base);
  expect(selectRewardFrontier(base,[other],[],30)).toBe(base);
});
it('recovers a different composition only with equal witness rewards and no worse quality',()=>{
  expect(selectRewardFrontier(base,[other],[base.bag],30)).toBe(other);
  for(const changed of [{area:23},{lines:2},{clears:0},{steps:'1:0;0:0;2:1;'}, {occupied:1},{value:199},{value:NaN}])
    expect(selectRewardFrontier(base,[{...other,...changed}],[base.bag],30)).toBe(base);
});
it('falls back for an exhausted archive or an equally repeated alternative',()=>{
  expect(selectRewardFrontier(base,[],[base.bag],30)).toBe(base);
  expect(selectRewardFrontier(base,[other],[base.bag,other.bag],30)).toBe(base);
});
it('is immutable and resolves equal alternatives deterministically',()=>{
  const a={...other,bag:'A'},b={...other,bag:'B'}, archive=[b,a];
  const before=JSON.stringify(archive);
  expect(selectRewardFrontier(base,archive,[base.bag],30)).toBe(a);
  expect(selectRewardFrontier(base,[...archive].reverse(),[base.bag],30)).toBe(a);
  expect(JSON.stringify(archive)).toBe(before);
});
