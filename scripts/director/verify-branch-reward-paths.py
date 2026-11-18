"""Independent cell soundness for every positive D81 opportunity/control route."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT/'docs/qa/branch-preparation'
raw = (OUT/'results.json').read_bytes()
data = json.loads(raw)
shapes = json.loads((ROOT/'src/core/shapes.json').read_text())
operations = [(s, x, y) for s in shapes for y in range(9-s['height']) for x in range(9-s['width'])]
routes = moves = 0
for query in data['reachQueries']:
    if query['status'] != 'found':
        assert not query['ops']
        continue
    board = int(query['board'])
    cells = {(x, y) for y in range(8) for x in range(8) if board & (1 << (8*y+x))}
    assert 1 <= len(query['ops']) <= query['horizon']
    for op in query['ops']:
        shape, x, y = operations[op]
        figure = {(x+dx, y+dy) for dx, dy in shape['cells']}
        assert all(0 <= cx < 8 and 0 <= cy < 8 for cx, cy in figure)
        assert not figure & cells
        added = cells | figure
        rows = {cy for cy in range(8) if all((cx, cy) in added for cx in range(8))}
        cols = {cx for cx in range(8) if all((cx, cy) in added for cy in range(8))}
        cells = {(cx, cy) for cx, cy in added if cy not in rows and cx not in cols}
        moves += 1
    assert not cells
    routes += 1
result = dict(resultSha256=hashlib.sha256(raw).hexdigest(), verifierSha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
              positiveRoutes=routes, positiveRouteCellMoves=moves)
(OUT/'checks-positive-routes.json').write_text(json.dumps(result, indent=2)+'\n')
print(json.dumps(result))
