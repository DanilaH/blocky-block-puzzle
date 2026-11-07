// Offline experiment only; not imported by the game.
import { type RhythmState, assistance } from "../../src/core/rhythm";
import {
  SHAPES,
  random,
  type Board,
  type Move,
  type Slot,
} from "../../src/core/rules";
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
export function diverseBeamDeal(
  board: Board,
  seed: number,
  moves = 0,
  previous = "",
  rhythm?: RhythmState,
) {
  let rng = seed;
  const next = () => {
    const r = random(rng);
    rng = r.state;
    return r.value;
  };
  const cycleMoves = rhythm?.cycleMoves ?? moves;
  const support = rhythm?.encoreDeals
    ? 1
    : rhythm?.recoveryDeals
      ? assistance(rhythm)
      : Math.min(assistance(rhythm), cycleMoves < 9 ? 0.25 : 1);
  const history = rhythm?.recentBags ?? [];
  const blocked = new Set(
    history.filter((bag) => history.filter((x) => x === bag).length >= 2),
  );
  const generous = next() < 0.25 + support * 0.65;
  const clearWeight = support * 6000;
  const lineWeight = 30 + support * 470;
  const occupiedAtDeal = board.filter(Boolean).length;
  const maxSize =
    cycleMoves < 12 && !rhythm?.encoreDeals && occupiedAtDeal > 12
      ? 3
      : occupiedAtDeal > 24
        ? 4
        : support > 0.65 && occupiedAtDeal > 12
          ? 3
          : cycleMoves < 12 && !rhythm?.encoreDeals
            ? 6
            : 9;
  const order = options()
    .filter((list) => SHAPES[list[0]!.shape]!.cells.length <= maxSize)
    .map((list) => ({ list, rank: next() }))
    .sort((a, b) => a.rank - b.rank);
  const reverse = next() > 0.5;
  const initialRows = Array(8).fill(0);
  board.forEach((v, i) => {
    if (v) initialRows[i >> 3] |= 1 << i % 8;
  });
  const availability = options().map(
    (list) =>
      list.filter((op) => op.rows.every((r, y) => !(r & initialRows[y])))
        .length,
  );
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
    const seen = new Map<string, Node>();
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
          if (
            depth === 2 &&
            blocked.has(
              [...parent.path, op]
                .map((p) => SHAPES[p.shape]!.family)
                .sort()
                .join(","),
            )
          )
            continue;
          const value =
            clears * clearWeight +
            lines * lineWeight -
            holes * 65 -
            edges * 2 -
            Math.abs(occupied - 12 * (1 - support)) * 2 +
            fullness * 1.1 -
            (repeated ? 180 : 0) -
            [...parent.path, op].reduce(
              (penalty, p) =>
                penalty +
                (availability[p.shape] === 0
                  ? 900
                  : 45 / availability[p.shape]!),
              0,
            );
          const key = r.join(",");
          if ((seen.get(key)?.value ?? -Infinity) >= value) continue;
          const candidate = {
            rows: r,
            path: [...parent.path, op],
            lines,
            clears,
            value,
          };
          seen.set(key, candidate);
        }
    candidates.push(...seen.values());
    candidates.sort((a, b) => b.value - a.value);
    const family = (n: Node) =>
      n.path
        .map((p) => SHAPES[p.shape]!.family)
        .sort()
        .join(",");
    const families = new Set<string>();
    beam = [];
    for (const n of candidates) {
      const key = family(n);
      if (families.has(key)) continue;
      families.add(key);
      beam.push(n);
      if (beam.length === 4) break;
    }
    const construction = [...candidates].sort(
      (a, b) =>
        b.value - b.lines * lineWeight - (a.value - a.lines * lineWeight),
    );
    for (const c of construction) {
      const key = family(c);
      if (!families.has(key)) {
        families.add(key);
        beam.push(c);
      }
      if (beam.length >= 8) break;
    }
    if (!beam.length) return null;
  }
  beam.sort((a, b) => b.value - a.value);
  const finalists = generous
    ? beam.filter((n) => n.value >= beam[0]!.value - 80)
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
