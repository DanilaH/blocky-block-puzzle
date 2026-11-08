#!/usr/bin/env python3
"""Recompute phone layer metrics without publishing the original capture.

Usage: python scripts/analyze-phone-layers.py capture.zip output.json
The output contains aggregates and input hashes, not raw frames/native events.
"""
import hashlib
import json
import math
import re
import statistics
import sys
import zipfile
from pathlib import Path


def metrics(sample):
    at = sample["placements"][0]["at"]
    frames, times = sample["frames"], sample["frameTimes"]
    assert len(frames) == len(times) and all(math.isfinite(x) and x > 0 for x in frames)
    assert all(b > a for a, b in zip(times, times[1:]))
    assert all(abs((times[i] - times[i - 1]) - frames[i]) < 0.01 for i in range(1, len(times)))
    selected = [ms for ms, end in zip(frames, times) if end > at and end - ms < at + 2400]
    ordered = sorted(selected)
    return dict(intervals=len(selected), over33=sum(x > 33.4 for x in selected),
                over50=sum(x > 50 for x in selected), maxMs=max(selected),
                p95Ms=ordered[math.floor(len(ordered) * 0.95)])


def leaves(value, prefix=""):
    if isinstance(value, dict):
        for key, child in value.items():
            yield from leaves(child, f"{prefix}.{key}" if prefix else key)
    elif isinstance(value, list):
        for i, child in enumerate(value):
            yield from leaves(child, f"{prefix}[{i}]")
    elif isinstance(value, (int, float)):
        yield prefix, value


