"""D80 engineering-only exact reachability. Run from repository root."""
import gzip
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
import time

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'docs/qa/reward-reachability'


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def catalogue(shapes):
    return [dict(shape=i, x=x, y=y,
                 mask=sum(1 << ((y+dy)*8+x+dx) for dx, dy in s['cells']))
            for i, s in enumerate(shapes)
            for y in range(9-s['height']) for x in range(9-s['width'])]


def solve(ops, boards):
    source = ROOT / 'scripts/director/reward-reachability.cpp'
    with tempfile.TemporaryDirectory(prefix='blocky-exact-') as directory:
        exe = str(Path(directory) / 'search')
        subprocess.run(['g++', '-std=c++17', '-O3', '-Wall', '-Wextra', str(source), '-o', exe], check=True)
        plain = '\n'.join([str(len(ops)),
            *(f"{o['shape']} {o['x']} {o['y']} {o['mask']}" for o in ops),
            str(len(boards)), *(str(b) for b in boards)]) + '\n'
        started = time.monotonic()
        result = subprocess.run([exe], input=plain, text=True, capture_output=True, check=True, timeout=55)
        return json.loads(result.stdout), time.monotonic()-started


def main():
    shapes_file = ROOT / 'src/core/shapes.json'
    inputs = ROOT / 'docs/qa/local-choice/engineering.json.gz'
    shapes = json.loads(shapes_file.read_text())
    data = json.loads(gzip.decompress(inputs.read_bytes()))
    positions = [dict(seed=r['seed'], move=d['move'], rows=d['board'])
                 for r in data['runs'] if r['policy'] == 'local-choice' and r['style'] == 'bounded'
                 for d in r['deals'] if 12 <= d['move'] < r['moves']]
    assert len(positions) == 31
    ops = catalogue(shapes)
    result, seconds = solve(ops, [sum(row << (8*y) for y, row in enumerate(p['rows'])) for p in positions])
    for p, c in zip(positions, result['cases'], strict=True):
        c.update(p)
        for w in c['witnesses']:
            w['placements'] = [dict(shapeId=shapes[ops[i]['shape']]['id'], x=ops[i]['x'], y=ops[i]['y']) for i in w.pop('ops')]
    sources = ['scripts/director/reward-reachability.cpp', 'scripts/director/reward-reachability.py',
               'docs/qa/reward-reachability/protocol.md', 'src/core/shapes.json',
               'docs/qa/local-choice/engineering.json.gz']
    result.update(schema='blocky-exact-reward-reachability-v1', horizon=3, catalogueSize=len(shapes),
                  placements=len(ops), sources={p: digest(ROOT/p) for p in sources},
                  elapsedSeconds=seconds, note='Engineering diagnosis; no runtime candidate or human evidence.')
    OUT.mkdir(exist_ok=True)
    (OUT/'results.json').write_text(json.dumps(result, indent=2)+'\n')
    print(json.dumps(dict(boards=len(positions), reachable=sum(c['witnessBags'] > 0 for c in result['cases']),
        impossibleWithinThree=sum(c['witnessBags'] == 0 for c in result['cases']), seconds=round(seconds, 3),
        reverseStates=result['reverseStates'], fitChecks=sum(c['fitChecks'] for c in result['cases']))))


if __name__ == '__main__':
    main()
