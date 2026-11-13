"""D81: independent cell replay, deterministic search replay, direct short oracle."""
import hashlib
import itertools
import json
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'docs/qa/geometry-recovery'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def cell_step(rows, shape, x, y):
    cells = {(cx, cy) for cy, r in enumerate(rows) for cx in range(8) if r & (1 << cx)}
    figure = {(x+dx, y+dy) for dx, dy in shape['cells']}
    assert all(0 <= cx < 8 and 0 <= cy < 8 for cx, cy in figure)
    assert not cells & figure
    added = cells | figure
    full_rows = {cy for cy in range(8) if all((cx, cy) in added for cx in range(8))}
    full_cols = {cx for cx in range(8) if all((cx, cy) in added for cy in range(8))}
    left = {(cx, cy) for cx, cy in added if cy not in full_rows and cx not in full_cols}
    return [sum(1 << cx for cx in range(8) if (cx, cy) in left) for cy in range(8)], len(full_rows)+len(full_cols)


def mask(rows):
    return sum(r << (8*y) for y, r in enumerate(rows))


def plain(ops, boards):
    return '\n'.join([str(len(ops)), *(f"{o['shape']} {o['x']} {o['y']} {o['mask']}" for o in ops),
                      str(len(boards)), *map(str, boards)])+'\n'


def invoke(exe, ops, boards, horizon=None):
    args = [str(exe)] + ([] if horizon is None else ['96', str(horizon)])
    return json.loads(subprocess.run(args, input=plain(ops, boards), text=True, capture_output=True,
                                    check=True, timeout=55).stdout)


def main():
    result = json.loads((OUT/'results.json').read_text())
    for path, expected in result['sources'].items():
        assert sha(ROOT/path) == expected, path
    assert sha(ROOT/'docs/qa/reward-reachability/results.json') == result['inputSha256']
    shapes = json.loads((ROOT/'src/core/shapes.json').read_text())
    by_id = {s['id']: s for s in shapes}
    ops = [dict(shape=i, x=x, y=y, mask=mask([sum(1 << (x+dx) for dx, dy in s['cells'] if y+dy == cy)
                                          for cy in range(8)]))
           for i, s in enumerate(shapes) for y in range(9-s['height']) for x in range(9-s['width'])]
    cell_moves = 0
    for q in result['queries']:
        if q['status'] != 'found':
            assert not q['ops']
            continue
        b = [int(q['board']) >> (8*y) & 255 for y in range(8)]
        assert 1 <= len(q['ops']) <= q['horizon']
        for op in q['ops']:
            p = ops[op]
            b, _ = cell_step(b, shapes[p['shape']], p['x'], p['y'])
            cell_moves += 1
        assert not any(b)
    for route in result['routes']:
        if route['status'] != 'found':
            continue
        b = route['rows']
        for e in route['trace']:
            b, lines = cell_step(b, by_id[e['shapeId']], e['x'], e['y'])
            assert b == e['rows'] and lines == e['lines'] and (not any(b)) == e['clear']
            cell_moves += 1
        assert any(e['clear'] for e in route['trace'])
    actual_moves = 0
    for episode in result['episodes']:
        b = result['routes'][episode['input']]['rows']
        for e in episode['events']:
            b, lines = cell_step(b, by_id[e['shapeId']], e['x'], e['y'])
            assert b == e['rows'] and lines == e['lines'] and (not any(b)) == e['clear']
            actual_moves += 1
        assert b == episode['finalRows']
        assert (episode['status'] == 'reward') == any(e['clear'] for e in episode['events'])
    print(json.dumps(dict(cellWitnessMoves=cell_moves, cellActualMoves=actual_moves)), flush=True)

    with tempfile.TemporaryDirectory(prefix='blocky-recovery-check-') as tmp:
        exe = Path(tmp)/'recovery'
        subprocess.run(['g++', '-std=c++17', '-O3', '-Wall', '-Wextra',
                        str(ROOT/'scripts/director/geometry-recovery.cpp'), '-o', str(exe)], check=True)
        for horizon in [9, 6, 3]:
            queries = [q for q in result['queries'] if q['horizon'] == horizon]
            replay = invoke(exe, ops, [int(q['board']) for q in queries], horizon)['cases']
            assert replay == [{k: v for k, v in q.items() if k != 'horizon'} for q in queries]
            print(json.dumps(dict(nativeReplayHorizon=horizon, boards=len(queries))), flush=True)
        direct = Path(tmp)/'forward'
        subprocess.run(['g++', '-std=c++17', '-O3', '-Wall', '-Wextra',
                        str(ROOT/'scripts/director/verify-reward-reachability.cpp'), '-o', str(direct)], check=True)
        short = [q for q in result['queries'] if q['horizon'] == 3]
        forward = invoke(direct, ops, [int(q['board']) for q in short])
        assert [c['minimumPlacements'] is not None for c in forward] == [q['status'] == 'found' for q in short]

        # Independent complete cell search in a small domain; positive and negative
        # one/two/three-placement cases plus intermediate clear lines.
        tiny_shapes = [dict(cells=[[0, 0]]), dict(cells=[[0, 0], [1, 0]])]
        tiny = [dict(shape=0, x=x, y=y, mask=1 << (8*y+x)) for y in range(2) for x in range(4)]
        tiny += [dict(shape=1, x=x, y=y, mask=3 << (8*y+x)) for y in range(2) for x in range(3)]
        fixtures = [254, 252, 248, 240, 254 | (254 << 8), 252 | (252 << 8), 254 | (250 << 8), 1 << 63]
        small_checks = 0
        for horizon in [1, 2, 3]:
            native = invoke(exe, tiny, fixtures, horizon)['cases']
            for b, case in zip(fixtures, native, strict=True):
                states, found = {b}, False
                for _ in range(horizon):
                    children = set()
                    for state, p in itertools.product(states, tiny):
                        if state & p['mask']:
                            continue
                        rows = [state >> (8*y) & 255 for y in range(8)]
                        n, _ = cell_step(rows, tiny_shapes[p['shape']], p['x'], p['y'])
                        following = mask(n)
                        found |= following == 0
                        children.add(following)
                    states = children
                assert (case['status'] == 'found') == found
                small_checks += 1
    output = dict(schema='blocky-geometry-recovery-cell-check-v1', resultSha256=sha(OUT/'results.json'),
                  verifierSha256=sha(Path(__file__)), queryCount=len(result['queries']),
                  nativeReplays=len(result['queries']), cellWitnessMoves=cell_moves, cellActualMoves=actual_moves,
                  exactShortCases=len(forward), directLeafChecks=sum(c['leafChecks'] for c in forward),
                  tinyExhaustiveCases=small_checks)
    (OUT/'checks-cell.json').write_text(json.dumps(output, indent=2)+'\n')
    print(json.dumps(output))


if __name__ == '__main__':
    main()
