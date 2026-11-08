"""Recompute paired eight-second prototype evidence; no phone extrapolation."""
import gzip, json, statistics, sys
from pathlib import Path

source = Path(sys.argv[1] if len(sys.argv) > 1 else 'docs/qa/two-phase-clear/browser-comparison.json')
if not source.exists():
    source = source.with_suffix(source.suffix + '.gz')
data = json.loads(gzip.decompress(source.read_bytes()) if source.suffix == '.gz' else source.read_text())
rows = data['results']
assert len(rows) == 24
assert data['measurementMs'] == 8000
median = statistics.median

def selected(row, low=0, high=8000):
    s = row['frameSamples']
    return [ms for ms, end in zip(s['intervals'], s['endTimes'])
            if end > s['at'] + low and end - ms < s['at'] + high]

for row in rows:
    fs = selected(row)
    actual = row['windows'][-1]['frames']
    assert len(fs) == actual['intervals']
    assert sum(ms > 34 for ms in fs) == actual['over34']
    assert sum(round(ms, 1) > 33.4 for ms in fs) == actual['over33Rounded']
    assert row['errors'] == []
    assert row['state']['proof']['pendingPoints'] == 0
    assert row['state']['proof']['shownScore'] == 1574
    assert not any(row['state']['resources'].values())

scenarios = []
for width in [392, 872]:
    for variant in [0, 1, 2]:
        summary = {'width': width, 'variant': variant}
        for mode in ['legacy', 'staged']:
            rs = [r for r in rows if r['viewport']['width'] == width and r['variant'] == variant and r['mode'] == mode]
            assert len(rs) == 2 and {r['pass'] for r in rs} == {0, 1}
            summary[mode] = {
                'cpuMedianMs': median(r['wholeTasks']['threadCpuMs'] for r in rs),
                'peakOneSecondCpuMedianMs': median(r['maxOneSecondCpuMs'] for r in rs),
                'over34ByPass': [r['windows'][-1]['frames']['over34'] for r in sorted(rs, key=lambda r:r['pass'])],
                'over33RawByPass': [r['windows'][-1]['frames']['over33'] for r in sorted(rs, key=lambda r:r['pass'])],
                'over33RoundedByPass': [r['windows'][-1]['frames']['over33Rounded'] for r in sorted(rs, key=lambda r:r['pass'])],
                'excess16_7MedianMs': median(r['windows'][-1]['frames']['excessOver16_7Ms'] for r in rs),
            }
        summary['cpuChangePct'] = (summary['staged']['cpuMedianMs'] / summary['legacy']['cpuMedianMs'] - 1) * 100
        summary['peakChangePct'] = (summary['staged']['peakOneSecondCpuMedianMs'] / summary['legacy']['peakOneSecondCpuMedianMs'] - 1) * 100
        scenarios.append(summary)

aggregate = {}
for mode in ['legacy', 'staged']:
    rs = [r for r in rows if r['mode'] == mode]
    aggregate[mode] = {
        'episodes': len(rs),
        'cpuMedianMs': median(r['wholeTasks']['threadCpuMs'] for r in rs),
        'cpuSumMs': sum(r['wholeTasks']['threadCpuMs'] for r in rs),
        'peakOneSecondCpuMedianMs': median(r['maxOneSecondCpuMs'] for r in rs),
        'windows': [{
            'afterCommitMs': rs[0]['windows'][i]['afterCommitMs'],
            'cpuMedianMs': median(r['windows'][i]['tasks']['threadCpuMs'] for r in rs),
            'over33RawTotal': sum(r['windows'][i]['frames']['over33'] for r in rs),
            'over33RoundedTotal': sum(r['windows'][i]['frames']['over33Rounded'] for r in rs),
            'over34Total': sum(r['windows'][i]['frames']['over34'] for r in rs),
            'over50Total': sum(r['windows'][i]['frames']['over50'] for r in rs),
            'maxFrameMs': max(r['windows'][i]['frames']['maxMs'] for r in rs),
            'excess16_7MedianMs': median(r['windows'][i]['frames']['excessOver16_7Ms'] for r in rs),
        } for i in range(3)]
    }

phase_times = []
complete_times = []
for row in rows:
    if row['mode'] != 'staged': continue
    events = row['state']['clearPresentation']['events']
    at = lambda name: next(e['at'] for e in events if e['name'] == name)
    phase_times.append(at('theme-start') - at('start'))
    complete_times.append(at('complete') - at('start'))
result = {
    'sourceCommit': '44bde185da1532d3b283de3a60f1fde5780b19b6',
    'scope': data['environment'],
    'sample': '24 measured plus 24 untraced warmup cycles; two passes in opposite order; n=2 per mode/scenario. Descriptive, no statistical significance claim.',
    'precision': 'Float32 RAF intervals can store 33.4 as 33.4000015. Raw >33.4 is preserved, with rounded-to-0.1ms and >34 sensitivity checks.',
    'aggregate': aggregate,
    'scenarios': scenarios,
    'themeStartMs': {'min': min(phase_times), 'median': median(phase_times), 'max': max(phase_times)},
    'completeMs': {'min': min(complete_times), 'median': median(complete_times), 'max': max(complete_times)},
}
source.with_name('browser-summary.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result, indent=2))
