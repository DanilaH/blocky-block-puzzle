"""D83 independent cell oracle for all proofs, forecasts, played/source/audit moves."""
import gzip
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT/'docs/qa/played-rollout'


def main():
    raw = (OUT/'results.json.gz').read_bytes()
    data = json.loads(gzip.decompress(raw))
    shapes = {s['id']: s for s in json.loads((ROOT/'src/core/shapes.json').read_text())}

    def from_board(board):
        return [sum(1 << x for x in range(8) if board[8*y+x]) for y in range(8)]

    def step(rows, shape_id, x, y):
        cells = {(cx, cy) for cy, r in enumerate(rows) for cx in range(8) if r & (1 << cx)}
        figure = {(x+dx, y+dy) for dx, dy in shapes[shape_id]['cells']}
        assert all(0 <= cx < 8 and 0 <= cy < 8 for cx, cy in figure)
        assert not figure & cells
        filled = cells | figure
        horizontal = {cy for cy in range(8) if all((cx, cy) in filled for cx in range(8))}
        vertical = {cx for cx in range(8) if all((cx, cy) in filled for cy in range(8))}
        left = {(cx, cy) for cx, cy in filled if cy not in horizontal and cx not in vertical}
        return [sum(1 << cx for cx in range(8) if (cx, cy) in left) for cy in range(8)], len(horizontal)+len(vertical)

    def replay(rows, events):
        for e in events:
            rows, lines = step(rows, e['shapeId'], e['x'], e['y'])
            assert rows == e['rows'] and lines == e['lines'] and (not any(rows)) == e['clear']
        return len(events)

    proofs = forecast_moves = actual_moves = source_moves = audit_moves = 0
    for root in data['roots']:
        initial = from_board(root['state']['board'])
        for p in root['pool']:
            b, used = initial, set()
            for m in p['witness']:
                assert m['slot'] not in used
                used.add(m['slot'])
                b, _ = step(b, p['tray'][m['slot']]['shapeId'], m['x'], m['y'])
                proofs += 1
            assert len(used) == 3
        horizon = str(max(map(int, root['forecasts'])))
        for row in root['forecasts'][horizon]:
            for f in row:
                forecast_moves += replay(initial, f['events'])
    for run in data['matched']+data['games']:
        actual_moves += replay(from_board(run['initialState']['board']), run['events'])
        for d in run['deals']:
            rows, used = from_board(d['base']['board']), set()
            for move in d['proof']['witness']:
                assert move['slot'] not in used
                used.add(move['slot'])
                rows, _ = step(rows, d['proof']['tray'][move['slot']]['shapeId'], move['x'], move['y'])
                proofs += 1
            assert len(used) == 3
    fixtures = json.loads((OUT/'source-cell-fixtures.json').read_text())
    for f in fixtures:
        b, lines = step(f['rows'], f['shapeId'], f['x'], f['y'])
        assert b == f['after'] and lines == f['lines']
        source_moves += 1
    audit_bytes = (OUT/'policy-audit.json').read_bytes()
    audit = json.loads(audit_bytes)
    assert audit['resultSha256'] == hashlib.sha256(raw).hexdigest()
    for a in audit['matched']:
        initial = from_board(data['inputs'][a['input']]['state']['board'])
        audit_moves += replay(initial, a['heldEvents'])
    output = dict(schema='blocky-played-rollout-cell-check-v1', resultSha256=hashlib.sha256(raw).hexdigest(),
                  scriptSha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
                  policyAuditSha256=hashlib.sha256(audit_bytes).hexdigest(),
                  proofMoves=proofs, forecastMoves=forecast_moves, actualMoves=actual_moves,
                  sourceMoves=source_moves, heldAuditMoves=audit_moves)
    (OUT/'checks-cell.json').write_text(json.dumps(output, indent=2)+'\n')
    print(json.dumps(output))


if __name__ == '__main__':
    main()
