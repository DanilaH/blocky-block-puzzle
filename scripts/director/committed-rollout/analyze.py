"""D84 unchanged behavioral gates; technical consistency reported separately."""
import collections
import gzip
import hashlib
import json
from pathlib import Path
import statistics

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT/'docs/qa/committed-rollout'
MODES = ['v2', 'short', 'replan', 'hold']


def dry(events):
    gap = longest = 0
    for e in events:
        gap = 0 if e['lines'] else gap+1
        longest = max(longest, gap)
    return longest


def main():
    raw = (OUT/'results.json.gz').read_bytes()
    data = json.loads(gzip.decompress(raw))
    shapes = {s['id']: s for s in json.loads((ROOT/'src/core/shapes.json').read_text())}
    summaries = {}
    for dataset in ['matched', 'games']:
        summaries[dataset] = {}
        for split in ['development', 'confirmation']:
            summaries[dataset][split] = {}
            for style in ['bounded', 'three']:
                summaries[dataset][split][style] = {}
                for mode in MODES:
                    runs = [r for r in data[dataset] if r['group'] == split and r['style'] == style and r['mode'] == mode]
                    events = [e for r in runs for e in r['events']]
                    issued, pairs, repeats, selected, nonbase, continued, fallbacks = [], 0, 0, 0, 0, 0, 0
                    for r in runs:
                        bags = []
                        for d in r['deals']:
                            candidate = data['roots'][d['root']]['pool'][d['index']] if d['root'] is not None else d['proof']
                            tray = candidate['tray']
                            issued += tray
                            selected += d['action'] == 'select'
                            continued += d['action'] == 'v2-continuation'
                            nonbase += d['index'] != 0
                            fallbacks += candidate['fallback']
                            bags.append(','.join(sorted(s['shapeId'] for s in tray)))
                        pairs += max(0, len(bags)-1)
                        repeats += sum(a == b for a, b in zip(bags, bags[1:]))
                    summaries[dataset][split][style][mode] = dict(runs=len(runs), moves=len(events),
                        rewards=sum(e['clear'] for e in events), rewardingRuns=sum(r['earned'] for r in runs),
                        lateRewardRuns=sum(any(e['clear'] and r['initialState']['moves']+i+1 > 12 for i, e in enumerate(r['events'])) for r in runs),
                        rewardsAfterFirstTray=sum(e['clear'] for r in runs for e in r['events'][3:]),
                        lines=sum(e['lines'] for e in events), clearingMoves=sum(e['lines'] > 0 for e in events),
                        multiLineMoves=sum(e['lines'] >= 2 for e in events), maxDryGap=max((dry(r['events']) for r in runs), default=0),
                        ended=sum(r['ended'] for r in runs), censored=sum(r['censored'] for r in runs),
                        medianMoves=statistics.median(len(r['events']) for r in runs) if runs else None,
                        repeatedPairs=repeats, consecutivePairs=pairs, selectorCalls=selected, v2Continuations=continued,
                        nonbaseIssued=nonbase, fallbackIssued=fallbacks,
                        issuedFamilies=dict(collections.Counter(shapes[s['shapeId']]['family'] for s in issued)),
                        meanIssuedArea=sum(len(shapes[s['shapeId']]['cells']) for s in issued)/len(issued) if issued else None)
    gates = {}
    for split in ['development', 'confirmation']:
        m, f = summaries['matched'][split]['bounded'], summaries['games'][split]
        bounded, strong = f['bounded']['hold'], f['three']['hold']
        rows = dict(matchedMoreThanShort=m['hold']['rewards'] > m['short']['rewards'],
                    matchedAtLeastV2=m['hold']['rewards'] >= m['v2']['rewards'],
                    boundedLateHalf=2*bounded['lateRewardRuns'] >= bounded['runs'],
                    strongRewardRate=.03 <= strong['rewards']/max(1, strong['moves']) <= .10)
        for style in ['bounded', 'three']:
            c, b = f[style]['hold'], f[style]['v2']
            rows[style+'Lines95'] = c['lines']*b['moves']*100 >= b['lines']*c['moves']*95
            rows[style+'RepeatRate'] = c['repeatedPairs']/max(1, c['consecutivePairs']) <= b['repeatedPairs']/max(1, b['consecutivePairs'])+.10
        gates[split] = rows
    mismatches = []
    complete_strong = 0
    for run in [r for r in data['games'] if r['mode'] == 'hold' and r['style'] == 'three']:
        for d in [d for d in run['deals'] if d['action'] == 'select']:
            actual = run['events'][d['at']:d['at']+9]
            if len(actual) < 9 and not run['ended']:
                continue
            complete_strong += 1
            expected = data['roots'][d['root']]['forecasts']['9'][d['index']][3]
            if [{k: v for k, v in e.items() if k != 'roll'} for e in actual] != expected['events']:
                mismatches.append(dict(seed=run['seed'], at=d['at']))
    result = dict(schema='blocky-committed-rollout-metrics-v1', resultSha256=hashlib.sha256(raw).hexdigest(),
        summaries=summaries, gates=gates,
        decision='BEHAVIOR-PILOT-PASS' if all(all(g.values()) for g in gates.values()) else 'REJECT',
        knownRegressions=len(data['regressions']), freshInputs=len(data['inputs']), missing=data['missing'],
        matchedRuns=len(data['matched']), fullGameRuns=len(data['games']), roots=len(data['roots']),
        actualMoves=sum(len(r['events']) for r in data['matched']+data['games']),
        consistencyForks=len(data['forks']), strongDecisionWindows=complete_strong,
        strongExecutionMismatches=mismatches,
        note='Known regression/forks are technical checks; behavioral gates use fresh data only. No save migration implemented.')
    (OUT/'metrics.json').write_text(json.dumps(result, indent=2)+'\n')
    brief = {ds: {sp: {sty: {mode: {k: v for k, v in r.items() if k not in ['issuedFamilies', 'meanIssuedArea']}
        for mode, r in modes.items()} for sty, modes in styles.items()} for sp, styles in splits.items()} for ds, splits in summaries.items()}
    print(json.dumps(dict(decision=result['decision'], gates=gates, summaries=brief,
        knownRegressions=result['knownRegressions'], consistencyForks=result['consistencyForks'], strongWindows=complete_strong, mismatches=len(mismatches))))


if __name__ == '__main__':
    main()
