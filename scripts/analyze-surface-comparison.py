#!/usr/bin/env python3
"""Validate the small 0.62 old/new report without trusting its metrics or verdict."""
import json
import math
import re
import sys

ORDER = ['original', 'generated', 'generated', 'original', 'original', 'generated', 'generated', 'original']

def metrics(frames):
    s = sorted(frames)
    return dict(intervals=len(frames), over33Raw=sum(v > 33.4 for v in frames),
                over33=sum(math.floor(v * 10 + .5) / 10 > 33.4 for v in frames),
                over34=sum(v > 34 for v in frames), over50=sum(v > 50 for v in frames),
                maxMs=max(frames, default=0), p95Ms=s[math.floor(len(s) * .95)] if s else None)

def analyze(report):
    errors = []
    if report.get('schema') != 'blocky-surface-comparison-v1': errors.append('schema')
    rows = report.get('episodes', [])
    physical = report.get('physical') is True and not report.get('functionalOnly', True)
    completed = report.get('completed') is True and not report.get('interrupted')
    if not completed: errors.append('incomplete')
    if len(rows) != 10: errors.append('episode-count')
    if physical and not re.fullmatch(r'[0-9a-f]{40}', report.get('sourceCommit', '')): errors.append('source-commit')
    protocol = report.get('protocol', {})
    if protocol.get('traces') is not False or protocol.get('measurementMs') != 8000: errors.append('protocol')
    wanted = [('warmup', 'original'), ('warmup', 'generated')] + [('comparison', m) for m in ORDER]
    for i, row in enumerate(rows):
        prefix = f'episode-{i}'
        if i >= len(wanted) or (row.get('phase'), row.get('mode')) != wanted[i]: errors.append(prefix + ':order')
        frames = row.get('frameIntervals', [])
        if not frames or any(not isinstance(v, (int, float)) or not math.isfinite(v) or v <= 0 for v in frames):
            errors.append(prefix + ':intervals'); continue
        if metrics(frames) != row.get('metrics'): errors.append(prefix + ':metrics')
        if row.get('valid') is not True or row.get('validation', {}).get('errors') != []: errors.append(prefix + ':validation')
        proof, surfaces = row.get('proof', {}), row.get('surfaces', {})
        festival = proof.get('festival', {})
        if (proof.get('effectProfile'), proof.get('score'), proof.get('shownScore'), proof.get('pendingPoints'), proof.get('savedTheme'), proof.get('renderedTheme'), proof.get('rewardDomCreated')) != ('legacy',1574,1574,0,5,5,3): errors.append(prefix + ':reward-proof')
        if (festival.get('spawned'),festival.get('activeParticles'),festival.get('activeReveals')) != (148,0,0): errors.append(prefix + ':festival-proof')
        if proof.get('scoreGlowProperties') != ['text-shadow','text-shadow']: errors.append(prefix + ':glow-control')
        if surfaces.get('mode') != row.get('mode'): errors.append(prefix + ':surface-mode')
        if row.get('mode') == 'original':
            if surfaces.get('hooksActive') is not False or surfaces.get('activeImages') != 0: errors.append(prefix + ':original-path')
        else:
            if surfaces.get('artReady') is not True or surfaces.get('decodedArt') != 2 or surfaces.get('hooksActive') is not True: errors.append(prefix + ':generated-path')
            for layer in ['page','bed']:
                x=surfaces.get(layer,{})
                if x.get('active') is not False or x.get('target') != '5' or x.get('visibleLayers') != 1: errors.append(prefix + ':' + layer)
    before_device, after_device = report.get("deviceStart") or {}, report.get("deviceEnd") or {}
    sdk=before_device.get("sdk")
    device_stable=(isinstance(sdk,int) and sdk==after_device.get("sdk") and (sdk<26 or isinstance(before_device.get("webViewVersion"),str) and before_device.get("webViewVersion")==after_device.get("webViewVersion")) and (sdk<29 or before_device.get("thermalStatus")==0 and after_device.get("thermalStatus")==0))
    if "deviceStable" in report and device_stable is not report["deviceStable"]: errors.append("device-stability")
    samples = rows[2:]
    orders=[]
    for direction in [0,1]:
        selected=[r for pair in [direction,direction+2] for r in samples[pair*2:pair*2+2]]
        old=[r for r in selected if r.get('mode')=='original']; new=[r for r in selected if r.get('mode')=='generated']
        complete=len(old)==len(new)==2
        before=sum(r['metrics']['over33'] for r in old)/2 if complete else None
        after=sum(r['metrics']['over33'] for r in new)/2 if complete else None
        stable=complete and abs(old[0]['metrics']['over33']-old[1]['metrics']['over33'])<=max(2,before*.5)
        comparable=physical and device_stable and completed and complete and all(r.get('valid') and r['metrics']['intervals']>=100 for r in selected)
        meets=comparable and stable and before>=2 and after<=before*.75 and max(r['metrics']['maxMs'] for r in new)<=max(r['metrics']['maxMs'] for r in old)+1
        orders.append(dict(direction='original-first' if direction==0 else 'generated-first',comparable=comparable,baselineStable=stable,beforeMean=before,candidateMean=after,meetsTarget=meets))
    summary=dict(orders=orders,improved=len(samples)==8 and [r.get('mode') for r in samples]==ORDER and all(r['meetsTarget'] for r in orders))
    if summary != report.get('summary'): errors.append('summary')
    return dict(valid=not errors,errors=errors,physical=physical,completed=completed,summary=summary)

if __name__ == '__main__':
    with open(sys.argv[1],encoding='utf-8') as f: result=analyze(json.load(f))
    print(json.dumps(result,ensure_ascii=False,indent=2))
    sys.exit(0 if result['valid'] else 1)
