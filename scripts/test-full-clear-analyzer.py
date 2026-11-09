"""Synthetic archive integrity tests; these do not stand in for a device run."""
import copy
import gzip
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import zipfile

spec = importlib.util.spec_from_file_location('full_analyzer', Path(__file__).with_name('analyze-full-clear.py'))
analyzer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(analyzer)


def fixture():
    episodes, files = [], {}
    orders = [('warmup', None, 'baseline')] * 2
    cases = list(analyzer.CASES)
    for round_number, order in enumerate([cases[1:], cases[:0:-1]]):
        orders.append(('comparison', round_number, 'baseline'))
        for i, condition in enumerate(order):
            orders.append(('comparison', round_number, condition))
            if i % 3 == 2 or i == len(order) - 1:
                orders.append(('comparison', round_number, 'baseline'))
    orders.extend(('attribution', None, name) for name in cases)
    for index, (phase, round_number, name) in enumerate(orders):
        flags = {key: analyzer.CASES[name].get(key, False) for key in analyzer.FLAGS}
        omitted, theme = flags['skipRewardDom'], 1 if flags['freezeTheme'] else 5
        effect = dict(captionAnimations=0 if omitted or flags['skipRewardDecoration'] else 2,
                      visibleEmblems=0, pointFlights=0 if omitted or flags['skipPointFlights'] else 2,
                      hudFlashes=0 if omitted or flags['skipHudFlashes'] else 2,
                      themeNotices=0 if omitted or flags['skipThemeNotice'] or flags['freezeTheme'] else 1,
                      themeImpulses=0 if flags['freezeTheme'] or flags['skipThemeImpulse'] else 1)
        frames = [34.] * (8 if name == 'baseline' else 2) + [16.7] * 480
        times, clock = [], 100.
        for frame in frames:
            clock += frame
            times.append(clock)
        row = dict(condition=dict(id=name, **flags), phase=phase, round=round_number, valid=True,
                   state=dict(proof=dict(score=1574, shownScore=1574, pendingPoints=0, boardEmpty=True,
                              savedTheme=5, renderedTheme=theme, rewardEffects=effect,
                              scene=dict(theme=theme, inkPeak=0 if flags['hideInk'] else 1,
                                         vfxPeak=0 if flags['hideVfx'] else 1),
                              atmosphere=dict(theme=theme, disabled=flags['skipAtmosphere']),
                              festival=dict(theme=theme, disabled=flags['skipFestival'],
                                            spawned=0 if flags['skipFestival'] else 148))),
                   sample=dict(frames=frames, frameTimes=times, placements=[dict(at=100.)]),
                   traceActive=phase == 'attribution')
        proof = row['state']['proof']
        proof['rewardRenderer'] = 'dom'
        proof['rewardDomCreated'] = 0 if omitted else 2 if flags['skipThemeNotice'] or flags['freezeTheme'] else 3
        palette = 1 if flags['freezeDomPalette'] else theme
        proof['atmosphere']['domPaletteTheme'] = palette
        proof['atmosphere']['domPalette'] = {
            1: dict(bg='#f4f3ee', ink='#325376', accent='#72a8ec'),
            5: dict(bg='#233f57', ink='#f2f4f7', accent='#a5e8ef')}[palette]
        proof['scene']['draws'] = 1
        proof['atmosphere']['draws'] = 0 if flags['skipAtmosphere'] else 1
        proof['festival'].update(draws=0 if flags['skipFestival'] else 1,
                                 bursts=0 if flags['skipFestival'] else 2,
                                 activeParticles=0, activeReveals=0)
        row['metrics'] = analyzer.frame_metrics(row)
        if phase == 'attribution':
            directory, capture_id = f'{index:02}-{name}', f'synthetic-{index}'
            label = f'blocky-full:attribution-{index}-{name}:'
            trace = dict(traceEvents=[dict(name=label + 'start', ts=100),
                                      dict(name=label + 'committed', ts=200),
                                      dict(name=label + 'end', ts=8000200),
                                      dict(name='Paint', args=dict(data=dict(nodeId=2))),
                                      dict(name='DrawFn_DrawGL', args={})])
            raw = json.dumps(trace).encode()
            capture = dict(ready=True, captureId=capture_id, directory=directory,
                           rawBytes=len(raw), lossStatusKnownClean=True)
            row['capture'] = capture
            files[directory + '/trace.json.gz'] = gzip.compress(raw)
            files[directory + '/capture.json'] = json.dumps(capture).encode()
            files[directory + '/layers.json'] = json.dumps(dict(nodes=[{}], domSnapshots=[{}], error='')).encode()
        episodes.append(row)
    report = dict(schema='blocky-full-clear-v1', appVersion='0.58.0-preview', sourceCommit='a' * 40,
                  functionalOnly=False, completed=True, protocol=dict(measurementMs=8000),
                  preflight=dict(ready=True, probePaintLayerLinked=True), episodes=episodes)
    return report, files


