"""Independent endpoint accounting from recorded public actions and diagnostics."""
import gzip,json,pathlib,hashlib
root=pathlib.Path('docs/qa/director-reward-paths')
raw=(root/'results.json.gz').read_bytes();data=json.loads(gzip.decompress(raw))
out={'sourceSha256':hashlib.sha256(raw).hexdigest(),'groups':{},'examples':[]}
for run in data['runs']:
 if run['mode']!='candidate':continue
 key=run['split']+':'+run['style']
 group=out['groups'].setdefault(key,dict(sampledDeals=0,completedSampledDeals=0,actualEndpointInSample=0,actualEndpointWithRewardProof=0,storedPreparations=0,storedEndpoints=0,matchedPreparedBoard=0,replannedPayoffs=0,lostPayoffs=0,preparedOpportunitySuperseded=0,earnedWithinTwoTrays=0))
 for index,deal in enumerate(run['deals']):
  start=deal['move']
  if start>=run['moves']:continue
  d=deal['diagnostic'];samples=d['preparationSamples'];stored=deal['outputDirector']['prepared']
  following=run['deals'][index+1] if index+1<len(run['deals']) else None
  group['sampledDeals']+=bool(samples)
  group['storedPreparations']+=bool(stored);group['storedEndpoints']+=len(stored)
  saved=deal['input'].get('saved',{}).get('prepared',[])
  if saved:
   group['matchedPreparedBoard']+=d['planStatus']=='matched'
   group['replannedPayoffs']+=d['planStatus']=='replanned'
   group['lostPayoffs']+=d['planStatus']=='lost'
   group['preparedOpportunitySuperseded']+=d['requested']!='gift'
  if stored:group['earnedWithinTwoTrays']+=any(e[1] for e in run['events'][start:min(start+6,run['moves'])])
  if not samples or not following or following['move']!=start+3:continue
  group['completedSampledDeals']+=1
  actual=following['board'];sample=next((s for s in samples if s['rows']==actual),None)
  group['actualEndpointInSample']+=sample is not None
  group['actualEndpointWithRewardProof']+=bool(sample and (sample['earned'] or sample['route']))
  if run['style']=='bounded' and len(out['examples'])<8 and start>=12 and not any(e[1] for e in run['events'][start:min(start+6,run['moves'])]):
   out['examples'].append(dict(split=run['split'],seed=run['seed'],move=start,board=deal['board'],tray=deal['tray'],actions=run['actions'][start:start+3],actualEndpoint=actual,sampleCount=len(samples),actualInSample=sample is not None,coverage=d['preparationCoverage'],stored=stored,followingPhase=following['diagnostic']['actual']))
(root/'outcomes.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'groups':out['groups'],'examples':len(out['examples'])},ensure_ascii=False))
