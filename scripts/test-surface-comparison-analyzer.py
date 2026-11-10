import copy
import importlib.util
import unittest
spec=importlib.util.spec_from_file_location('surface_analyzer','scripts/analyze-surface-comparison.py');mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)

def fixture():
    rows=[]
    for i,mode in enumerate(['original','generated']+mod.ORDER):
        frames=[16.7]*480+[40.]*(12 if mode=='original' else 5)
        proof=dict(effectProfile='legacy',score=1574,shownScore=1574,pendingPoints=0,savedTheme=5,renderedTheme=5,rewardDomCreated=3,festival=dict(spawned=148,activeParticles=0,activeReveals=0),scoreGlowProperties=['text-shadow','text-shadow'])
        layer=dict(active=False,target='5',visibleLayers=1)
        surface=dict(mode=mode,artReady=True,decodedArt=2,hooksActive=mode=='generated',activeImages=1 if mode=='generated' else 0,page=layer,bed=layer)
        rows.append(dict(mode=mode,phase='warmup' if i<2 else 'comparison',valid=True,validation=dict(errors=[]),frameIntervals=frames,metrics=mod.metrics(frames),proof=proof,surfaces=surface))
    r=dict(schema='blocky-surface-comparison-v1',physical=True,functionalOnly=False,sourceCommit='a'*40,completed=True,interrupted=False,protocol=dict(traces=False,measurementMs=8000),episodes=rows)
    r.update(deviceStart=dict(sdk=35,webViewVersion='156',thermalStatus=0),deviceEnd=dict(sdk=35,webViewVersion='156',thermalStatus=0),deviceStable=True)
    r['summary']=mod.analyze(r)['summary']
    return r

class AnalyzerTests(unittest.TestCase):
    def test_physical_both_orders(self):
        r=mod.analyze(fixture());self.assertTrue(r['valid']);self.assertTrue(r['summary']['improved'])
    def test_tampered_metrics(self):
        r=fixture();r['episodes'][2]['metrics']['over33']=1;self.assertFalse(mod.analyze(r)['valid'])
    def test_wrong_actual_path(self):
        r=fixture();r['episodes'][3]['surfaces']['mode']='original';self.assertFalse(mod.analyze(r)['valid'])
    def test_truncated(self):
        r=fixture();r['episodes'].pop();self.assertFalse(mod.analyze(r)['valid'])
    def test_browser_cannot_be_physical_win(self):
        r=fixture();r.update(physical=False,functionalOnly=True);r['summary']=mod.analyze(r)['summary'];a=mod.analyze(r);self.assertTrue(a['valid']);self.assertFalse(a['summary']['improved'])
    def test_tail_regression(self):
        r=fixture();row=r['episodes'][3];row['frameIntervals'].append(100.);row['metrics']=mod.metrics(row['frameIntervals']);r['summary']=mod.analyze(r)['summary'];a=mod.analyze(r);self.assertTrue(a['valid']);self.assertFalse(a['summary']['improved'])

unittest.main()
