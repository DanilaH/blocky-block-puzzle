"""Independently validate the small legacy/filter HUD comparison export."""
import hashlib
import json
import math
from pathlib import Path
import runpy
import sys
import zipfile

shared = runpy.run_path(str(Path(__file__).with_name('analyze-full-clear.py')))
frame_metrics = shared['frame_metrics']
PLAN = ['legacy', 'filter', 'filter', 'legacy', 'legacy', 'filter', 'filter', 'legacy']


def validate(path):
    issues = []
    with zipfile.ZipFile(path) as z:
        assert sorted(z.namelist()) == ['manifest.json', 'report.json'], 'Unexpected traces or ZIP members'
        assert sum(x.file_size for x in z.infolist()) < 5 * 1024 * 1024, 'Export too large'
        manifest = json.loads(z.read('manifest.json'))
        assert manifest['schema'] == 'blocky-full-manifest-v1'
        assert len(manifest['files']) == 1 and manifest['files'][0]['path'] == 'report.json'
        member = manifest['files'][0]
        raw = z.read('report.json')
        assert len(raw) == member['bytes'] and hashlib.sha256(raw).hexdigest() == member['sha256'], 'Manifest mismatch'
        r = json.loads(raw)
    assert r['schema'] == 'blocky-score-feedback-v1' and r['appVersion'] == '0.60.0-preview'
    functional = r['functionalOnly']
    assert functional or (len(r['sourceCommit']) == 40 and all(c in '0123456789abcdef' for c in r['sourceCommit']))
    assert r['protocol']['nativeTracesUsed'] is False and r['protocol']['attributionOrder'] == []
    duration = r['protocol']['measurementMs']
    assert functional or duration == 8000
    if not functional:
        ads = r['session']['nativeAds']
        assert ads['suspended'] and not any(ads[k] for k in ['bannerPresent', 'loadingInterstitial', 'loadingRewarded'])
    if not r['completed']:
        issues.append('incomplete-session:' + str(r.get('failure', 'invalid-episode')))
    rows = []
    for e in r['episodes']:
        assert not e['traceActive'] and 'capture' not in e, 'Instrumented comparison'
        assert e['condition']['id'] == 'baseline' and not any(e['condition'][k] for k in shared['FLAGS'])
        p = e['state']['proof']
        assert p['score'] == p['shownScore'] == 1574 and p['pendingPoints'] == 0 and p['boardEmpty'] and p['savedTheme'] == 5
        assert p['rewardRenderer'] == 'dom' and p['rewardDomCreated'] == 3
        assert p['rewardEffects'] == dict(captionAnimations=2, visibleEmblems=0, pointFlights=2, hudFlashes=2, themeNotices=1, themeImpulses=1)
        assert all(x == 5 for x in [p['renderedTheme'], p['scene']['theme'], p['atmosphere']['theme'], p['festival']['theme']])
        assert p['scene']['draws'] > 0 and p['scene']['inkPeak'] > 0 and p['scene']['vfxPeak'] > 0
        assert p['atmosphere']['draws'] > 0 and not p['atmosphere']['disabled']
        assert p['atmosphere']['domPaletteTheme'] == 5 and p['atmosphere']['domPalette'] == dict(bg='#233f57', ink='#f2f4f7', accent='#a5e8ef')
        assert p['festival']['spawned'] == 148 and p['festival']['bursts'] == 2 and p['festival']['draws'] > 0 and not p['festival']['disabled']
        if not functional:
            assert p['festival']['activeParticles'] == p['festival']['activeReveals'] == 0
        expected = 'text-shadow' if e['scoreFeedback'] == 'legacy' else 'filter'
        assert p['scoreGlowProperties'] == [expected, expected], 'Wrong actual renderer keyframes'
        s = e['sample']
        assert len(s['placements']) == 1 and len(s['frames']) == len(s['frameTimes']) and s['frames']
        assert all(math.isfinite(x) and x > 0 for x in s['frames']) and all(math.isfinite(t) for t in s['frameTimes'])
        assert all(a < b for a, b in zip(s['frameTimes'], s['frameTimes'][1:]))
        assert functional or s['frameTimes'][-1] - s['placements'][0]['at'] >= 7900
        m = frame_metrics(e, duration)
        assert all(e['metrics'][k] == v or isinstance(v, (int, float)) and abs(e['metrics'][k] - v) < 1e-5 for k, v in m.items())
        if not e['valid']:
            issues.append('invalid:' + str(e['scoreFeedback']))
        rows.append(dict(phase=e['phase'], variant=e['scoreFeedback'], valid=e['valid'], metrics=m))
    comparisons = [e for e in rows if e['phase'] == 'comparison']
    if r['completed']:
        assert len(rows) == 10 and [e['variant'] for e in rows[:2]] == ['legacy', 'filter']
        assert all(e['phase'] == 'warmup' for e in rows[:2])
        assert [e['variant'] for e in comparisons] == PLAN and all(e['valid'] for e in rows)
    orders = []
    for direction in [0, 1]:
        samples = [x for i in [direction, direction + 2] for x in comparisons[i * 2:i * 2 + 2]]
        old, new = ([x for x in samples if x['variant'] == mode] for mode in ['legacy', 'filter'])
        if len(old) != 2 or len(new) != 2:
            orders.append(dict(direction=direction, comparable=False, meetsTarget=False))
            continue
        before = sum(x['metrics']['over33'] for x in old) / 2
        after = sum(x['metrics']['over33'] for x in new) / 2
        stable = abs(old[0]['metrics']['over33'] - old[1]['metrics']['over33']) <= max(2, before * .5)
        comparable = not functional and all(x['valid'] and x['metrics']['intervals'] >= 100 for x in samples)
        target = comparable and stable and before >= 2 and after <= before / 2 and max(x['metrics']['maxMs'] for x in new) <= max(x['metrics']['maxMs'] for x in old) + 1
        orders.append(dict(direction=direction, comparable=comparable, baselineStable=stable, beforeMean=before, candidateMean=after, meetsTarget=target))
    improved = r['completed'] and not issues and all(x['meetsTarget'] for x in orders)
    assert r['summary']['improved'] == improved, 'On-device summary mismatch'
    return dict(schema='blocky-score-feedback-analysis-v1', sourceCommit=r['sourceCommit'], inputZipSha256=hashlib.sha256(path.read_bytes()).hexdigest(), completed=r['completed'], functionalOnly=functional, episodes=len(rows), issues=issues, rows=rows, orders=orders, improved=improved,
                scope='RAF comparison of legacy and compositor score feedback; no native tracing. This does not measure physical presentation or GPU execution time.')


if __name__ == '__main__':
    result = validate(Path(sys.argv[1]))
    Path(sys.argv[2]).write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({k: result[k] for k in ['completed', 'episodes', 'issues', 'improved']}))
    if not result['completed'] or result['issues']:
        sys.exit(2)
