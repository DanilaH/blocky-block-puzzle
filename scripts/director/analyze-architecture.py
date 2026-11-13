"""Independent descriptive accounting; no human-population or causal inference."""
import collections, gzip, hashlib, json, math, pathlib, statistics

root = pathlib.Path('docs/qa/dealer-architecture')
def read(name):
    raw = (root / name).read_bytes()
    return json.loads(gzip.decompress(raw)), hashlib.sha256(raw).hexdigest()
def q(values, p=.9):
    a = sorted(values)
    return a[max(0, math.ceil(len(a)*p)-1)] if a else None
def med(a): return statistics.median(a) if a else None

out = {'schema': 'blocky-architecture-metrics-v1', 'dataSha256': {}, 'games': {}, 'snapshots': {}, 'branches': {}, 'rewardAblation': {}, 'catalogues': {}, 'identicalPlayerTrajectories': {}}
for catalogue in ['full', 'common']:
    data, sha = read('games-'+catalogue+'.json.gz')
    out['dataSha256']['games-'+catalogue] = sha
    shapes = {s['id']: s for s in data['shapes']}
    groups = collections.defaultdict(list)
    for r in data['runs']:
        assert len(r['events']) == len(r['actions']) == r['moves']
        assert r['ended'] != r['censored']
        groups[(r['split'],r['policy'],r['style'])].append(r)
    for key, runs in groups.items():
        ev = [e for r in runs for e in r['events']]
        deals = [d for r in runs for d in r['deals']]
        droughts, terminal, first, repeats, recent_repeats = [], [], [], 0, 0
        families, areas, sources, death_steps = collections.Counter(), collections.Counter(), collections.Counter(), collections.Counter()
        for r in runs:
            last = 0
            for i,e in enumerate(r['events'],1):
                if e[0]: droughts.append(i-last); last=i
            terminal.append(r['moves']-last)
            first.append(next((i for i,e in enumerate(r['events'],1) if e[0]),None))
            if r['ended']: death_steps[(r['moves']-1)%3+1]+=1
            bags=[]
            for d in r['deals']:
                bag=tuple(sorted(shapes[s['shapeId']]['family'] for s in d['tray']))
                repeats+=bool(bags and bag==bags[-1]); recent_repeats+=bag in bags[-4:]; bags.append(bag)
                sources[(d['diagnostic'] or {}).get('source','flow-beam')]+=1
                for s in d['tray']:
                    shape=shapes[s['shapeId']];families[shape['family']]+=1;areas[len(shape['cells'])]+=1
        ms=[t['ms'] for t in data['timings'] if (t['split'],t['policy'],t['style'])==key]
        result = dict(n=len(runs), moves=len(ev), ended=sum(r['ended'] for r in runs), censored=sum(r['censored'] for r in runs),
            observedMeanMoves=statistics.mean(r['moves'] for r in runs), medianObservedMoves=med([r['moves'] for r in runs]),
            lines=sum(e[0] for e in ev), linesPerMove=sum(e[0] for e in ev)/len(ev),
            multiLineMoves=sum(e[0]>=2 for e in ev), allClears=sum(e[1] for e in ev), allClearPerMove=sum(e[1] for e in ev)/len(ev),
            gamesWithReward=sum(any(e[1] for e in r['events']) for r in runs),
            gamesRewardBy60=sum(any(e[1] for e in r['events'][:60]) for r in runs),
            gamesRewardAfter12=sum(any(e[1] for e in r['events'][12:]) for r in runs),
            completedLineGapP90=q(droughts), terminalDroughtP90=q(terminal), noLineGames=sum(x is None for x in first), firstLineP90=q([x for x in first if x is not None]),
            occupancyMedian=med([e[2] for e in ev]), occupancyP90=q([e[2] for e in ev]),
            fallback=sum(d['fallback'] for d in deals), deals=len(deals),
            adjacentBagRepeats=repeats, recentFourBagRepeats=recent_repeats,
            shapeFamilies=dict(families), shapeAreas=dict(areas), sources=dict(sources), fatalActionWithinTray=dict(death_steps),
            largeShapeShare=sum(n for area,n in areas.items() if area>=6)/sum(areas.values()),
            dealMsMedian=med(ms),dealMsP95=q(ms,.95),dealMsMax=max(ms))
        out['games'][':'.join((catalogue,)+key)]=result
    out['catalogues'][catalogue]={'orientations':len(shapes),'families':len(set(s['family'] for s in shapes.values())),
        'weight':sum(s['weight'] for s in shapes.values()),'randomLargeWeightShare':sum(s['weight'] for s in shapes.values() if len(s['cells'])>=6)/sum(s['weight'] for s in shapes.values())}
    bykey={(r['split'],r['seed'],r['policy'],r['style']):r for r in data['runs']}
    for old,new in [('bounded','bounded-reward'),('three','three-reward'),('clear','space')]:
        pairs=[(r,bykey[(r['split'],r['seed'],r['policy'],new)]) for r in data['runs'] if r['style']==old]
        out['identicalPlayerTrajectories'][catalogue+':'+old+':'+new]={'pairs':len(pairs),'identical':sum(a['actions']==b['actions'] for a,b in pairs)}

