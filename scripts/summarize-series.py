"""Analyze already-recorded clear gaps; no inference about human timing."""
import gzip
import json
from pathlib import Path
from statistics import mean

root = Path('docs/qa/dealer-0.15')
out = Path('docs/qa/dealer-0.16')
def read(path):
    return gzip.decompress(path.read_bytes()).decode() if path.suffix == '.gz' else path.read_text()
def quantile(values, p):
    values = sorted(values)
    return values[round((len(values)-1)*p)]
def summarize(rows):
    extended = continued = breaks = clears = 0
    maxima = []
    for r in rows:
        streak = maximum = 0
        for i, gap in enumerate(r['gaps']):
            if i and gap <= 2:
                continued += 1
                extended += gap > 0
            elif i:
                breaks += 1
            streak = streak+1 if gap <= 2 else 1
            maximum = max(maximum, streak)
        assert maximum == r['maxStreak'], (r['policy'], r['seed'])
        maxima.append(maximum)
        clears += len(r['gaps'])
    return dict(n=len(rows), clears=clears, continued=continued, rescuedByGrace=extended,
                rescuedPctOfClears=100*extended/clears, completedBreaks=breaks,
                meanMaxSeries=mean(maxima), p95MaxSeries=quantile(maxima,.95), maxSeries=max(maxima),
                scorePerMove=sum(r['score'] for r in rows)/sum(r['moves'] for r in rows),
                maxScore=max(r['score'] for r in rows), meanObservedMoves=mean(r['moves'] for r in rows),
                censored=sum(not r['over'] for r in rows),
                lossesWithinTwoMovesOfRefill=sum(r['over'] and r['movesSinceRefill']<=2 for r in rows))
result = {'method':'Grace continuity reconstructed from ordered gaps before each clear; checked against recorded maximum series. Breaks only between clears (terminal drought excluded). Rescue is a mechanical continuation, not a subjective reward. All means censored at the run move limit.', 'limit150':[], 'limit1000':[]}
for policy in ['initial-v1','solvable-v1','assist-v1']:
    rows=[]
    for suffix in ['', '-greedy']:
        rows += [json.loads(x) for x in read(root/f'balance-{policy}{suffix}.jsonl.gz').splitlines()]
    for player in ['random','greedy','beam3']:
        rs=[r for r in rows if r['player']==player]
        assert len(rs)==1000
        result['limit150'].append(dict(policy=policy,player=player,**summarize(rs)))
for policy in ['initial-v1','assist-v1']:
    path=out/f'balance-{policy}-beam3.jsonl'
    if not path.exists(): path=path.with_suffix(path.suffix+'.gz')
    if path.exists():
        rs=[json.loads(x) for x in read(path).splitlines()]
        assert len(rs)==50 and {r['seed'] for r in rs}==set(range(1,51)), 'incomplete long run'
        result['limit1000'].append(dict(policy=policy,player='beam3',**summarize(rs)))
(out/'series-summary.json').write_text(json.dumps(result,indent=2))
print(json.dumps(result,indent=2))
