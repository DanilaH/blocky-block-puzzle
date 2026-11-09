"""Independently check RAF metrics and strip raw callbacks from public evidence."""
import argparse
import hashlib
import json
import math
import statistics
from pathlib import Path


def rounded(value):
    return math.floor(value * 10 + 0.5) / 10


def metrics(values):
    ordered = sorted(values)
    return {
        'intervals': len(values),
        'over33Raw': sum(v > 33.4 for v in values),
        'over33': sum(rounded(v) > 33.4 for v in values),
        'over34': sum(v > 34 for v in values),
        'over50': sum(v > 50 for v in values),
        'maxMs': max(values, default=0),
        'p95Ms': ordered[int(len(ordered) * .95)] if ordered else None,
    }


def callback_metrics(times):
    values = [b - a for a, b in zip(times, times[1:])]
    assert all(v >= 0 for v in values)
    return {**metrics(values), 'callbacks': len(times),
            'meanMs': statistics.mean(values) if values else None,
            'spanMs': times[-1] - times[0] if times else 0,
            'over25': sum(v > 25 for v in values)}


def strip_ticks(value):
    if isinstance(value, dict):
        out = {k: strip_ticks(v) for k, v in value.items() if k != 'phaserRenderTimes'}
        if 'phaserRenderTimes' in value:
            out['phaserRenderCallbacks'] = len(value['phaserRenderTimes'])
        return out
    if isinstance(value, list):
        return [strip_ticks(v) for v in value]
    return value


def summarize(path, source_root=None):
    data = json.loads(Path(path).read_text())
    if source_root:
        for name, expected in data['metadata']['sourceHashes'].items():
            actual = hashlib.sha256((Path(source_root) / name).read_bytes()).hexdigest()
            assert actual == expected, ('source-fingerprint', name, actual, expected)
    result = {'scope': data['scope'], 'metadata': data['metadata'],
              'independentChecks': {'untracedRows': 0, 'protocolMetricsPerRow': 7,
                                    'sourceFingerprintsChecked': bool(source_root)},
              'rendererClock': 'Phaser postrender callbacks, not GPU execution or physical presentation',
              'cases': []}
    for case in data['results']:
        variant = case['variant']
        studies = [r['study'] for r in case['warmups'] + case['untraced']] + [case['trace']['study']]
        for study in studies:
            assert not study['errors'] and not study['ink']['errors']
            assert study['active'] == study['ink']['active'] == 0
            if variant in ('phaser', 'phaser-native'):
                assert study['draws'] > 0 and study['prepared'] == 3
                assert study['shared']['ready'] and study['shared']['canvasIsGameCanvas']
                assert study['boardShakes'] == 1 and study['gpu']['sharedContext']
                assert study['gpu']['uploads'] > 0 and not study['gpu']['contextLost']
                assert study['gpu']['glError'] == 0
                assert study['gpu'].get('submittedQuads', study['gpu'].get('drawCalls', 0)) > 0
            if variant == 'gpu-bed-under':
                bed = study['composite']['bed']
                assert bed['enabled'] and bed['frames'] > 0 and bed['activations'] > 0
                assert bed['completions'] > 0 and not bed['active']
                assert not bed['visible'] and not bed['maskVisible']
                assert study['composite']['alpha'] and study['composite']['glError'] == 0
        untraced = []
        for row in case['untraced']:
            sample = row['sample']
            assert len(sample['frames']) == len(sample['frameTimes'])
            assert len(sample['placements']) == 1
            at = sample['placements'][0]['at']
            values = [v for v, t in zip(sample['frames'], sample['frameTimes'])
                      if t > at and t - v < at + 8000]
            checked = metrics(values)
            assert checked == row['metrics'], (variant, checked, row['metrics'])
            assert row['proof']['score'] == row['proof']['shownScore'] == 1574
            assert row['proof']['pendingPoints'] == 0
            assert row['proof']['festival']['spawned'] == 148
            assert row['contexts']['webgl'] == 1
            item = {**checked, 'meanMs': statistics.mean(values),
                    'over25': sum(v > 25 for v in values),
                    'contexts': row['contexts']}
            times = row['study'].get('phaserRenderTimes')
            if times:
                item['phaserPostrender'] = callback_metrics(times)
            untraced.append(item)
            result['independentChecks']['untracedRows'] += 1
        trace = case['trace']
        totals = trace['totals']
        result['cases'].append({
            'index': case['index'], 'variant': variant, 'untraced': untraced,
            'warmups': [{'metrics': r['metrics'], 'study': strip_ticks(r['study'])} for r in case['warmups']],
            'trace': {'uniqueLayerIds': trace['layerCount'],
                      'rasterWorkerWallMs': totals.get('RasterTask', {}).get('wallMs'),
                      'paintWallMs': totals.get('Paint', {}).get('wallMs'),
                      'proof': trace['proof'], 'study': strip_ticks(trace['study'])},
            'errors': case['errors']})
        assert not case['errors']
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('input')
    parser.add_argument('output')
    parser.add_argument('--source-root')
    args = parser.parse_args()
    result = summarize(args.input, args.source_root)
    Path(args.output).write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    for variant in dict.fromkeys(c['variant'] for c in result['cases']):
        rows = [r for c in result['cases'] if c['variant'] == variant for r in c['untraced']]
        print(variant, 'over33', [r['over33'] for r in rows],
              'meanRAF', round(statistics.mean(r['meanMs'] for r in rows), 3),
              'max', round(max(r['maxMs'] for r in rows), 1))
