"""Public-action accounting: keep a found route separate from an earned reward."""
import gzip,json,pathlib,hashlib
root=pathlib.Path('docs/qa/director-constructive')
raw=(root/'results.json.gz').read_bytes();data=json.loads(gzip.decompress(raw))
out={'sourceSha256':hashlib.sha256(raw).hexdigest(),'groups':{},'examples':[]}
for run in data['runs']:
 if run['mode']!='candidate':continue
 key=run['split']+':'+run['style'];group=out['groups'].setdefault(key,dict(offers=0,completed=0,earned=0,firstCertified=0,firstRewardCertified=0,secondCertified=0,preparedOffers=0))
 for deal in run['deals']:
  start=deal['move'];d=deal['diagnostic']
  if not d['goalFound'] or start>=run['moves']:continue
  group['offers']+=1;group['preparedOffers']+=d['planStatus'] in ['matched','replanned']
  earned=any(e[1] for e in run['events'][start:start+3]);group['earned']+=earned
  if start+3>run['moves']:continue
  group['completed']+=1
  a=run['actions'][start];b=run['actions'][start+1]
  same=lambda m,a: [m['slot'],m['x'],m['y']]==a
  rootproof=next((r for r in d['robustness']['roots'] if same(r['move'],a)),None)
  group['firstCertified']+=rootproof is not None
  group['firstRewardCertified']+=bool(rootproof and rootproof.get('goalStatus')=='found')
  second=next((s for s in (rootproof or {}).get('seconds',{}).get('choices',[]) if same(s['move'],b)),None)
  group['secondCertified']+=second is not None
  if run['style']=='bounded' and not earned and len(out['examples'])<12:
   out['examples'].append(dict(split=run['split'],seed=run['seed'],move=start,board=deal['board'],tray=deal['tray'],source=d['source'],actions=run['actions'][start:start+3],firstCertified=rootproof is not None,firstRewardCertified=bool(rootproof and rootproof.get('goalStatus')=='found'),secondCertified=second is not None,goalWitness=(rootproof or {}).get('goalWitness')))
(root/'payoffs.json').write_text(json.dumps(out,indent=2)+'\n')
print(json.dumps(out['groups']))
