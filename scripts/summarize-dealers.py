import json,pathlib,statistics,gzip
root=pathlib.Path('docs/qa/dealer-0.15')
def read(path):
 return path.read_text() if path.exists() else gzip.decompress(path.with_suffix(path.suffix+'.gz').read_bytes()).decode()
def q(a,p):
 a=sorted(a);return a[round((len(a)-1)*p)]
summary={'limit':150,'rules':'grace-v2','games':[],'positions':[]}
for policy in ['initial-v1','solvable-v1','assist-v1']:
 rows=[json.loads(x) for path in [root/f'balance-{policy}.jsonl',root/f'balance-{policy}-greedy.jsonl'] for x in read(path).splitlines()]
 for player in ['random','greedy','beam3']:
  rs=[r for r in rows if r['player']==player];moves=sum(r['moves'] for r in rs);dt=[v for r in rs for v in r['dealMs']]
  assert len(rs)==1000 and {r['seed'] for r in rs}==set(range(1,1001)), (policy,player,'incomplete run')
  families={};sizes={}
  for r in rs:
   for k,v in r['families'].items():families[k]=families.get(k,0)+v
   for k,v in r['sizes'].items():sizes[k]=sizes.get(k,0)+v
  summary['games'].append(dict(policy=policy,player=player,n=len(rs),meanMoves=statistics.mean(r['moves'] for r in rs),medianMoves=q([r['moves'] for r in rs],.5),p90Moves=q([r['moves'] for r in rs],.9),censored=sum(not r['over'] for r in rs),meanScore=statistics.mean(r['score'] for r in rs),clearRate=100*sum(r['clearingMoves'] for r in rs)/moves,meanMaxDry=statistics.mean(r['maxDry'] for r in rs),p90MaxDry=q([r['maxDry'] for r in rs],.9),noClearOpportunityPct=100*sum(r['noClearOptions'] for r in rs)/moves,meanLegalOptions=sum(r['totalOptions'] for r in rs)/moves,fallbacks=sum(r['fallbacks'] for r in rs),refills=sum(r['refills'] for r in rs),refillMsP95=q(dt,.95),refillMsMax=max(dt),families=families,sizes=sizes))
pos=json.loads(read(root/'positions.json'))
for policy in ['initial-v1','solvable-v1','assist-v1']:
 rs=[r for r in pos['rows'] if r['policy']==policy]
 summary['positions'].append(dict(policy=policy,n=len(rs),hasClearPct=100*sum(r['clears']>0 for r in rs)/len(rs),multipleClearingSlotsPct=100*sum(r['clearingSlots']>1 for r in rs)/len(rs),witnessPct=100*sum(r['witnessFound'] for r in rs)/len(rs),meanLegal=statistics.mean(r['legal'] for r in rs),fallbacks=sum(r['fallback'] for r in rs),dealMsP95=q([r['ms'] for r in rs],.95)))
(root/'summary.json').write_text(json.dumps(summary,indent=2))
print(json.dumps(summary,indent=2))
