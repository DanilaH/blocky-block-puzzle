"""Verify one full diagnostic export, its comparison brackets and all CDP files."""
from pathlib import Path, PurePosixPath
import gzip, hashlib, io, json, math, sys, zipfile

FLAGS=['hideInk','hideVfx','skipFestival','skipAtmosphere','skipRewardDom','freezeTheme','skipHudFlashes','skipRewardDecoration','freezeDomPalette','skipThemeNotice','skipPointFlights','skipThemeImpulse']
CASES={
 'baseline':{},'no-hud-flashes':{'skipHudFlashes':True},'no-reward-decoration':{'skipRewardDecoration':True},'no-dom-palette':{'freezeDomPalette':True},'no-theme-notice':{'skipThemeNotice':True},
 'no-point-flights':{'skipPointFlights':True},'no-theme-impulse':{'skipThemeImpulse':True},'no-flight-or-theme-impulse':{'skipPointFlights':True,'skipThemeImpulse':True},
 'no-reward-dom':{'skipRewardDom':True},'no-theme':{'freezeTheme':True},'no-reward-or-theme':{'skipRewardDom':True,'freezeTheme':True},
 'no-ink':{'hideInk':True},'no-board-vfx':{'hideVfx':True},'no-festival':{'skipFestival':True},'no-atmosphere':{'skipAtmosphere':True}}

def frame_metrics(row,high=8000):
 s=row['sample'];at=s['placements'][0]['at'];fs=[x for x,t in zip(s['frames'],s['frameTimes']) if t>at and t-x<at+high]
 return dict(intervals=len(fs),over33Raw=sum(x>33.4 for x in fs),over33=sum(math.floor(x*10+.5)/10>33.4 for x in fs),over34=sum(x>34 for x in fs),over50=sum(x>50 for x in fs),maxMs=max(fs,default=0),p95Ms=sorted(fs)[math.floor(len(fs)*.95)] if fs else None)

