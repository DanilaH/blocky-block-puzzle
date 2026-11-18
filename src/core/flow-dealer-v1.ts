import { SHAPES, random, type Board, type Move, type Slot } from "./rules";
const POP = Array.from({ length: 256 }, (_, v) => {
  let n = 0;
  for (; v; v &= v - 1) n++;
  return n;
});
type Option = { shape: number; x: number; y: number; rows: number[] };
let catalog: Option[][] | undefined;
function options() {
  return (catalog ??= SHAPES.map((s, shape) => {
    const list: Option[] = [];
    for (let y = 0; y <= 8 - s.height; y++)
      for (let x = 0; x <= 8 - s.width; x++) {
        const rows = Array(8).fill(0);
        for (const [dx, dy] of s.cells) rows[y + dy] |= 1 << (x + dx);
        list.push({ shape, x, y, rows });
      }
    return list;
  }));
}
/** Bounded deterministic beam search. Eight row masks; never a clock/ad dependency. */
export function flowDealV1(board: Board, seed: number, moves = 0, previous = "") {
  let rng = seed;
  const next = () => {
    const r = random(rng);
    rng = r.state;
    return r.value;
  };
  const generous = next() < (moves < 12 ? 0.8 : 0.55);
  const occupiedAtDeal = board.filter(Boolean).length;
  const maxSize =
    moves < 12 && occupiedAtDeal > 12
      ? 3
      : occupiedAtDeal > 36
        ? 4
        : moves < 12
          ? 6
          : 9;
  const order = options()
    .filter((list) => SHAPES[list[0]!.shape]!.cells.length <= maxSize)
    .map((list) => ({ list, rank: next() }))
    .sort((a, b) => a.rank - b.rank);
  const reverse = next() > 0.5;
  type Node = {
    rows: number[];
    path: Option[];
    lines: number;
    clears: number;
    value: number;
  };
  const rows = Array(8).fill(0);
  board.forEach((v, i) => {
    if (v) rows[i >> 3] |= 1 << i % 8;
  });
  let beam: Node[] = [{ rows, path: [], lines: 0, clears: 0, value: 0 }];
  let visited = 0;
  for (let depth = 0; depth < 3; depth++) {
    const candidates: Node[] = [];
    const seen = new Set<string>();
    for (const parent of beam)
      for (const { list } of generous ? order : order.slice(0, 8))
        for (let k = 0; k < list.length; k++) {
          const op = list[reverse ? list.length - 1 - k : k]!;
          let fits = true;
          for (let y = 0; y < 8; y++)
            if (parent.rows[y]! & op.rows[y]!) {
              fits = false;
              break;
            }
          if (!fits) continue;
          visited++;
          const r = parent.rows.map((v, y) => v | op.rows[y]!);
          let columns = 255;
          for (const row of r) columns &= row;
          let cleared = POP[columns]!;
          for (let y = 0; y < 8; y++)
            if (r[y] === 255) {
              r[y] = 0;
              cleared++;
            }
          let occupied = 0,
            fullness = 0,
            edges = 0,
            holes = 0;
          for (let y = 0; y < 8; y++) {
            r[y] = r[y]! & ~columns;
            occupied += POP[r[y]!]!;
            fullness += POP[r[y]!]! ** 2;
          }
          for (let x = 0; x < 8; x++) {
            let n = 0;
            for (let y = 0; y < 8; y++) n += Number(!!(r[y]! & (1 << x)));
            fullness += n * n;
          }
          for (let y = 0; y < 8; y++) {
            const row = r[y]!,
              empty = ~row & 255;
            edges +=
              POP[(row ^ (row << 1)) & 255]! + POP[row ^ (r[y + 1] ?? 0)]!;
            const near =
              ((empty << 1) |
                (empty >> 1) |
                (~(r[y - 1] ?? 255) & 255) |
                (~(r[y + 1] ?? 255) & 255)) &
              255;
            holes += POP[empty & ~near]!;
          }
          const lines = parent.lines + cleared,
            clears = parent.clears + Number(occupied === 0);
          const repeated =
            depth === 2 &&
            [...parent.path, op]
              .map((p) => SHAPES[p.shape]!.family)
              .sort()
              .join(",") === previous;
          const value =
            clears * (generous ? 6000 : 650) +
            lines * (generous ? 500 : 220) -
            holes * 65 -
            edges * 2 -
            occupied * 0.7 +
            fullness * 1.1 -
            (repeated ? 7000 : 0);
          const key = r.join(",");
          if (seen.has(key)) continue;
          seen.add(key);
          candidates.push({
            rows: r,
            path: [...parent.path, op],
            lines,
            clears,
            value,
          });
        }
    candidates.sort((a, b) => b.value - a.value);
    beam = candidates.slice(0, 4);
    const construction = [...candidates].sort(
      (a, b) =>
        b.value -
        b.lines * (generous ? 500 : 220) -
        (a.value - a.lines * (generous ? 500 : 220)),
    );
    for (const c of construction) {
      if (!beam.includes(c)) beam.push(c);
      if (beam.length >= 8) break;
    }
    if (!beam.length) return null;
  }
  beam.sort((a, b) => b.value - a.value);
  const finalists = generous
    ? beam.filter(
        (n) => n.clears === beam[0]!.clears && n.value >= beam[0]!.value - 80,
      )
    : beam;
  const chosen =
    finalists[
      Math.floor(next() * Math.min(generous ? 3 : 8, finalists.length))
    ]!;
  const shuffle = [0, 1, 2]
    .map((i) => ({ i, r: next() }))
    .sort((a, b) => a.r - b.r)
    .map((a) => a.i);
  const tray: Slot[] = shuffle.map((i) => ({
    shapeId: SHAPES[chosen.path[i]!.shape]!.id,
    used: false,
    color: (chosen.path[i]!.shape % 6) + 1,
  }));
  const witness: Move[] = chosen.path.map((op, i) => ({
    slot: shuffle.indexOf(i),
    x: op.x,
    y: op.y,
  }));
  return { tray, rngState: rng, fallback: false, witness, visited };
}
