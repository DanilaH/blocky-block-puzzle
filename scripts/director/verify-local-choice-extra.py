"""Independent cell-level replay of every matched-input model trace."""
import gzip,hashlib,json,pathlib
root=pathlib.Path('docs/qa/local-choice');shapes={s['id']:s for s in json.loads(pathlib.Path('src/core/shapes.json').read_text())}
raw=(root/'matched.json.gz').read_bytes();data=json.loads(gzip.decompress(raw));actions=0;plays=0
for row in data['results']:
 for p in row['plays']:
  board=[[int(bool(mask>>x&1)) for x in range(8)] for mask in row['board']];used=set();lines=0;earned=False
  for m in p['actions']:
   assert m['slot'] not in used;used.add(m['slot']);s=shapes[row['tray'][m['slot']]['shapeId']]
   for dx,dy in s['cells']:
    x,y=m['x']+dx,m['y']+dy;assert 0<=x<8 and 0<=y<8;assert board[y][x]==0;board[y][x]=1
   ys=[y for y in range(8) if all(board[y])];xs=[x for x in range(8) if all(board[y][x] for y in range(8))];lines+=len(ys)+len(xs)
   for y in range(8):
    for x in range(8):
     if y in ys or x in xs:board[y][x]=0
   earned|=not any(any(r) for r in board);actions+=1
  assert lines==p['lines'];assert earned==p['earned'];assert (len(used)==3)==p['completed']
  assert [sum(v<<x for x,v in enumerate(r)) for r in board]==p['endpoint']
  if len(used)<3:
   for slot,t in enumerate(row['tray']):
    if slot in used:continue
    s=shapes[t['shapeId']]
    for y in range(9-s['height']):
     for x in range(9-s['width']):assert any(board[y+dy][x+dx] for dx,dy in s['cells'])
  plays+=1
out={'variants':len(data['results']),'plays':plays,'actions':actions,'matchedSha256':hashlib.sha256(raw).hexdigest(),'verifierSha256':hashlib.sha256(pathlib.Path('scripts/director/verify-local-choice-extra.py').read_bytes()).hexdigest()}
(root/'extra-checks.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out))
