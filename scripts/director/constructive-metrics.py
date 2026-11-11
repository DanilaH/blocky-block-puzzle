"""Independent aggregation from events, no director selection/scoring imports."""
import gzip,json,math,statistics,pathlib,hashlib

root=pathlib.Path('docs/qa/director-constructive')
raw=(root/'results.json.gz').read_bytes()
data=json.loads(gzip.decompress(raw))
def q(values,p):
    a=sorted(values)
    return a[max(0,math.ceil(len(a)*p)-1)] if a else None
def aggregate(rows):
    moves=sum(r['moves'] for r in rows)
    events=[e for r in rows for e in r['events']]
    deals=[d for r in rows for d in r['deals'] if d['move']<r['moves']]
    candidate=rows[0]['mode']=='candidate'
    rewards=[[i+1 for i,e in enumerate(r['events']) if e[0]] for r in rows]
    clears=[[i+1 for i,e in enumerate(r['events']) if e[1]] for r in rows]
    gaps=[b-a for ns in rewards for a,b in zip(ns,ns[1:])]
    broad=[d for d in deals if d['diagnostic'].get('robustness',{}).get('adequate')]
    intro=[d for d in deals if d['move']<18]
    kinds={k:sum(d['diagnostic']['actual']==k for d in deals) for k in sorted(set(d['diagnostic']['actual'] for d in deals))}
    changes=[]
    for r in rows:
        for j,d in enumerate(r['deals']):
            if d['move']>=r['moves']:continue
            end=min(d['move']+3,r['moves']);before=sum(x.bit_count() for x in d['board'])
            changes.append((d['diagnostic']['actual'],r['events'][end-1][2]-before))
    return dict(games=len(rows),moves=moves,ended=sum(r['ended'] for r in rows),censored=sum(r['censored'] for r in rows),
        lengths=[r['moves'] for r in rows],medianLength=statistics.median(r['moves'] for r in rows),
        allClears=sum(e[1] for e in events),allClearsPerMove=sum(e[1] for e in events)/moves,
        gamesClearBy60=sum(bool(ns and ns[0]<=60) for ns in clears),gamesClearAfter12=sum(any(n>12 for n in ns) for ns in clears),
        firstAllClear=[ns[0] if ns else None for ns in clears],lines=sum(e[0] for e in events),linesPerMove=sum(e[0] for e in events)/moves,
        lineGapsP90=q(gaps,.9),initialDry=[ns[0] if ns else r['moves'] for r,ns in zip(rows,rewards)],
        terminalDry=[r['moves']-(ns[-1] if ns else 0) for r,ns in zip(rows,rewards)],
        firstLineBy12=sum(bool(ns and ns[0]<=12) for ns in rewards),earlyDeaths=sum(r['ended'] and r['moves']<9 for r in rows),
        deals=len(deals),broad=len(broad) if candidate else None,broadRate=len(broad)/len(deals) if candidate else None,
        introDeals=len(intro),introBroadRate=sum(d['diagnostic']['robustness']['adequate'] for d in intro)/len(intro) if candidate else None,
        unknownRoots=sum(d['diagnostic'].get('robustness',{}).get('unknown',0) for d in deals),
        emergency=sum(d['diagnostic']['actual']=='emergency' for d in deals),kinds=kinds,
        loadMeanGrowth=statistics.mean(n for k,n in changes if k=='load') if any(k=='load' for k,n in changes) else None,
        reliefMeanGrowth=statistics.mean(n for k,n in changes if k in ('relief','recovery')) if any(k in ('relief','recovery') for k,n in changes) else None,
        goalAttempted=sum(d['diagnostic'].get('goalAttempted',False) for d in deals),
        goalConstructed=sum(d['diagnostic'].get('goalConstructed',False) for d in deals),
        goalFound=sum(d['diagnostic']['goalFound'] for d in deals),
        perturbationBranches=sum(e[3] for e in events),differentChoices=sum(e[4] for e in events))

out={'sourceSha256':hashlib.sha256(raw).hexdigest(),'groups':{},'gates':{}}
for split in ['development','confirmation']:
    groups={}
    for style in ['clear','three','plausible','bounded','lapse']:
        pair={mode:aggregate([r for r in data['runs'] if (r['split'],r['style'],r['mode'])==(split,style,mode)]) for mode in ['baseline','candidate']}
        groups[style]=pair
        b,c=pair['baseline'],pair['candidate']
        c['lineRatioToBaseline']=c['linesPerMove']/b['linesPerMove']
    c=groups['bounded']['candidate'];t=groups['three']['candidate'];l=groups['lapse']['candidate']
    gates={
        'broad':all(v['candidate']['broadRate']>=.9 and v['candidate']['introBroadRate']>=.95 and v['candidate']['emergency']/v['candidate']['deals']<=.05 for v in groups.values()),
        'boundedReward':c['gamesClearBy60']>=4 and c['gamesClearAfter12']>=2,
        'boundedLength':30<=c['medianLength']<=180 and c['ended']>=6,
        'threeReward':.03<=t['allClearsPerMove']<=.09,
        'lapseFinite':l['ended']>=2,
        'linesAndStart':all(v['candidate']['lineRatioToBaseline']>=.8 and v['candidate']['lineGapsP90']<=v['baseline']['lineGapsP90']+2 and v['candidate']['earlyDeaths']==0 and v['candidate']['firstLineBy12']>=7 for v in groups.values())
    }
    out['groups'][split]=groups;out['gates'][split]=gates
out['behaviorAccepted']=all(all(g.values()) for g in out['gates'].values())
times={}
for mode in ['baseline','candidate']:
    a=[r['ms'] for r in data['timing'] if r['mode']==mode]
    times[mode]={'count':len(a),'medianMs':statistics.median(a),'p95Ms':q(a,.95),'maxMs':max(a)}
out['timing']=times
(root/'metrics.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'gates':out['gates'],'accepted':out['behaviorAccepted'],'timing':times},ensure_ascii=False))
