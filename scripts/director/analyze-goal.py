"""Recompute pilot outcomes directly from moves/events and frozen generation logs."""
import gzip,json,math,hashlib
from pathlib import Path
root=Path('docs/qa/director-goal-cycle')
raw=(root/'results.json.gz').read_bytes();data=json.loads(gzip.decompress(raw))
assert data['schema']=='blocky-goal-cycle-study-v1'
def q(xs,p):return sorted(xs)[math.floor((len(xs)-1)*p)] if xs else None
def total(rs,k):return sum(r[k] for r in rs)
def rate(rs,k):return total(rs,k)/total(rs,'moves')
for r in data['runs']:
    assert len(r['actions'])==len(r['events'])==r['moves']
    assert sum(e[0] for e in r['events'])==r['lines']
    assert sum(e[1] for e in r['events'])==r['clears']
    reward=[i+1 for i,e in enumerate(r['events']) if e[0]]
    clears=[i+1 for i,e in enumerate(r['events']) if e[1]]
    assert (reward[0] if reward else None)==r['firstReward']
    assert (clears[0] if clears else None)==r['firstClear']
    assert (reward[0] if reward else r['moves'])==r['initialDry']
    assert r['moves']-(reward[-1] if reward else 0)==r['terminalDry']
    assert [b-a for a,b in zip(reward,reward[1:])]==r['gaps']
    r['clearGaps']=[b-a for a,b in zip(clears,clears[1:])]
summary=[];failures=[]
for split in ('development','confirmation'):
    for style in ('all','clear','three','plausible'):
        rs=[r for r in data['runs'] if r['split']==split and (style=='all' or r['style']==style)]
        base=[r for r in rs if r['mode']=='baseline'];new=[r for r in rs if r['mode']=='candidate']
        if not base or not new:continue
        post=[d for r in new for d in r['deals'] if 12<=d['move']<r['moves']]
        certificates={k:sum((d['diagnostic']['certificate'] or {}).get('kind')==k for d in post) for k in ('slot-order','placement','reward-choice')}
        bg=q([g for r in base for g in r['gaps']],.9);ng=q([g for r in new for g in r['gaps']],.9)
        line_ratio=rate(new,'lines')/rate(base,'lines') if rate(base,'lines') else None
        clear_ratio=rate(new,'clears')/rate(base,'clears') if rate(base,'clears') else None
        load=sum(d['diagnostic']['actual']=='load' for d in post);emergency=sum(d['diagnostic']['actual']=='emergency' for d in post)
        first_clear30=sum(r['firstClear'] is not None and r['firstClear']<=30 for r in new)
        gates=dict(lines=line_ratio is None or line_ratio>=.85,rewardGap=ng is not None and bg is not None and ng<=bg+3,
          initial=q([r['initialDry'] for r in new],.9)<=12,early=not any(r['ended'] and r['moves']<9 for r in new))
        if style=='all':gates.update(decision=bool(post) and sum(certificates.values())/len(post)>=.15,
          load=bool(post) and load/len(post)>=.10,emergency=bool(post) and emergency/len(post)<=.05)
        if style in ('clear','three'):gates.update(earlyAllClear=first_clear30>=(4 if style=='clear' else 6),
          allClearRate=clear_ratio is None or clear_ratio>=.5)
        if style in ('clear','plausible'):gates['finite']=sum(r['ended'] for r in new)>=(4 if style=='clear' else 6)
        row=dict(split=split,style=style,baseMoves=total(base,'moves'),moves=total(new,'moves'),baseEnded=total(base,'ended'),ended=total(new,'ended'),
          baseCensored=total(base,'censored'),censored=total(new,'censored'),baseLines=total(base,'lines'),lines=total(new,'lines'),lineRatio=line_ratio,
          baseClears=total(base,'clears'),clears=total(new,'clears'),clearRatio=clear_ratio,firstClear30=first_clear30,
          baseRewardGapP90=bg,rewardGapP90=ng,baseInitialP90=q([r['initialDry'] for r in base],.9),initialP90=q([r['initialDry'] for r in new],.9),
          baseTerminalP90=q([r['terminalDry'] for r in base],.9),terminalP90=q([r['terminalDry'] for r in new],.9),
          baseMedianMoves=q([r['moves'] for r in base],.5),medianMoves=q([r['moves'] for r in new],.5),
          postIntro=len(post),certificates=certificates,decisionFraction=sum(certificates.values())/len(post) if post else None,
          loads=load,emergency=emergency,gates=gates)
        summary.append(row)
        failures.extend(dict(split=split,style=style,gate=k) for k,v in gates.items() if not v)
timing={mode:{kind:dict(samples=len(xs:=[t['ms'] for t in data['timing'] if t['mode']==mode and (kind=='all' or t['kind']==kind)]),p95=q(xs,.95),maximum=max(xs) if xs else None)
   for kind in ('all','initial','refill')} for mode in ('baseline','candidate')}
cpu=timing['candidate']['all']['p95']<=60
if not cpu:failures.append(dict(gate='cloudCpu'))
offered=achieved=0;loads=[]
for r in data['runs']:
    if r['mode']!='candidate':continue
    for d in r['deals']:
        m=d['move']
        if m>=r['moves']:continue
        if d['diagnostic']['goalFound']:
            offered+=1;achieved+=any(e[1] for e in r['events'][m:min(m+3,r['moves'])])
        if d['diagnostic']['actual']=='load' and m+3<=r['moves']:
            before=sum(x.bit_count() for x in d['board']);delta=r['events'][m+2][2]-before
            loads.append(dict(split=r['split'],seed=r['seed'],style=r['style'],move=m,delta=delta,
              lines=sum(e[0] for e in r['events'][m:m+3]),clears=sum(e[1] for e in r['events'][m:m+3])))
duplicates=[]
for i,a in enumerate(data['runs']):
    for b in data['runs'][i+1:]:
        if a['seed']==b['seed'] and a['mode']==b['mode'] and a['actions']==b['actions']:duplicates.append([a['seed'],a['mode'],a['style'],b['style']])
complete=len(data['runs'])==96 and data['seeds']==8 and data['limit']==360
result=dict(schema='blocky-goal-cycle-analysis-v1',complete=complete,resultsSha256=hashlib.sha256(raw).hexdigest(),
  behaviorGate=complete and not failures,failures=failures,summary=summary,timing=timing,duplicates=duplicates,
  exactGoals=dict(offered=offered,achieved=achieved,rate=achieved/offered if offered else None),
  actualLoads=dict(completed=len(loads),positive=sum(x['delta']>0 for x in loads),medianDelta=q([x['delta'] for x in loads],.5),details=loads),
  note='Broadened certificates are separate from D72 strict order count. Survivors are capped at360; medians include censored caps. One trajectory supplies correlated events.')
(root/'analysis.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:result[k] for k in ('complete','behaviorGate','failures','timing','exactGoals')}))
for r in summary:
    if r['style']=='all':print(json.dumps(r))
