/** Construct actual dependencies, rather than hoping uniform samples contain them. */
import { SHAPES, random, type Board, type Slot } from "../../src/core/rules";
import { actions, toRows, transition } from "../difficulty/analyze";
export function constructTasks(board: Board, seed: number) {
  const tray: Slot[] = SHAPES.map((s) => ({
    shapeId: s.id,
    used: false,
    color: 1,
  }));
  const rows = toRows(board),
    initial = actions(rows, tray),
    initialKinds = new Set(initial.map((a) => a.slot));
  let rng = seed;
  const rank = () => {
    const r = random(rng);
    rng = r.state;
    return r.value;
  };
  const ordered = initial
    .map((op) => ({ op, rank: rank() }))
    .sort((a, b) => a.rank - b.rank);
  const proposals: { tray: Slot[]; source: string }[] = [];
  let transitions = 0;
  for (const kind of ["order", "prepare"]) {
    const starts = ordered
      .filter(
        ({ op }) => Boolean(transition(rows, op).lines) === (kind === "order"),
      )
      .slice(0, 6);
    outer: for (const { op: a } of starts) {
      const first = transition(rows, a);
      transitions++;
      const options = actions(first.rows, tray),
        afterFirstKinds = new Set(options.map((b) => b.slot));
      const seconds = options
        .filter((b) =>
          kind === "order"
            ? !initialKinds.has(b.slot)
            : transition(first.rows, b).lines > 0,
        )
        .slice(0, 12);
      for (const b of seconds) {
        const second = transition(first.rows, b);
        transitions++;
        // Third piece must be unavailable initially; prefer a dependency on BOTH earlier placements.
        const thirds = actions(second.rows, tray).filter(
          (c) => !initialKinds.has(c.slot),
        );
        thirds.sort(
          (c, d) =>
            Number(afterFirstKinds.has(c.slot)) -
            Number(afterFirstKinds.has(d.slot)),
        );
        const c = thirds[0];
        if (!c) continue;
        const ids = [a.slot, b.slot, c.slot];
        const selected = ids.map((i) => ({ ...tray[i]! }));
        // Shuffle visible tray order, so the construction sequence is not a hint.
        const shuffled = selected
          .map((s) => ({ s, r: rank() }))
          .sort((a, b) => a.r - b.r)
          .map((x) => x.s);
        proposals.push({ tray: shuffled, source: "recipe-" + kind });
        break outer;
      }
    }
  }
  return { proposals, transitions, rng };
}
