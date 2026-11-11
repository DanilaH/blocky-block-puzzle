"""Outcome accounting from stored actions/events only; no dealer imports."""
import gzip, json, pathlib
root=pathlib.Path('docs/qa/director-reward-paths')
data=json.loads(gzip.decompress((root/'results.json.gz').read_bytes()))
out={'phases':{},'plans':{},'defeats':{},'examples':[]}
for r in data['runs']:
 if r['mode']!='candidate':continue
 for d in r['deals']:
  start=d['move']
  if start>=r['moves']:continue
  end=min(start+3,r['moves']);diagnostic=d['diagnostic'];phase=diagnostic['actual'];key=r['split']+':'+r['style']+':'+phase
  p=out['phases'].setdefault(key,{'deals':0,'broad':0,'lines':0,'allClears':0,'lateAllClears':0,'endedWithinTray':0,'changeInOccupied':0,'sources':{}})
  p['deals']+=1;p['broad']+=int(diagnostic['robustness']['adequate']);p['lines']+=sum(e[0] for e in r['events'][start:end]);p['allClears']+=sum(e[1] for e in r['events'][start:end])
  p['lateAllClears']+=sum(r['events'][i][1] for i in range(start,end) if i+1>12)
  p['changeInOccupied']+=r['events'][end-1][2]-sum(x.bit_count() for x in d['board'])
  p['sources'][diagnostic['source']]=p['sources'].get(diagnostic['source'],0)+1
  plan=out['plans'].setdefault(r['split']+':'+r['style'],{'deals':0,'offered':0,'earnedOnOffer':0,'goalConstructed':0,'preparedEndpoints':0,'pending':0,'matched':0,'replanned':0,'lost':0,'pendingSupersededByPhase':0})
  plan['deals']+=1;plan['offered']+=int(diagnostic['goalFound']);plan['earnedOnOffer']+=int(diagnostic['goalFound'] and any(e[1] for e in r['events'][start:end]))
  plan['goalConstructed']+=int(diagnostic['goalConstructed']);plan['preparedEndpoints']+=diagnostic['prepared'];plan['pending']+=int(bool(d['input'].get('saved',{}).get('prepared')))
  for s in ['matched','replanned','lost']:plan[s]+=int(diagnostic['planStatus']==s)
  plan['pendingSupersededByPhase']+=int(bool(d['input'].get('saved',{}).get('prepared')) and diagnostic['requested']!='gift')
  if not(r['ended'] and end==r['moves'] and r['moves']<start+3):continue
  p['endedWithinTray']+=1;actions=r['actions'][start:end];first=next((x for x in diagnostic['robustness']['roots'] if [x['move']['slot'],x['move']['x'],x['move']['y']]==actions[0]),None)
  first_certified=bool(first and first['status']=='found');second_certified=False
  if first_certified and len(actions)==2:
   second_certified=any([s['move']['slot'],s['move']['x'],s['move']['y']]==actions[1] and s['status']=='found' for s in first.get('seconds',{}).get('choices',[]))
  assert not second_certified,'Defeat contradicts a certified two-move prefix'
  k=r['split']+':'+phase;row=out['defeats'].setdefault(k,{'ended':0,'afterCertifiedFirst':0,'afterCertifiedSecond':0})
  row['ended']+=1;row['afterCertifiedFirst']+=int(first_certified);row['afterCertifiedSecond']+=int(second_certified)
  if len(out['examples'])<12:out['examples'].append({'seed':r['seed'],'style':r['style'],'phase':phase,'move':start,'board':d['board'],'tray':d['tray'],'actions':actions,'firstCertified':first_certified,'secondCertified':second_certified})
(root/'phases.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'defeats':out['defeats'],'plans':out['plans']},ensure_ascii=False))
