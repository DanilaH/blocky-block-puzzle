"""D82 independent cell rules, native replay and direct exact short oracle."""
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT/'docs/qa/branch-preparation'


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    data = json.loads((OUT/'results.json').read_text())
    for p, h in data['source'].items():
        assert digest(ROOT/p) == h, p
    shapes = json.loads((ROOT/'src/core/shapes.json').read_text())
    by_id = {s['id']: s for s in shapes}
    fixtures = json.loads((OUT/'cell-fixtures.json').read_text())
    for f in fixtures:
        before = {(x, y) for y, r in enumerate(f['rows']) for x in range(8) if r & (1 << x)}
        figure = {(f['x']+dx, f['y']+dy) for dx, dy in by_id[f['shapeId']]['cells']}
        assert all(0 <= x < 8 and 0 <= y < 8 for x, y in figure)
        assert not before & figure
        added = before | figure
        rows = {y for y in range(8) if all((x, y) in added for x in range(8))}
        cols = {x for x in range(8) if all((x, y) in added for y in range(8))}
        left = {(x, y) for x, y in added if y not in rows and x not in cols}
        after = [sum(1 << x for x in range(8) if (x, y) in left) for y in range(8)]
        assert after == f['after'] and len(rows)+len(cols) == f['lines']
    print(json.dumps(dict(cellTransitions=len(fixtures))), flush=True)
    ops = [(i, x, y, sum(1 << ((y+dy)*8+x+dx) for dx, dy in s['cells']))
           for i, s in enumerate(shapes) for y in range(9-s['height']) for x in range(9-s['width'])]
    header = '\n'.join([str(len(ops)), *(' '.join(map(str, o)) for o in ops)])

    def invoke(exe, queries, args=()):
        plain = header+'\n'+str(len(queries))+'\n'+'\n'.join(q['board'] for q in queries)+'\n'
        return json.loads(subprocess.run([str(exe), *args], input=plain, text=True,
            capture_output=True, check=True, timeout=55).stdout)

    def compile_cpp(source, destination):
        subprocess.run(['g++', '-std=c++17', '-O3', '-Wall', '-Wextra', str(ROOT/source), '-o', str(destination)], check=True)

    direct_checks = 0
    with tempfile.TemporaryDirectory(prefix='blocky-prepare-check-') as tmp:
        prep, reach, forward = [Path(tmp)/s for s in ['prepare', 'reach', 'forward']]
        compile_cpp('scripts/director/branch-preparation.cpp', prep)
        compile_cpp('scripts/director/geometry-recovery.cpp', reach)
        compile_cpp('scripts/director/verify-reward-reachability.cpp', forward)
        for start in range(0, len(data['prepareQueries']), 12):
            queries = data['prepareQueries'][start:start+12]
            got = invoke(prep, queries)['cases']
            assert got == [{k: v for k, v in q.items() if k != 'horizon'} for q in queries]
            print(json.dumps(dict(preparationReplays=start+len(queries), total=len(data['prepareQueries']))), flush=True)
        for horizon in [9, 6, 3]:
            queries = [q for q in data['reachQueries'] if q['horizon'] == horizon]
            for start in range(0, len(queries), 12):
                batch = queries[start:start+12]
                got = invoke(reach, batch, ['96', str(horizon)])['cases']
                assert got == [{k: v for k, v in q.items() if k != 'horizon'} for q in batch]
                if horizon == 3:
                    independent = invoke(forward, batch)
                    assert [x['minimumPlacements'] is not None for x in independent] == [q['status'] == 'found' for q in batch]
                    direct_checks += sum(x['leafChecks'] for x in independent)
            print(json.dumps(dict(reachReplayHorizon=horizon, cases=len(queries))), flush=True)
    output = dict(schema='blocky-branch-preparation-cell-native-check-v1', resultSha256=digest(OUT/'results.json'),
                  verifierSha256=digest(Path(__file__)), cellFixtures=len(fixtures),
                  nativePreparationReplays=len(data['prepareQueries']), nativeReachReplays=len(data['reachQueries']),
                  exactShortPositions=sum(q['horizon'] == 3 for q in data['reachQueries']),
                  directLastFitChecks=direct_checks)
    (OUT/'checks-cell-native.json').write_text(json.dumps(output, indent=2)+'\n')
    print(json.dumps(output))


if __name__ == '__main__':
    main()