data,sha=read('snapshots.json.gz');out['dataSha256']['snapshots']=sha
groups=collections.defaultdict(list)
for r in data['results']:
    key=r['catalogue']+':'+r['policy'];groups[key].append(r)
for key,rows in groups.items():
    for style in sorted(set(p['style'] for r in rows for p in r['plays'])):
        plays=[p for r in rows for p in r['plays'] if p['style']==style]
        out['snapshots'][key+':'+style]=dict(plays=len(plays),completed=sum(p['completed'] for p in plays),
            rewards=sum(p['earned'] for p in plays),lines=sum(p['lines'] for p in plays),
            occupiedMean=statistics.mean(sum(x.bit_count() for x in p['endpoint']) for p in plays))
    roots=[b for r in rows for b in r['branches']];seconds=[s for b in roots for s in b['seconds']]
    out['branches'][key]=dict(roots=len(roots),rootStatus=dict(collections.Counter(b['status'] for b in roots)),
        seconds=len(seconds),secondStatus=dict(collections.Counter(b['status'] for b in seconds)),
        sampledRewardRoots=sum(any(s['rewardFound'] for s in b['seconds']) for b in roots),
        fallback=sum(r['fallback'] for r in rows))
for style in ['bounded','three']:
    rows=[r for r in data['shortRewards'] if r['style']==style]
    out['rewardAblation'][style]=dict(trays=len(rows),original=sum(r['original']['earned'] for r in rows),
        aware=sum(r['aware']['earned'] for r in rows),recovered=sum(not r['original']['earned'] and r['aware']['earned'] for r in rows),
        lost=sum(r['original']['earned'] and not r['aware']['earned'] for r in rows))
out['totals']={'games':sum(g['n'] for g in out['games'].values()),'moves':sum(g['moves'] for g in out['games'].values()),
    'snapshots':len(data['selected']),'nextTrayComparisons':len(data['results']), 'snapshotPlays':sum(g['plays'] for g in out['snapshots'].values())}
if (root/'composition.json.gz').exists():
    comp,sha=read('composition.json.gz');out['dataSha256']['composition']=sha;out['composition']={}
    for catalogue in ['full','common']:
        for policy in ['flow-v4','director-v2','random-proved']:
            rows=[r for r in comp['rows'] if r['catalogue']==catalogue and r['policy']==policy]
            group={'assignments':len(rows),'proofStatus':dict(collections.Counter(r['proof']['status'] for r in rows)),'styles':{}}
            for style in ['clear','space','three','bounded']:
                pairs=[(p,c,r['proof']['status']=='found') for r in rows for p,c in zip(r['plays'],r['control']) if p['style']==style]
                entry={}
                for subset,pp in [('all',pairs),('bothProved',[p for p in pairs if p[2]])]:
                    entry[subset]={'n':len(pp),'ownLines':sum(c['lines'] for p,c,_ in pp),'shiftedLines':sum(p['lines'] for p,c,_ in pp),
                        'ownRewards':sum(c['earned'] for p,c,_ in pp),'shiftedRewards':sum(p['earned'] for p,c,_ in pp),
                        'ownCompleted':sum(c['completed'] for p,c,_ in pp),'shiftedCompleted':sum(p['completed'] for p,c,_ in pp)}
                group['styles'][style]=entry
            out['composition'][catalogue+':'+policy]=group
(root/'metrics.json').write_text(json.dumps(out,indent=2)+'\n')
print(json.dumps(out['totals']))
for key,g in out['games'].items():
    if key.startswith('full:') and key.rsplit(':',1)[1] in ['bounded','bounded-reward','three','three-reward']:
        print(key, 'lines/move',round(g['linesPerMove'],3),'allclear',g['allClears'],'rewardGames',g['gamesWithReward'],'ended',g['ended'],'moves',round(g['observedMeanMoves'],1))