def archive(path, report, files):
    files = dict(files, **{'report.json': json.dumps(report).encode()})
    manifest = dict(schema='blocky-full-manifest-v1', files=[
        dict(path=name, bytes=len(data), sha256=hashlib.sha256(data).hexdigest())
        for name, data in files.items()])
    with zipfile.ZipFile(path, 'w') as out:
        for name, data in files.items():
            out.writestr(name, data)
        out.writestr('manifest.json', json.dumps(manifest))


class FullArchiveTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / 'synthetic.zip'
        self.report, self.files = fixture()

    def check(self):
        archive(self.path, self.report, self.files)
        return analyzer.validate(self.path)

    def test_complete_and_partial_gates(self):
        result = self.check()
        self.assertEqual((result['episodes'], len(result['captures']), result['issues']), (57, 15, []))
        self.assertTrue(all(x['investigate'] for x in result['comparisons']))
        self.report['completed'] = False
        result = self.check()
        self.assertTrue(result['issues'])
        self.assertFalse(any(x['investigate'] for x in result['comparisons']))

    def test_frame_and_condition_mutations_rejected(self):
        for mutation in ['metric', 'flag', 'order']:
            with self.subTest(mutation=mutation):
                self.report, self.files = fixture()
                if mutation == 'metric':
                    self.report['episodes'][0]['metrics']['over33'] += 1
                elif mutation == 'flag':
                    self.report['episodes'][0]['condition']['skipPointFlights'] = True
                else:
                    self.report['episodes'][2:4] = reversed(self.report['episodes'][2:4])
                with self.assertRaises(AssertionError):
                    self.check()

    def test_logical_failure_not_accepted_from_valid_boolean(self):
        self.report['episodes'][0]['state']['proof']['shownScore'] = 121
        self.assertTrue(self.check()['issues'])

    def test_palette_and_unfinished_effects_rejected(self):
        self.report['episodes'][0]['state']['proof']['atmosphere']['domPalette']['bg'] = '#ffffff'
        self.report['episodes'][0]['state']['proof']['festival']['activeParticles'] = 1
        issues = self.check()['issues']
        self.assertIn('dom-palette', issues[0])
        self.assertIn('unfinished-festival', issues[0])

    def test_stale_capture_rejected(self):
        capture = self.report['episodes'][-1]['capture']
        old = copy.deepcopy(capture)
        old['captureId'] = 'previous-session'
        self.files[capture['directory'] + '/capture.json'] = json.dumps(old).encode()
        with self.assertRaisesRegex(AssertionError, 'Stale capture'):
            self.check()

    def test_manifest_detects_modified_bytes(self):
        archive(self.path, self.report, self.files)
        with zipfile.ZipFile(self.path) as z:
            entries = {name: z.read(name) for name in z.namelist()}
        entries['report.json'] += b' '
        with zipfile.ZipFile(self.path, 'w') as z:
            for name, data in entries.items():
                z.writestr(name, data)
        with self.assertRaisesRegex(AssertionError, 'Manifest hash mismatch'):
            analyzer.validate(self.path)


if __name__ == '__main__':
    unittest.main()
