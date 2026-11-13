"""D82 frozen-gate report; does not change the preparation or its thresholds."""
import collections
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT/'docs/qa/branch-preparation'


def dry(events):
    gap = longest = 0
    for e in events:
        gap = 0 if e['lines'] else gap+1
        longest = max(longest, gap)
    return longest


def main():
    raw = (OUT/'results.json').read_bytes()
    data = json.loads(raw)
    shapes = json.loads((ROOT/'src/core/shapes.json').read_text())
    by_id = {s['id']: s for s in shapes}
    query_by_board = {q['board']: q for q in data['prepareQueries']}
    summaries, gate = {}, {}
    for cohort in ['engineering', 'new-v2']:
        ids = [i for i, p in enumerate(data['inputs']) if p['cohort'] == cohort and any(p['rows'])]
        initial = [query_by_board[str(sum(r << (8*y) for y, r in enumerate(data['inputs'][i]['rows'])))] for i in ids]
        cohort_result = dict(inputs=len(ids), firstTreeLeaves=sum(len(q['leaves']) for q in initial),
                             firstTreesSafe=sum(q['pool'][0]['tree']['dead'] == 0 for q in initial),
                             firstTreesEveryPathClears=sum(q['pool'][0]['tree']['minClears'] >= 1 for q in initial))
        for mode in ['prepare', 'd81']:
            episodes = [e for e in data['episodes'] if e['input'] in ids and e['mode'] == mode]
            events = [a for e in episodes for a in e['events']]
            first = [a for e in episodes for a in e['events'][:3]]
            rewards = [sum(e['status'] == 'reward' for e in episodes if e['input'] == i) for i in ids]
            issued = [s for e in episodes for d in e['deals'] for s in d['tray']]
            consecutive = repeats = 0
            for e in episodes:
                bags = [','.join(sorted(s['shapeId'] for s in d['tray'])) for d in e['deals']]
                consecutive += max(0, len(bags)-1)
                repeats += sum(a == b for a, b in zip(bags, bags[1:]))
            weak = sum(data['prepareQueries'][d['query']]['pool'][0]['tree']['dead'] > 0 or
                       data['prepareQueries'][d['query']]['pool'][0]['tree']['minClears'] < 1
                       for e in episodes for d in e['deals']) if mode == 'prepare' else None
            cohort_result[mode] = dict(episodes=len(episodes), statuses=dict(collections.Counter(e['status'] for e in episodes)),
                rewardInputs=sum(n > 0 for n in rewards), twoOrMoreRewardInputs=sum(n >= 2 for n in rewards),
                allSampledRewardInputs=sum(n == (5 if cohort == 'engineering' else 10) for n in rewards),
                rewardsByInput=dict(zip(ids, rewards)), moves=len(events), lines=sum(a['lines'] for a in events),
                rewardAt=dict(collections.Counter(len(e['events']) for e in episodes if e['status'] == 'reward')),
                clearingMoves=sum(a['lines'] > 0 for a in events), maxDryGap=max(map(lambda e: dry(e['events']), episodes)),
                firstMoves=len(first), firstClearingMoves=sum(a['lines'] > 0 for a in first),
                firstClearingFrequency=sum(a['lines'] > 0 for a in first)/len(first) if first else None,
                weakIssuedTrays=weak, consecutiveBags=consecutive, repeatedConsecutiveBags=repeats,
                issuedShapes=dict(collections.Counter(s['shapeId'] for s in issued)),
                issuedFamilies=dict(collections.Counter(by_id[s['shapeId']]['family'] for s in issued)),
                meanIssuedArea=sum(len(by_id[s['shapeId']]['cells']) for s in issued)/len(issued) if issued else None)
        summaries[cohort] = cohort_result
        paired_prepared = paired_control = paired_moves = 0
        for e in [e for e in data['episodes'] if e['input'] in ids and e['mode'] == 'prepare']:
            other = next(p for p in data['episodes'] if p['input'] == e['input'] and p['trial'] == e['trial'] and p['mode'] == 'd81')
            n = min(3, len(e['events']), len(other['events']))
            paired_moves += n
            paired_prepared += sum(a['lines'] > 0 for a in e['events'][:n])
            paired_control += sum(a['lines'] > 0 for a in other['events'][:n])
        cohort_result['pairedFirstExposure'] = dict(movesPerCondition=paired_moves,
            prepareClearingMoves=paired_prepared, d81ClearingMoves=paired_control)
    opportunities = []
    for i in sorted(set(o['input'] for o in data['opportunities'])):
        rows = [o for o in data['opportunities'] if o['input'] == i]
        statuses = collections.Counter('already-reward' if o['alreadyReward'] else 'dead' if o['dead']
            else data['reachQueries'][o['query']]['status'] for o in rows)
        opportunities.append(dict(input=i, leaves=len(rows), statuses=dict(statuses)))
    s = summaries['new-v2']
    gate = dict(zeroDeadFirstTrees=s['firstTreesSafe'] == s['inputs'],
                everyFirstPathClears=s['firstTreesEveryPathClears'] == s['inputs'],
                twoSuccessesOnHalfInputs=2*s['prepare']['twoOrMoreRewardInputs'] >= s['inputs'],
                moreRewardsThanD81=s['prepare']['statuses'].get('reward', 0) > s['d81']['statuses'].get('reward', 0),
                noLowerFirstClearingFrequency=s['prepare']['firstClearingFrequency'] >= s['d81']['firstClearingFrequency'])
    output = dict(schema='blocky-branch-preparation-analysis-v1', resultSha256=hashlib.sha256(raw).hexdigest(),
                  cohorts=summaries, missing=data['missing'], emptyInputs=data['emptyInputs'], gates=gate,
                  decision='LIMITED-BRIDGE-PASS' if all(gate.values()) else 'REJECT',
                  nativePreparationQueries=len(data['prepareQueries']), nativeReachQueries=len(data['reachQueries']),
                  totalMultisets=sum(q['bags'] for q in data['prepareQueries']),
                  fitChecks=sum(q['fitChecks'] for q in data['prepareQueries']), opportunities=opportunities)
    (OUT/'metrics.json').write_text(json.dumps(output, indent=2)+'\n')
    print(json.dumps(dict(decision=output['decision'], gates=gate,
        cohorts={c: {m: {k: v for k, v in s[m].items() if k not in ['issuedShapes', 'issuedFamilies', 'rewardsByInput']}
                     for m in ['prepare', 'd81']} for c, s in summaries.items()},
        opportunityTotals=dict(sum((collections.Counter(x['statuses']) for x in opportunities), collections.Counter())))))


if __name__ == '__main__':
    main()
