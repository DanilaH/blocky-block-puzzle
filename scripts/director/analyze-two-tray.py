#!/usr/bin/env python3
"""Recompute published metrics/gates independently of the JavaScript runner."""
import gzip,hashlib,json,math,sys
from pathlib import Path

file=Path(sys.argv[1] if len(sys.argv)>1 else 'docs/qa/director-two-tray/results.json.gz')
data=gzip.decompress(file.read_bytes());r=json.loads(data)
assert r['schema']=='blocky-two-tray-benchmark-v1' and len(r['runs'])==160
for run in r['runs']:
    events=run['events']; assert len(events)==len(run['actions'])==run['moves']
    assert sum(e[0] for e in events)==run['lines']
    assert sum(e[1] for e in events)==run['clears']
    assert sum(e[0]>0 for e in events)==run['rewardMoves']
    line=next((i+1 for i,e in enumerate(events) if e[0]>0),None)
    clear=next((i+1 for i,e in enumerate(events) if e[1]),None)
    assert line==run['firstLine'] and clear==run['firstClear']
    ends=[0]+[i+1 for i,e in enumerate(events) if e[1]]+[run['moves']]
    assert max(b-a for a,b in zip(ends,ends[1:]))==run['maxClearGapIncludingCensoredTail']
    assert run['payoffAchieved']==(run['openingChanged'] and any(e[1] for e in events[3:6]))

def total(rows,key): return sum(row[key] for row in rows)
def ratio(base,next,key,denom):
    return (total(next,key)/total(next,denom))/(total(base,key)/total(base,denom)) if total(base,key) else None

for row in r['summary']:
    selected=[x for x in r['runs'] if x['split']==row['split'] and (row['style']=='all' or x['style']==row['style'])]
    base=[x for x in selected if x['mode']=='baseline'];next=[x for x in selected if x['mode']=='candidate']
    for prefix,rs in [('base',base),('candidate',next)]:
        assert row[prefix+'Games']==len(rs)
        assert row[prefix+'Moves']==total(rs,'moves')
        assert row[prefix+'Clears']==total(rs,'clears')
        assert row[prefix+'EarlyLines']==sum(x['firstLine'] is not None and x['firstLine']<=12 for x in rs)
        assert row[prefix+'EarlyClears']==sum(x['firstClear'] is not None and x['firstClear']<=30 for x in rs)
    for field,key,denom in [('lineRatio','lines','moves'),('clearRatio','clears','moves'),('repeatRatio','repeats','deals')]:
        assert row[field]==ratio(base,next,key,denom)
    assert row['survivedDifference']==total(next,'reachedLimit')-total(base,'reachedLimit')
    assert row['fallbackDifference']==total(next,'fallbacks')-total(base,'fallbacks')
    assert row['completed']==total(next,'payoffCompleted') and row['achieved']==total(next,'payoffAchieved')
    expected=dict(lines=(total(next,'lines')>=total(base,'lines') if row['lineRatio'] is None else row['lineRatio']>=.95),
        clears=(row['candidateClears']>=row['baseClears'] if row['clearRatio'] is None else row['clearRatio']>=.9),
        survival=row['survivedDifference']>=-1,fallback=row['fallbackDifference']<=1,
        firstLine=row['candidateEarlyLines']>=row['baseEarlyLines']-1,
        firstClear=row['candidateEarlyClears']>=row['baseEarlyClears']-1,
        actualPayoff=row['completed']>0 and row['achieved']/row['completed']>=.75)
    assert expected==row['gates']

coverage=[dict(split=split,changedSeeds=len({x['seed'] for x in r['runs'] if x['split']==split and x['mode']=='candidate' and x['openingChanged']})) for split in ['development','confirmation']]
assert coverage==r['coverage']
unique=len({x['openingBag'] for x in r['runs'] if x['mode']=='candidate' and x['openingChanged']})
assert unique==r['uniqueOpenings']
gate=(r['seeds']==8 and r['limit']==180 and all(x['changedSeeds']>=6 for x in coverage) and unique>=8 and
    all(all(x['gates'].values()) for x in r['summary'] if x['style']!='all') and r['timing']['startP95']<=100 and r['timing']['payoffP95']<=60)
assert gate==r['gate']
result=dict(valid=True,metricsRecomputed=True,runs=len(r['runs']),moves=total(r['runs'],'moves'),gate=gate,
    sourceSha256=hashlib.sha256(data).hexdigest(),failedGroups=[dict(split=x['split'],style=x['style'],gates=[k for k,v in x['gates'].items() if not v]) for x in r['summary'] if x['style']!='all' and not all(x['gates'].values())])
Path('docs/qa/director-two-tray/analysis.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result))
