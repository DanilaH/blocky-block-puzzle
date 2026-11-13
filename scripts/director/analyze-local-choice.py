"""Independent D79 model metrics and unchanged per-split gates."""
import collections,gzip,hashlib,json,math,pathlib,statistics
root=pathlib.Path('docs/qa/local-choice')
def q(a,p=.9):
 a=sorted(a);return a[max(0,math.ceil(len(a)*p)-1)] if a else None
out={'dataSha256':{},'groups':{},'gates':{},'coverage':{}}
for stage in ['engineering','holdout']:
 p=root/(stage+'.json.gz')
 if not p.exists():continue
 raw=p.read_bytes();data=json.loads(gzip.decompress(raw));out['dataSha256'][stage]=hashlib.sha256(raw).hexdigest()
 groups=collections.defaultdict(list)
 for r in data['runs']:
  assert len(r['events'])==len(r['actions'])==r['moves'];assert r['ended']!=r['censored']
  groups[(r['split'],r['policy'],r['style'])].append(r)
 for key,rs in groups.items():
  ds=[d for r in rs for d in r['deals']];ev=[e for r in rs for e in r['events']];gaps=[];terminal=[];first=[];repeats=0
  for r in rs:
   last=0
   for i,e in enumerate(r['events'],1):
    if e[0]:gaps.append(i-last);last=i
   terminal.append(r['moves']-last);first.append(next((i for i,e in enumerate(r['events'],1) if e[0]),None))
   bags=[','.join(sorted(s['shapeId'].split('-')[0] for s in d['tray'])) for d in r['deals']]
   repeats+=sum(a==b for a,b in zip(bags,bags[1:]))
  intro=[d for d in ds if d['move']<9];ms=[t['ms'] for t in data['timings'] if (t['split'],t['policy'],t['style'])==key]
  out['groups'][':'.join(key)]={
   'n':len(rs),'moves':len(ev),'lengths':[r['moves'] for r in rs],'medianObservedMoves':statistics.median(r['moves'] for r in rs),'ended':sum(r['ended'] for r in rs),'censored':sum(r['censored'] for r in rs),
   'lines':sum(e[0] for e in ev),'linesPerMove':sum(e[0] for e in ev)/len(ev),'allClears':sum(e[1] for e in ev),'allClearRate':sum(e[1] for e in ev)/len(ev),
   'rewardBy60':sum(any(e[1] for e in r['events'][:60]) for r in rs),'rewardAfter12':sum(any(e[1] for e in r['events'][12:]) for r in rs),
   'lineGapP90':q(gaps),'terminalDroughtP90':q(terminal),'firstLineBy12':sum(x is not None and x<=12 for x in first),'deathsBefore9':sum(r['ended'] and r['moves']<9 for r in rs),
   'broad':sum(d['broad']['safe'] for d in ds)/len(ds),'introBroad':sum(d['broad']['safe'] for d in intro)/len(intro),'fallback':sum(d['fallback'] for d in ds),'deals':len(ds),
   'weakAssessments':sum(bool((d['diagnostic']or{}).get('weakAssessment')) for d in ds),'maxWork':max((d['diagnostic']or{}).get('checks',0) for d in ds),
   'adjacentBagRepeats':repeats,'medianMs':statistics.median(ms),'p95Ms':q(ms,.95),'maxMs':max(ms)}
  if key[1]=='local-choice':
   c=collections.Counter()
   for r in rs:
    for d in r['deals']:
     start=d['move'];pool=(d['diagnostic']or{}).get('pool',[]);chosen=(d['diagnostic']or{}).get('chosen',-1)
     if start>=r['moves'] or chosen<0:continue
     c['offered']+=1;assessment=pool[chosen];a=r['actions'][start];same=lambda m,a:[m['slot'],m['x'],m['y']]==a
     first=next((x for x in assessment['roots'] if same(x['move'],a)),None)
     c['firstCovered']+=first is not None
     if start+1<r['moves']:
      c['twoActions']+=1;c['secondCovered']+=bool(first and any(same(s['move'],r['actions'][start+1]) for s in first['seconds']))
     c['earned']+=any(e[1] for e in r['events'][start:start+3]);c['exactOffers']+=assessment['source']=='current-all-clear'
   out['coverage'][':'.join(key)]=dict(c)
 if stage=='holdout':
  for split in ['development','confirmation']:
   gates={}
   for style in ['clear','space','two','three','bounded','lapse']:
    c=out['groups'][f'{split}:local-choice:{style}'];b=out['groups'][f'{split}:director-v2:{style}']
    tests={'broad':c['broad']>=.9,'introBroad':c['introBroad']>=.95,'fallback':c['fallback']/c['deals']<=.05,
     'lineFlow':c['linesPerMove']>=.8*b['linesPerMove'],'lineGap':c['lineGapP90'] is not None and b['lineGapP90'] is not None and c['lineGapP90']<=b['lineGapP90']+2,
     'earlyDeath':c['deathsBefore9']==0,'firstLine':c['firstLineBy12']>=7,'work':c['maxWork']<=24000}
    if style=='bounded':tests.update(rewardBy60=c['rewardBy60']>=4,rewardAfter12=c['rewardAfter12']>=2,length=30<=c['medianObservedMoves']<=180,finite=c['ended']>=6)
    if style=='three':tests['rewardRate']=.03<=c['allClearRate']<=.09
    if style=='lapse':tests['finite']=c['ended']>=2
    gates[style]={'pass':all(tests.values()),'checks':tests}
   out['gates'][split]={'pass':all(g['pass'] for g in gates.values()),'styles':gates}
matched_path=root/'matched.json.gz'
if matched_path.exists():
 raw=matched_path.read_bytes();matched=json.loads(gzip.decompress(raw));out['dataSha256']['matched']=hashlib.sha256(raw).hexdigest();out['matched']={}
 for policy in ['flow-v4','director-v2','local-choice','random-pool']:
  for style in ['clear','space','two','three','bounded','lapse']:
   ps=[p for r in matched['results'] if r['policy']==policy for p in r['plays'] if p['style']==style]
   out['matched'][policy+':'+style]={'plays':len(ps),'lines':sum(p['lines'] for p in ps),'rewards':sum(p['earned'] for p in ps),'completed':sum(p['completed'] for p in ps)}
out['decision']='PENDING' if not out['gates'] else 'OFFLINE_PASS' if all(g['pass'] for g in out['gates'].values()) else 'REJECT'
(root/'metrics.json').write_text(json.dumps(out,indent=2)+'\n')
print(json.dumps({'decision':out['decision'],'gates':out['gates']}))
for k,g in out['groups'].items():
 if ':local-choice:'in k or k.startswith('engineering:director-v2:'):
  print(k,'lines',round(g['linesPerMove'],3),'reward',g['allClears'],'broad',round(g['broad'],3),'by60',g['rewardBy60'],'after12',g['rewardAfter12'],'median',g['medianObservedMoves'],'ended',g['ended'])
