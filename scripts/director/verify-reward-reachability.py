"""Independent cell oracle, tiny exhaustive domains and full forward negatives."""
import importlib.util
import itertools
import json
import random
from pathlib import Path
import subprocess
import sys
import tempfile
import time

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('reach', ROOT/'scripts/director/reward-reachability.py')
reach = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reach)


def cell_place(board, mask):
    cells = {(x, y) for y in range(8) for x in range(8) if board >> (8*y+x) & 1}
    figure = {(x, y) for y in range(8) for x in range(8) if mask >> (8*y+x) & 1}
    assert not cells & figure
    filled = cells | figure
    rows = {y for y in range(8) if all((x, y) in filled for x in range(8))}
    cols = {x for x in range(8) if all((x, y) in filled for y in range(8))}
    left = {(x, y) for x, y in filled if y not in rows and x not in cols}
    return sum(1 << (8*y+x) for x, y in left), len(rows)+len(cols)


def brute_tiny(board, ops):
    frontier = {board}
    for depth in range(1, 4):
        following = set()
        for b, op in itertools.product(frontier, ops):
            if b & op['mask']:
                continue
            n, _ = cell_place(b, op['mask'])
            if not n:
                return depth
            following.add(n)
        frontier = following
    return None


def main():
    data_file = ROOT/'docs/qa/reward-reachability/results.json'
    data = json.loads(data_file.read_text())
    for path, expected in data['sources'].items():
        assert reach.digest(ROOT/path) == expected, path
    shapes = json.loads((ROOT/'src/core/shapes.json').read_text())
    ops = reach.catalogue(shapes)
    boards = [int(c['board']) for c in data['cases']]
    source = ROOT/'scripts/director/verify-reward-reachability.cpp'
    with tempfile.TemporaryDirectory(prefix='blocky-forward-') as directory:
        exe = str(Path(directory)/'forward')
        subprocess.run(['g++', '-std=c++17', '-O3', '-Wall', '-Wextra', str(source), '-o', exe], check=True)
        plain = '\n'.join([str(len(ops)), *(f"{o['shape']} {o['x']} {o['y']} {o['mask']}" for o in ops),
                           str(len(boards)), *map(str, boards)])+'\n'
        start = time.monotonic()
        p = subprocess.run([exe], input=plain, text=True, capture_output=True, check=True, timeout=55)
        forward = json.loads(p.stdout)
        seconds = time.monotonic()-start
    assert [c['minimumPlacements'] for c in forward] == [c['minimumPlacements'] for c in data['cases']]
    print(json.dumps(dict(forwardBoards=len(forward), seconds=round(seconds, 3),
                         leafChecks=sum(c['leafChecks'] for c in forward))), flush=True)

    # Small, genuinely exhaustive cell-based oracle. All prefix lengths and
    # early rewards, including two separate intermediate line clears.
    tiny = [dict(shape=0, x=x, y=y, mask=1 << (y*8+x)) for y in range(2) for x in range(4)]
    tiny += [dict(shape=1, x=x, y=y, mask=3 << (y*8+x)) for y in range(2) for x in range(3)]
    fixtures = [254, 252, 248, 240, 254 | (254 << 8), 252 | (252 << 8),
                254 | (250 << 8), 1 << 63]
    rng = random.Random(804012)
    fixtures += [rng.randrange(256) | (rng.randrange(256) << 8) for _ in range(24)]
    fixtures = [b for b in fixtures if (b & 255) != 255 and (b >> 8 & 255) != 255]
    result, _ = reach.solve(tiny, fixtures)
    expected = [brute_tiny(b, tiny) for b in fixtures]
    assert [c['minimumPlacements'] for c in result['cases']] == expected
    assert {None, 1, 2, 3} <= set(expected)

    # Real-catalogue row, column and cross rewards with exact cell witnesses.
    positives = [254, 248, 240, 224, 254 | (254 << 8),
                 sum(1 << (8*y) for y in range(1, 8)),
                 254 | sum(1 << (8*y) for y in range(1, 8))]
    positive, _ = reach.solve(ops, positives)
    witness_count = 0
    for board, case in zip(positives, positive['cases'], strict=True):
        assert case['minimumPlacements'] is not None
        for w in case['witnesses']:
            b, earned = board, []
            for i, opid in enumerate(w['ops'], 1):
                b, lines = cell_place(b, ops[opid]['mask'])
                if b == 0:
                    earned.append(i)
            assert earned and w['rewardAt'] in earned
            witness_count += 1
    output = dict(schema='blocky-exact-reward-independent-check-v1', resultSha256=reach.digest(data_file),
        sources={p: reach.digest(ROOT/p) for p in ['scripts/director/verify-reward-reachability.cpp',
                 'scripts/director/verify-reward-reachability.py']},
        forwardBoards=len(forward), forwardSeconds=seconds,
        forwardLeafChecks=sum(c['leafChecks'] for c in forward), forward=forward,
        tinyCellOracleCases=len(fixtures), tinyMinimumPlacements=expected,
        positiveRealCatalogueCases=len(positives), positiveCellWitnesses=witness_count)
    (ROOT/'docs/qa/reward-reachability/checks.json').write_text(json.dumps(output, indent=2)+'\n')
    # Public-rule verifier consumes plain witness fixtures, not the native index.
    packaged = []
    for board, case in zip(positives, positive['cases'], strict=True):
        for w in case['witnesses']:
            packaged.append(dict(rows=[board >> (8*y) & 255 for y in range(8)], rewardAt=w['rewardAt'],
                placements=[dict(shapeId=shapes[ops[i]['shape']]['id'], x=ops[i]['x'], y=ops[i]['y']) for i in w['ops']]))
    (ROOT/'docs/qa/reward-reachability/positive-fixtures.json').write_text(json.dumps(packaged, indent=2)+'\n')
    print(json.dumps({k: v for k, v in output.items() if k not in ['sources', 'forward', 'tinyMinimumPlacements']}))


if __name__ == '__main__':
    main()
