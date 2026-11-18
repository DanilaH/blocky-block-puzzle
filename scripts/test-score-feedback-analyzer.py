"""Synthetic integrity checks; actual Android archives are validated separately."""
import copy
import runpy
from pathlib import Path
import tempfile
import unittest

full = runpy.run_path(str(Path(__file__).with_name('test-full-clear-analyzer.py')))
analyzer = runpy.run_path(str(Path(__file__).with_name('analyze-score-feedback.py')))


def fixture():
    report, _ = full['fixture']()
    base = report['episodes'][0]
    report.update(schema='blocky-score-feedback-v1', appVersion='0.60.0-preview',
                  protocol=dict(measurementMs=8000, nativeTracesUsed=False, attributionOrder=[]))
    rows = []
    for i, variant in enumerate(['legacy', 'filter'] + analyzer['PLAN']):
        row = copy.deepcopy(base)
        row.update(phase='warmup' if i < 2 else 'comparison', scoreFeedback=variant)
        row['state']['proof']['scoreGlowProperties'] = [
            'filter' if variant == 'filter' else 'text-shadow'] * 2
        rows.append(row)
    report['episodes'] = rows
    report['summary'] = dict(improved=False)
    return report


class ScoreArchiveTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / 'score.zip'
        self.report = fixture()

    def check(self, files=None):
        full['archive'](self.path, self.report, files or {})
        return analyzer['validate'](self.path)

    def test_complete_small_untraced_archive(self):
        result = self.check()
        self.assertEqual((result['episodes'], result['issues'], result['improved']), (10, [], False))

    def test_metric_mode_effect_and_native_claims_need_evidence(self):
        mutations = [
            lambda r: r['episodes'][2]['metrics'].update(over33=0),
            lambda r: r['episodes'][2]['state']['proof'].update(scoreGlowProperties=['filter'] * 2),
            lambda r: r['episodes'][2]['state']['proof']['rewardEffects'].update(pointFlights=0),
            lambda r: r['episodes'][2].update(traceActive=True),
            lambda r: r['session']['nativeAds'].update(loadingRewarded=True),
            lambda r: r['summary'].update(improved=True),
            lambda r: r['episodes'].reverse(),
        ]
        for mutation in mutations:
            self.report = fixture()
            mutation(self.report)
            with self.subTest(mutation=mutations.index(mutation)), self.assertRaises(AssertionError):
                self.check()

    def test_traces_cannot_hide_in_the_small_export(self):
        with self.assertRaisesRegex(AssertionError, 'Unexpected traces'):
            self.check({'trace.json.gz': b'trace'})

    def test_partial_session_cannot_nominate(self):
        self.report['completed'] = False
        self.report['episodes'] = self.report['episodes'][:5]
        result = self.check()
        self.assertTrue(result['issues'])
        self.assertFalse(result['improved'])


if __name__ == '__main__':
    unittest.main()
