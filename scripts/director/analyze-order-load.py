"""Independent metric calculation from recorded actions/events, not JS summaries."""
import gzip,json,math,hashlib
from pathlib import Path

root=Path('docs/qa/director-order-load')
raw=(root/'results.json.gz').read_bytes()
data=json.loads(gzip.decompress(raw))
assert len(data['runs'])==144
def q(values,p):
    return sorted(values)[math.floor((len(values)-1)*p)] if values else None
def total(rows,key): return sum(r[key] for r in rows)
for run in data['runs']:
    assert len(run['events'])==len(run['actions'])==run['moves']
    assert sum(e[0] for e in run['events'])==run['lines']
    assert sum(e[1] for e in run['events'])==run['clears']
    rewards=[i+1 for i,e in enumerate(run['events']) if e[0]]
    assert [b-a for a,b in zip(rewards,rewards[1:])]==run['gaps']
    assert (rewards[0] if rewards else run['moves'])==run['initialDry']
    assert run['moves']-(rewards[-1] if rewards else 0)==run['terminalDry']
rows=[]
for source in data['summary']:
    split,style,mode=(source[k] for k in ('split','style','mode'))
    group=[r for r in data['runs'] if r['split']==split and (style=='all' or r['style']==style)]
    base=[r for r in group if r['mode']=='baseline']
    candidate=[r for r in group if r['mode']==mode]
    post=[d for r in candidate for d in r['deals'] if d['move']>=12]
    ratio=(total(candidate,'lines')/total(candidate,'moves'))/(total(base,'lines')/total(base,'moves'))
    assert abs(ratio-source['lineRatio'])<1e-12
    bg=q([g for r in base for g in r['gaps']],.9)
    cg=q([g for r in candidate for g in r['gaps']],.9)
    assert (bg,cg)==(source['baseGapP90'],source['gapP90'])
    counts={kind:sum(d['actual']==kind for d in post) for kind in ('order','load','emergency')}
    for key,value in counts.items(): assert value==source[key+'Deals']
    assert len(post)==source['postIntroDeals']
    assert sum(r['ended'] for r in candidate)==source['ended']
    gates=dict(lines=ratio>=.85,rewardGap=cg is not None and bg is not None and cg<=bg+3,
               early=not any(r['ended'] and r['moves']<9 for r in candidate),
               emergency=bool(post) and counts['emergency']/len(post)<=.05)
    if style=='all':gates.update(order=counts['order']/len(post)>=.15,load=counts['load']/len(post)>=.10)
    if mode=='risky' and style in ('three','plausible'):gates['finite']=sum(r['ended'] for r in candidate)>=(4 if style=='three' else 6)
    assert gates==source['gates']
    rows.append(dict(split=split,style=style,mode=mode,gates=gates,orderFraction=counts['order']/len(post),loadFraction=counts['load']/len(post),
        baseInitialDryP90=q([r['initialDry'] for r in base],.9),initialDryP90=q([r['initialDry'] for r in candidate],.9),
        baseTerminalDryP90=q([r['terminalDry'] for r in base],.9),terminalDryP90=q([r['terminalDry'] for r in candidate],.9),
        baseMedianMoves=q([r['moves'] for r in base],.5),medianMoves=q([r['moves'] for r in candidate],.5)))
assert not all(all(r['gates'].values()) for r in rows if r['mode']=='risky')
aggregate=[]
for mode in ('baseline','risky','guarded'):
    rs=[r for r in data['runs'] if r['mode']==mode]
    aggregate.append(dict(mode=mode,games=len(rs),moves=total(rs,'moves'),ended=total(rs,'ended'),censored=total(rs,'censored'),
        lines=total(rs,'lines'),clears=total(rs,'clears'),medianMoves=q([r['moves'] for r in rs],.5),
        initialDryP90=q([r['initialDry'] for r in rs],.9),terminalDryP90=q([r['terminalDry'] for r in rs],.9)))
result=dict(valid=True,resultsSha256=hashlib.sha256(raw).hexdigest(),gate=False,aggregate=aggregate,rows=rows,
            duplicateTrajectories=data['duplicates'],note='Games capped at360 are censored; medians include caps. Splits/styles remain separate; paired loads are not independent samples.')
(root/'analysis.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(dict(valid=True,aggregate=aggregate,failed=[{k:r[k] for k in ('split','style','mode','gates')} for r in rows if not all(r['gates'].values())])))
