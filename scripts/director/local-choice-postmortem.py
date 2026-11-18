"""Independent field-cover and witnessed-reward accounting after C1 freeze."""
import collections,gzip,hashlib,json,pathlib
root=pathlib.Path('docs/qa/local-choice');shapes={s['id']:s for s in json.loads(pathlib.Path('src/core/shapes.json').read_text())}
def maximum_matching(rows):
 owner=[-1]*8
 def augment(y,seen):
  for x in range(8):
   if not rows[y]>>x&1 or x in seen:continue
   seen.add(x)
   if owner[x]<0 or augment(owner[x],seen):owner[x]=y;return True
  return False
 return sum(augment(y,set()) for y in range(8))
def cover(rows):
 best=(16,0,0)
 for row_mask in range(256):
  col_mask=0
  for y,row in enumerate(rows):
   if not row_mask>>y&1:col_mask|=row
  best=min(best,(row_mask.bit_count()+col_mask.bit_count(),row_mask,col_mask))
 assert all(best[1]>>y&1 or not row&~best[2] for y,row in enumerate(rows))
 assert best[0]==maximum_matching(rows)
 return dict(lines=best[0],rowMask=best[1],colMask=best[2])
def reward(rows,tray,path):
 rows=list(rows);earned=False;used=set()
 for m in path:
  assert m['slot'] not in used;used.add(m['slot']);shape=shapes[tray[m['slot']]['shapeId']]
  for dx,dy in shape['cells']:
   x,y=m['x']+dx,m['y']+dy;assert 0<=x<8 and 0<=y<8;assert not rows[y]>>x&1;rows[y]|=1<<x
  cols=255
  for row in rows:cols&=row
  rows=[(0 if row==255 else row)&~cols for row in rows];earned|=not any(rows)
 assert len(used)==3
 return earned
out={'schema':'blocky-local-choice-postmortem-v1','sources':{},'groups':{},'fields':[]}
for stage in ['engineering','holdout']:
 raw=(root/(stage+'.json.gz')).read_bytes();out['sources'][stage]=hashlib.sha256(raw).hexdigest();data=json.loads(gzip.decompress(raw))
 for r in data['runs']:
  if r['policy']!='local-choice' or r['style']!='bounded':continue
  key=r['split'];g=out['groups'].setdefault(key,collections.Counter())
  for d in r['deals']:
   if d['move']<12 or d['move']>=r['moves']:continue
   pool=d['diagnostic']['pool'];selected=d['diagnostic']['chosen'];c=cover(d['board']);g['latePlayedOffers']+=1;g['excludedByFourLineTargetClass']+=c['lines']>4
   witnessed=[reward(d['board'],p['tray'],p['witness']) or p['meanReward']>0 for p in pool]
   g['anyPoolRewardWitness']+=any(witnessed);g['selectedRewardWitness']+=selected>=0 and witnessed[selected]
   earned=any(e[1] for e in r['events'][d['move']:d['move']+3]);g['actualReward']+=earned
   out['fields'].append({'split':r['split'],'seed':r['seed'],'move':d['move'],'board':d['board'],'minCover':c,'poolRewardWitness':any(witnessed),'selectedRewardWitness':selected>=0 and witnessed[selected],'actualReward':earned})
out['groups']={k:dict(v) for k,v in out['groups'].items()}
out['minCoverCrossCheck']='Independent bipartite maximum matching equals exhaustive row/column cover on every field.'
out['scriptSha256']=hashlib.sha256(pathlib.Path('scripts/director/local-choice-postmortem.py').read_bytes()).hexdigest()
(root/'postmortem.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out['groups']))
