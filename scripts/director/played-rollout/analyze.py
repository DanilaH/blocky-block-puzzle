"""D83 frozen split gates and transparent exposure/forecast metrics."""
import collections
import gzip
import hashlib
import json
from pathlib import Path
import statistics

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT/'docs/qa/played-rollout'


def dry(events):
    longest = gap = 0
    for e in events:
        gap = 0 if e['lines'] else gap+1
        longest = max(gap, longest)
    return longest


def main():
    raw = (OUT/'results.json.gz').read_bytes()
    data = json.loads(gzip.decompress(raw))
    shapes = json.loads((ROOT/'src/core/shapes.json').read_text())
    by_id = {s['id']: s for s in shapes}
    summaries = {}
    for dataset in ['matched', 'games']:
        summaries[dataset] = {}
        for group in ['engineering', 'development', 'confirmation']:
            if dataset == 'games' and group == 'engineering':
                continue
            summaries[dataset][group] = {}
            for style in ['bounded', 'three']:
                summaries[dataset][group][style] = {}
                for mode in ['v2', 'short', 'rollout']:
                    runs = [r for r in data[dataset] if r['group'] == group and r['style'] == style and r['mode'] == mode]
                    events = [e for r in runs for e in r['events']]
                    issued = []
                    pairs = repeats = nonbase = 0
                    for r in runs:
                        bags = []
                        for d in r['deals']:
                            tray = d['base']['tray'] if mode == 'v2' else data['roots'][d['root']]['pool'][d['index']]['tray']
                            issued.extend(tray)
                            bags.append(','.join(sorted(s['shapeId'] for s in tray)))
                            nonbase += d['index'] != 0
                        pairs += max(0, len(bags)-1)
                        repeats += sum(a == b for a, b in zip(bags, bags[1:]))
                    summaries[dataset][group][style][mode] = dict(runs=len(runs), moves=len(events),
                        rewards=sum(e['clear'] for e in events), rewardingRuns=sum(r['earned'] for r in runs),
                        lateRewardRuns=sum(any(e['clear'] and r['initialState']['moves']+i+1 > 12 for i, e in enumerate(r['events'])) for r in runs),
                        rewardsAfterFirstTray=sum(e['clear'] for r in runs for e in r['events'][3:]),
                        lines=sum(e['lines'] for e in events), clearingMoves=sum(e['lines'] > 0 for e in events),
                        multiLineMoves=sum(e['lines'] >= 2 for e in events),
                        ended=sum(r['ended'] for r in runs), censored=sum(r['censored'] for r in runs),
                        medianMoves=statistics.median(len(r['events']) for r in runs) if runs else None,
                        maxDryGap=max((dry(r['events']) for r in runs), default=0),
                        repeatedPairs=repeats, consecutivePairs=pairs, nonbaseIssued=nonbase,
                        issuedFamilies=dict(collections.Counter(by_id[s['shapeId']]['family'] for s in issued)),
                        meanIssuedArea=sum(len(by_id[s['shapeId']]['cells']) for s in issued)/len(issued) if issued else None)
    gates = {}
    for split in ['development', 'confirmation']:
        matched = summaries['matched'][split]['bounded']
        full = summaries['games'][split]
        base, candidate = full['bounded']['v2'], full['bounded']['rollout']
        strong = full['three']['rollout']
        rows = dict(matchedMoreThanShort=matched['rollout']['rewards'] > matched['short']['rewards'],
                    matchedAtLeastV2=matched['rollout']['rewards'] >= matched['v2']['rewards'],
                    boundedLateHalf=2*candidate['lateRewardRuns'] >= candidate['runs'],
                    strongRewardRate=.03 <= strong['rewards']/strong['moves'] <= .10)
        for style in ['bounded', 'three']:
            c, b = full[style]['rollout'], full[style]['v2']
            rows[style+'Lines95'] = c['lines']*b['moves']*100 >= b['lines']*c['moves']*95
            rows[style+'RepeatRate'] = c['repeatedPairs']/max(1, c['consecutivePairs']) <= b['repeatedPairs']/max(1, b['consecutivePairs'])+.10
        gates[split] = rows
    selections = collections.Counter()
    for root in data['roots']:
        for horizon, s in root['selections'].items():
            selections[f'h{horizon}:roots'] += 1
            selections[f'h{horizon}:nonbase'] += s['index'] != 0
            selections[f'h{horizon}:noEligible'] += s['noEligible']
    all_runs = data['matched']+data['games']
    metrics = dict(schema='blocky-played-rollout-metrics-v1', resultSha256=hashlib.sha256(raw).hexdigest(),
        summaries=summaries, gates=gates, decision='BEHAVIOR-PILOT-PASS' if all(all(g.values()) for g in gates.values()) else 'REJECT',
        sourceGames=len(data['sourceGames']), inputs=len(data['inputs']), missing=data['missing'],
        matchedRuns=len(data['matched']), completeGameRuns=len(data['games']),
        actualMoves=sum(len(r['events']) for r in all_runs), roots=len(data['roots']), selections=dict(selections),
        forecastTrajectories=sum(len(row) for r in data['roots'] for hs in r['forecasts'].values() for row in hs),
        note='Forecast future policy v2; actual selectors replan. Quantiles/snapshots/overlapping windows are not independent humans.')
    (OUT/'metrics.json').write_text(json.dumps(metrics, indent=2)+'\n')
    compact = {stage: {group: {style: {mode: {k: v for k, v in row.items() if k not in ['issuedFamilies', 'meanIssuedArea']}
        for mode, row in modes.items()} for style, modes in styles.items()} for group, styles in groups.items()}
        for stage, groups in summaries.items()}
    print(json.dumps(dict(decision=metrics['decision'], gates=gates, summaries=compact, selections=dict(selections))))


if __name__ == '__main__':
    main()
