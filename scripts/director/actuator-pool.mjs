// Offline experiment helper. Historical actuator runner remains unchanged.
export const key = (t) =>
  t
    .map((s) => s.shapeId)
    .sort()
    .join(",");
export const overlap = (t, h) =>
  h.length
    ? h.reduce((sum, old) => {
        const ids = old.map((s) => s.shapeId);
        let n = 0;
        for (const s of t) {
          const i = ids.indexOf(s.shapeId);
          if (i >= 0) {
            n++;
            ids.splice(i, 1);
          }
        }
        return sum + n / 3;
      }, 0) / h.length
    : 0;
export function candidatePool(R, B, p) {
  let rng = (p.seed ^ Math.imul(p.state.moves + 1, 2654435761)) >>> 0 || 1;
  const next = () => {
    const r = R.random(rng);
    rng = r.state;
    return r.value;
  };
  const pool = [{ tray: p.state.tray, source: "baseline" }];
  for (let i = 0; i < 3; i++)
    pool.push({
      tray: R.deal(
        p.state.board,
        Math.floor(next() * 4294967295) || 1,
        "flow-v4",
        p.state.moves,
        "",
        p.state.rhythm,
      ).tray,
      source: "flow",
    });
  const total = R.SHAPES.reduce((n, s) => n + s.weight, 0);
  for (let i = 0; i < 4; i++)
    pool.push({
      source: "weighted",
      tray: Array.from({ length: 3 }, () => {
        let v = next() * total;
        let shape = R.SHAPES.at(-1);
        for (const s of R.SHAPES) {
          v -= s.weight;
          if (v < 0) {
            shape = s;
            break;
          }
        }
        return { shapeId: shape.id, used: false, color: 1 };
      }),
    });
  const unique = pool.filter(
    (x, i) => pool.findIndex((y) => key(x.tray) === key(y.tray)) === i,
  );
  for (const c of unique) {
    c.witness = R.proveTray(p.state.board, c.tray, 20000);
    c.models = ["lines", "space"].map((t) =>
      B.resilience(p.state.board, c.tray, t),
    );
    c.known = c.models.every((m) => m.complete);
    c.success = c.known ? Math.min(...c.models.map((m) => m.success)) : null;
    c.lines = c.known
      ? c.models.reduce((n, m) => n + m.expectedLines, 0) / 2
      : null;
    c.occupied = c.known
      ? c.models.reduce((n, m) => n + m.expectedOccupied, 0) / 2
      : null;
    c.repeat = overlap(c.tray, p.history);
    if (c.witness) {
      let b = p.state.board;
      const used = new Set();
      for (const m of c.witness) {
        if (
          used.has(m.slot) ||
          !R.fits(b, R.shapeById(c.tray[m.slot].shapeId), m.x, m.y)
        )
          throw Error("invalid proof");
        used.add(m.slot);
        b = R.place(b, R.shapeById(c.tray[m.slot].shapeId), m.x, m.y).board;
      }
      if (used.size !== 3) throw Error("incomplete proof");
    }
  }

  return unique;
}
