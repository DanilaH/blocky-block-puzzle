/** Shared geometry for label, sound and tactile pattern. */
export function clearSignature(cells: number[]) {
  const set = new Set(cells);
  const rows = Array.from({ length: 8 }, (_, i) => i).filter((y) =>
    Array.from({ length: 8 }, (_, x) => y * 8 + x).every((i) => set.has(i)),
  );
  const cols = Array.from({ length: 8 }, (_, i) => i).filter((x) =>
    Array.from({ length: 8 }, (_, y) => y * 8 + x).every((i) => set.has(i)),
  );
  const count = rows.length + cols.length;
  const kind =
    rows.length && cols.length
      ? "cross"
      : count >= 4
        ? "quad"
        : count === 3
          ? "triple"
          : count === 2
            ? "double"
            : "single";
  return { rows, cols, kind, count } as const;
}
