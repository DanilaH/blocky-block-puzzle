"""Independent cell rules for D84 proofs, forecasts, sources, runs and forks."""
import gzip
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT/'docs/qa/committed-rollout'


def main():
    raw = (OUT/'results.json.gz').read_bytes()
    data = json.loads(gzip.decompress(raw))
    shapes = {s['id']: s for s in json.loads((ROOT/'src/core/shapes.json').read_text())}
    counts = dict(proofMoves=0, forecastMoves=0, sourceMoves=0, regressionMoves=0, actualMoves=0, forkMoves=0)

    def rows(board):
        return [sum(1 << x for x in range(8) if board[8*y+x]) for y in range(8)]

    def step(board, shape_id, x, y):
        cells = {(cx, cy) for cy, r in enumerate(board) for cx in range(8) if r & (1 << cx)}
        figure = {(x+dx, y+dy) for dx, dy in shapes[shape_id]['cells']}
        assert all(0 <= cx < 8 and 0 <= cy < 8 for cx, cy in figure)
        assert not cells & figure
        added = cells | figure
        horizontal = {cy for cy in range(8) if all((cx, cy) in added for cx in range(8))}
        vertical = {cx for cx in range(8) if all((cx, cy) in added for cy in range(8))}
        left = {(cx, cy) for cx, cy in added if cy not in horizontal and cx not in vertical}
        return [sum(1 << cx for cx in range(8) if (cx, cy) in left) for cy in range(8)], len(horizontal)+len(vertical)

    def replay(initial, events, key):
        b = initial
        for e in events:
            b, lines = step(b, e['shapeId'], e['x'], e['y'])
            assert b == e['rows'] and lines == e['lines'] and (not any(b)) == e['clear']
            counts[key] += 1

    def proof(initial, p):
        b, used = initial, set()
        for m in p['witness']:
            assert m['slot'] not in used
            used.add(m['slot'])
            b, _ = step(b, p['tray'][m['slot']]['shapeId'], m['x'], m['y'])
            counts['proofMoves'] += 1
        assert len(used) == 3

    for root in data['roots']:
        initial = rows(root['state']['board'])
        for p in root['pool']:
            proof(initial, p)
        horizon = str(max(map(int, root['forecasts'])))
        for candidate in root['forecasts'][horizon]:
            for f in candidate:
                replay(initial, f['events'], 'forecastMoves')
    for g in data['sourceGames']:
        replay(rows(g['initial']['board']), g['events'], 'sourceMoves')
    for i in data['inputs']:
        proof(rows(i['state']['board']), i['proof'])
    for kind, runs in [('regressionMoves', data['regressions']), ('actualMoves', data['matched']+data['games']), ('forkMoves', data['forks'])]:
        for run in runs:
            initial = rows(data['roots'][run['root']]['state']['board']) if kind == 'forkMoves' else rows(run['initialState']['board'])
            replay(initial, run['events'], kind)
            for d in run['deals']:
                board = initial if d['at'] == 0 else run['events'][d['at']-1]['rows']
                proof(board, d['proof'])
    result = dict(schema='blocky-committed-rollout-cell-check-v1', resultSha256=hashlib.sha256(raw).hexdigest(),
        verifierSha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(), counts=counts)
    (OUT/'checks-cell.json').write_text(json.dumps(result, indent=2)+'\n')
    print(json.dumps(result))


if __name__ == '__main__':
    main()