def analyze(path):
    with zipfile.ZipFile(path) as archive:
        parts = {Path(n).name: archive.read(n) for n in archive.namelist() if n.endswith('.json')}
    report = json.loads(parts['report.json'])
    native = json.loads(parts['native-status.json'])
    trace = json.loads(parts['webview-trace.json'])
    assert report['schema'] == 'blocky-phone-layers-v2'
    assert report['completed'] and not report['interrupted'] and report['screenAwake']
    assert report['appVersion'] == '0.56.0-preview'
    assert not report['protocol']['functionalOnly']
    assert report['protocol']['measurementMs'] == 2400
    assert len(report['episodes']) == 20
    assert native == report['trace'] and native['ready'] and not native['recording']
    assert native['error'] == '' and native['captureId']
    assert native['bytes'] == len(parts['webview-trace.json'])
    rows, hot = [], []
    geometry = None
    for episode in report['episodes']:
        condition = episode['condition']
        proof = episode['state']['proof']
        raster = episode['state']['rewardRasters']
        context = episode['sample']['context']
        measured = metrics(episode['sample'])
        assert episode['validation'] == {'valid': True, 'errors': []}
        assert proof['score'] == proof['shownScore'] == 1574 and proof['pendingPoints'] == 0
        assert proof['boardEmpty'] and proof['savedTheme'] == 5
        assert proof['renderedTheme'] == (1 if condition['freezeTheme'] else 5)
        assert proof['scene']['draws'] > 0
        assert (proof['scene']['inkPeak'] == 0) == condition['hideInk']
        assert (proof['scene']['vfxPeak'] == 0) == condition['hideVfx']
        for name, flag in [('festival', 'skipFestival'), ('atmosphere', 'skipAtmosphere')]:
            assert proof[name]['disabled'] == condition[flag]
            assert (proof[name]['draws'] == 0) == condition[flag]
        assert proof['festival']['spawned'] == (0 if condition['skipFestival'] else 148)
        assert proof['festival']['bursts'] == (0 if condition['skipFestival'] else 2)
        assert proof['rewardDomCreated'] == (0 if condition['skipRewardDom'] else 2 if condition['freezeTheme'] else 3)
        assert raster == proof['rewardRasters'] and raster['fallbacks'] == 0
        assert raster['prepared'] == (0 if condition['skipRewardDom'] or condition['legacyRewardText'] else 4)
        assert raster['clockActive'] is False and raster['bytes'] <= 28 * 1024 * 1024
        current_geometry = [context['canvas'], proof['festival']['canvas'], proof['atmosphere']['canvas']]
        if geometry is None:
            geometry = current_geometry
        assert geometry == current_geometry
        if episode['phase'] == 'comparison':
            assert not episode['traceActive']
            if raster['prepared']:
                hot.append(raster)
        else:
            assert episode['traceActive'] == (episode['phase'] == 'trace')
        at = episode['sample']['placements'][0]['at']
        # Disjoint bins by interval end; these are a localization aid, not the
        # overlap rule used by the primary full-window comparison.
        bins = [sum(ms > 33.4 for ms, end in zip(episode['sample']['frames'], episode['sample']['frameTimes'])
                    if at + low < end <= at + high) for low, high in [(0, 320), (320, 1400), (1400, 2400)]]
        rows.append(dict(kind=episode['kind'], phase=episode['phase'], round=episode.get('round'),
                         condition=condition['id'], **measured, over33ByEndWindow=bins,
                         rewardDomCreated=proof['rewardDomCreated'], rewardRasters=raster,
                         renderedTheme=proof['renderedTheme'], savedTheme=proof['savedTheme'],
                         shownScore=proof['shownScore'], pendingPoints=proof['pendingPoints'],
                         spawnedFestival=proof['festival']['spawned'], valid=True))
    comparisons = []
    for entry in report['summary']['rows']:
        computed_rounds = []
        for round_index in [0, 1]:
            series = [e for e in rows if e['phase'] == 'comparison' and e['round'] == round_index]
            candidate = next(e for e in series if e['condition'] == entry['condition'])
            before, after = series[0], series[-1]
            assert before['condition'] == after['condition'] == 'baseline'
            ref = (before['over33'] + after['over33']) / 2
            stable = abs(before['over33'] - after['over33']) <= max(2, ref * .5)
            target = (stable and min(e['intervals'] for e in [before, after, candidate]) >= 10
                      and ref >= 2 and candidate['over33'] <= ref / 2
                      and candidate['maxMs'] <= max(before['maxMs'], after['maxMs']) + 1)
            embedded = entry['rounds'][round_index]
            for name, actual in [('before', before), ('after', after), ('candidate', candidate)]:
                assert all(abs(embedded[name][key] - actual[key]) < 1e-6
                           for key in ['intervals', 'over33', 'over50', 'maxMs', 'p95Ms'])
            assert embedded['meetsTarget'] == target and embedded['baselineStable'] == stable
            computed_rounds.append(dict(round=round_index, beforeOver33=before['over33'],
                                        afterOver33=after['over33'], candidateOver33=candidate['over33'],
                                        referenceOver33=ref, reductionOver33=1 - candidate['over33'] / ref,
                                        baselineStable=stable, meetsTarget=target))
        investigate = all(r['meetsTarget'] for r in computed_rounds)
        assert entry['investigate'] == investigate
        comparisons.append(dict(condition=entry['condition'], rounds=computed_rounds, investigate=investigate))
    events = trace['traceEvents']
    marks = sorted((e for e in events if e.get('cat') == 'blink.user_timing'), key=lambda e: e['ts'])
    assert len(marks) == 3 and all(e['name'] == 'performance.mark' for e in marks)
    deltas = [(marks[i + 1]['ts'] - marks[i]['ts']) / 1000 for i in range(2)]
    assert 0 < deltas[0] < 1000 and 2400 <= deltas[1] < 2600
    # Names were anonymized by WebView; identity is inferred from ordering and
    # duration, not directly recovered from a named blocky mark.
    at = marks[1]['ts']
    names = ['Blink.Style.UpdateTime', 'Blink.ForcedStyleAndLayout.UpdateTime',
             'FrameRequestCallbackCollection::ExecuteFrameCallbacks', 'Blink.Layout.UpdateTime',
             'LocalFrameView::RunPaintLifecyclePhase', 'DrawFn_DrawGL', 'ScheduleOnVizAndBlock']
    windows = []
    for low, high in [(0, 320), (320, 1400), (1400, 2400)]:
        costs = {}
        for name in names:
            spans = [e['dur'] / 1000 for e in events if e.get('ph') == 'X' and e['name'] == name
                     and at + low * 1000 <= e['ts'] < at + high * 1000]
            costs[name] = dict(count=len(spans), wallMs=round(sum(spans), 3), maxMs=round(max(spans, default=0), 3))
        windows.append(dict(afterCommitMs=[low, high], metrics=costs))
    counters = {key: value for key, value in leaves(trace['metadata']['trace_processor_stats'])
                if re.search(r'pars.*error|packet_loss|dataloss|lost|overwrit|discard|overrun|abi_violations|patches_failed|readaheads_failed', key)}
    assert len(counters) >= 25 and all(v == 0 for v in counters.values())
    clean_context = {k: v for k, v in report['episodes'][1]['sample']['context'].items() if k != 'userAgent'}
    return dict(sourceVersion=report['appVersion'], sourceCommit='561b6efd846d728c53397f74171d1af495c12c0e',
                sourceCommitBasis='Delivered APK verification, not embedded in report',
                inputZipSha256=hashlib.sha256(path.read_bytes()).hexdigest(),
                memberSha256={k: hashlib.sha256(v).hexdigest() for k, v in parts.items()},
                completed=True, interrupted=False, validEpisodes=len(rows), elapsedMs=report['elapsedMs'],
                screenAwake=True, context=clean_context, geometry=geometry, frameWindowMs=2400,
                metricRule='Intervals overlapping [placement, placement+2400ms); RAF, not presentation/GPU timing',
                episodes=rows, comparisons=comparisons,
                nominatedLayers=[r['condition'] for r in comparisons if r['investigate']],
                hotRasterPreparation=dict(episodes=len(hot), totalPrepareMedianMs=statistics.median(r['prepareMs'] for r in hot),
                                          totalPrepareMinMs=min(r['prepareMs'] for r in hot),
                                          totalPrepareMaxMs=max(r['prepareMs'] for r in hot),
                                          maxSinglePrepareMs=max(r['maxPrepareMs'] for r in hot),
                                          copyMedianMs=statistics.median(r['copyMs'] for r in hot),
                                          peakEstimatedRgbaBytes=max(r['peakBytes'] for r in hot),
                                          allCacheHits15Misses0=all(r['cacheHits'] == 15 and r['cacheMisses'] == 0 for r in hot)),
                nativeTraceBytes=len(parts['webview-trace.json']), nativeTraceEvents=len(events),
                currentCaptureConfirmed=True, genericMarkDeltasMs=deltas,
                markMapping='Inferred start/committed/end from order/duration; names anonymized',
                parserAndBufferLossCounters=counters, nativeWindows=windows,
                conclusion='Reward raster optimization not accepted: no consistent same-capture advantage over legacy text',
                limitations=['One device/capture, two reversed passes; no temperature/frequency telemetry',
                             'Whole reward ablation includes emblem, label, flight, HUD notices and flashes',
                             'No-theme freezes all presentation palettes and also omits the theme notice',
                             'Native tracing is final baseline only; category wall spans overlap and cannot be added',
                             'Comparison to 0.55 is cross-session; does not isolate the Classic CSS change'])


if __name__ == '__main__':
    source, output = map(Path, sys.argv[1:3])
    result = analyze(source)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({k: result[k] for k in ['sourceVersion', 'validEpisodes', 'inputZipSha256', 'nominatedLayers', 'conclusion']}))