def validate(path):
 issues=[]
 with zipfile.ZipFile(path) as z:
  infos=z.infolist();names=[x.filename for x in infos]
  assert len(names)==len(set(names)),'Duplicate ZIP paths'
  assert len(names)<200 and sum(x.file_size for x in infos)<400*1024*1024,'Archive limits'
  assert all(not PurePosixPath(n).is_absolute() and '..' not in PurePosixPath(n).parts and '\\' not in n for n in names),'Unsafe ZIP path'
  manifest=json.loads(z.read('manifest.json'));assert manifest['schema']=='blocky-full-manifest-v1'
  assert {x['path'] for x in manifest['files']}==set(names)-{'manifest.json'},'Manifest omissions'
  for f in manifest['files']:
   raw=z.read(f['path']);assert len(raw)==f['bytes'] and hashlib.sha256(raw).hexdigest()==f['sha256'],'Manifest hash mismatch: '+f['path']
  r=json.loads(z.read('report.json'));assert r['schema']=='blocky-full-clear-v1'
  assert r['appVersion']=='0.58.0-preview'
  functional=r['functionalOnly'];complete=r['completed'];episodes=r['episodes'];duration=r['protocol']['measurementMs']
  assert functional or (len(r['sourceCommit'])==40 and all(c in '0123456789abcdef' for c in r['sourceCommit'])),'Source identity'
  expected=[];candidates=list(CASES)[1:]
  for round,order in enumerate([candidates,list(reversed(candidates))]):
   expected.append((round,'baseline'))
   for i,condition in enumerate(order):
    expected.append((round,condition))
    if i%3==2 or i==len(order)-1:expected.append((round,'baseline'))
  comparisons=[e for e in episodes if e['phase']=='comparison']
  if complete:
   assert len(episodes)==57 and len(comparisons)==40
   assert [(e['round'],e['condition']['id']) for e in comparisons]==expected,'Wrong comparison order'
   assert [e['condition']['id'] for e in episodes if e['phase']=='attribution']==list(CASES)
   assert all(e['valid'] for e in episodes),'Complete report contains invalid episodes'
   assert r['preflight']['ready'] and r['preflight']['probePaintLayerLinked']
   if not functional:
    ads=r['session']['nativeAds'];assert ads['suspended'] and not any(ads[k] for k in ['bannerPresent','loadingInterstitial','loadingRewarded']),'Native ads not suspended'
    pre=r['preflight'];directory=pre['directory'];assert '/' not in directory and directory not in ['.','..']
    saved=json.loads(z.read(directory+'/capture.json'));assert saved['captureId']==pre['captureId'] and saved['ready'],'Stale preflight'
    with gzip.GzipFile(fileobj=io.BytesIO(z.read(directory+'/trace.json.gz'))) as g:pre_raw=g.read(128*1024*1024+1)
    assert len(pre_raw)==pre['rawBytes'] and len(pre_raw)<=128*1024*1024
    pre_events=json.loads(pre_raw)['traceEvents'];mapping=json.loads(z.read(directory+'/layers.json'))
    nodes={n['node']['backendNodeId'] for n in mapping['nodes'] if n.get('node') and 'blocky-cdp-probe' in n['node'].get('attributes',[])}
    layers={str(l['layerId']) for e in mapping['layers'] for l in e['params'].get('layers',[]) if l.get('backendNodeId') in nodes}
    painted_layers={str(e['params']['layerId']) for e in mapping['layers'] if e['method']=='LayerTree.layerPainted'}
    paints=[e.get('args',{}).get('data',{}) for e in pre_events if e.get('name')=='Paint']
    assert layers & painted_layers and any(p.get('nodeId') in nodes or str(p.get('layerId')) in layers for p in paints),'Known probe not actually painted'
    assert any(e.get('name','').startswith('DrawFn_Draw') for e in pre_events) and any(e.get('ph') in ['s','f'] for e in pre_events),'Native preflight attribution missing'
  else:issues.append('incomplete-session:'+str(r.get('failure','one-or-more-invalid-episodes')))
  rows=[];captures=[]
  for index,e in enumerate(episodes):
   condition=e['condition']['id'];assert condition in CASES
   flags={key:bool(e['condition'][key]) for key in FLAGS};assert flags=={key:CASES[condition].get(key,False) for key in FLAGS},'Wrong condition flags'
   proof=e['state']['proof'];omit=flags['skipRewardDom'];theme=1 if flags['freezeTheme'] else 5
   errors=[]
   if proof['score']!=1574 or proof['shownScore']!=1574 or proof['pendingPoints']!=0 or not proof['boardEmpty'] or proof['savedTheme']!=5:errors.append('logical-score')
   if any(x!=theme for x in [proof['renderedTheme'],proof['scene']['theme'],proof['atmosphere']['theme'],proof['festival']['theme']]):errors.append('theme-target')
   effects=proof['rewardEffects'];expected_effects=dict(captionAnimations=0 if omit or flags['skipRewardDecoration'] else 2,visibleEmblems=0,pointFlights=0 if omit or flags['skipPointFlights'] else 2,hudFlashes=0 if omit or flags['skipHudFlashes'] else 2,themeNotices=0 if omit or flags['skipThemeNotice'] or flags['freezeTheme'] else 1,themeImpulses=0 if flags['freezeTheme'] or flags['skipThemeImpulse'] else 1)
   if effects!=expected_effects:errors.append('effect-output')
   if proof['festival']['spawned']!=(0 if flags['skipFestival'] else 148):errors.append('particle-count')
   if bool(proof['scene']['inkPeak']==0)!=flags['hideInk'] or bool(proof['scene']['vfxPeak']==0)!=flags['hideVfx']:errors.append('board-output')
   if proof['atmosphere']['disabled']!=flags['skipAtmosphere'] or proof['festival']['disabled']!=flags['skipFestival']:errors.append('external-layer-output')
   if proof.get('rewardRenderer')!='dom' or proof.get('rewardDomCreated')!=(0 if omit else 2 if omit or flags['skipThemeNotice'] or flags['freezeTheme'] else 3):errors.append('reward-dom-path')
   palette=1 if flags['freezeDomPalette'] else theme
   colors={1:dict(bg='#f4f3ee',ink='#325376',accent='#72a8ec'),5:dict(bg='#233f57',ink='#f2f4f7',accent='#a5e8ef')}
   if proof['atmosphere'].get('domPaletteTheme')!=palette or proof['atmosphere'].get('domPalette')!=colors[palette]:errors.append('dom-palette')
   if not proof['scene'].get('draws') or (proof['atmosphere'].get('draws',0)==0)!=flags['skipAtmosphere'] or (proof['festival'].get('draws',0)==0)!=flags['skipFestival'] or proof['festival'].get('bursts')!=(0 if flags['skipFestival'] else 2):errors.append('renderer-not-drawn')
   if not functional and (proof['festival'].get('activeParticles')!=0 or proof['festival'].get('activeReveals')!=0):errors.append('unfinished-festival')
   assert len(e['sample']['placements'])==1
   frames=e['sample']['frames'];times=e['sample']['frameTimes']
   assert len(frames)==len(times) and frames and all(math.isfinite(x) and x>0 for x in frames),'Invalid frame intervals'
   assert all(math.isfinite(t) for t in times) and all(a<b for a,b in zip(times,times[1:])),'Invalid frame timestamps'
   if not functional and times[-1]-e['sample']['placements'][0]['at']<7900:errors.append('measurement-window')
   m=frame_metrics(e,duration)
   for key,value in m.items():
    actual=e['metrics'][key];assert actual==value or isinstance(actual,(float,int)) and isinstance(value,(float,int)) and abs(actual-value)<1e-5, 'Metric mismatch: '+key
   assert e['traceActive']==(e['phase']=='attribution')
   if errors:issues.append(condition+':'+','.join(errors))
   if e['phase']=='attribution' and e.get('capture',{}).get('ready'):
    c=e['capture'];directory=c['directory'];assert '/' not in directory and directory not in ['.','..']
    saved=json.loads(z.read(directory+'/capture.json'));assert saved['captureId']==c['captureId'] and saved['ready']==c['ready'],'Stale capture'
    with gzip.GzipFile(fileobj=io.BytesIO(z.read(directory+'/trace.json.gz'))) as g:raw=g.read(128*1024*1024+1)
    assert len(raw)==c['rawBytes'] and len(raw)<=128*1024*1024,'Trace size mismatch'
    trace=json.loads(raw);es=trace['traceEvents'];label=f'blocky-full:attribution-{index}-{condition}:'
    marks={x['name']:x for x in es if x.get('name','').startswith(label)}
    assert all(label+k in marks for k in ['start','committed','end']),'Missing named app marks'
    assert marks[label+'end']['ts']-marks[label+'committed']['ts']>=7900000 or functional,'Short trace window'
    paint=sum(x.get('name')=='Paint' for x in es);native=sum(x.get('name','').startswith('DrawFn_Draw') for x in es)
    mapping=json.loads(z.read(directory+'/layers.json'));assert mapping['nodes'] and mapping['domSnapshots'] and not mapping['error'],'Missing layer/DOM mapping'
    assert paint>0 and native>0 and c['lossStatusKnownClean'] or functional,'No native attribution'
    captures.append(dict(condition=condition,captureId=c['captureId'],directory=directory,traceSha256=hashlib.sha256(raw).hexdigest(),events=len(es),paint=paint,nativeDraws=native,nodeRecords=len(mapping['nodes']),snapshots=len(mapping['domSnapshots']),compositingReasons=len(mapping.get('compositingReasons',[]))))
   elif e['phase']=='attribution':issues.append(condition+':attribution-incomplete')
   rows.append(dict(condition=condition,round=e.get('round'),phase=e['phase'],valid=e['valid'] and not errors,metrics=m))
  if complete:assert len(captures)==15 or functional,'Missing completed captures'
  summary=[]
  for condition in candidates:
   rounds=[]
   for round in [0,1]:
    xs=[x for x in rows if x['phase']=='comparison' and x['round']==round];i=next((i for i,x in enumerate(xs) if x['condition']==condition),-1)
    if i<0:rounds.append({'round':round,'comparable':False});continue
    before=next((x for x in reversed(xs[:i]) if x['condition']=='baseline'),None);after=next((x for x in xs[i+1:] if x['condition']=='baseline'),None);candidate=xs[i]
    if not before or not after:rounds.append({'round':round,'comparable':False});continue
    a,b,c=(x['metrics'] for x in [before,after,candidate]);ref=(a['over33']+b['over33'])/2;stable=abs(a['over33']-b['over33'])<=max(2,ref*.5)
    comparable=not functional and all(x['valid'] for x in [before,after,candidate]) and min(x['intervals'] for x in [a,b,c])>=100
    rounds.append(dict(round=round,comparable=comparable,before=a,after=b,candidate=c,baselineStable=stable,meetsTarget=comparable and stable and ref>=2 and c['over33']<=ref/2 and c['maxMs']<=max(a['maxMs'],b['maxMs'])+1))
   summary.append(dict(condition=condition,rounds=rounds,investigate=complete and all(x.get('meetsTarget',False) for x in rounds)))
  return dict(schema='blocky-full-analysis-v1',inputZipSha256=hashlib.sha256(path.read_bytes()).hexdigest(),appVersion=r['appVersion'],sourceCommit=r['sourceCommit'],completed=complete,functionalOnly=functional,episodes=len(rows),captures=captures,issues=issues,comparisons=summary,scope='Ablations nominate investigation; traced data locates work and is not an FPS A/B. No shipping optimization accepted by this analyzer.')

if __name__=='__main__':
 source,output=map(Path,sys.argv[1:3]);result=validate(source);output.parent.mkdir(parents=True,exist_ok=True);output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps({k:result[k] for k in ['completed','functionalOnly','episodes','issues']}));
 if not result['completed'] or result['issues']:sys.exit(2)
