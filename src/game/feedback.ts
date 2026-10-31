// Presentation only: no rules, RNG or persisted state.
export function contactScale(age: number): number {
  if (age < 0 || age >= 120) return 1;
  // Immediate compression, one restrained rebound, then rest.
  if (age < 35) return 0.84 + 0.24 * (age / 35);
  const t = (age - 35) / 85;
  return 1 + 0.08 * (1 - t) ** 2;
}
export function waveOrigins(placed: number[]) {
  const rows = Array<number>(8).fill(3.5),
    columns = Array<number>(8).fill(3.5);
  for (let n = 0; n < 8; n++) {
    const row = placed.filter((i) => Math.floor(i / 8) === n);
    const col = placed.filter((i) => i % 8 === n);
    if (row.length)
      rows[n] = row.reduce((sum, i) => sum + (i % 8), 0) / row.length;
    if (col.length)
      columns[n] =
        col.reduce((sum, i) => sum + Math.floor(i / 8), 0) / col.length;
  }
  return { rows, columns };
}
export function clearWaveDelay(
  i: number,
  rows: number[],
  columns: number[],
  origins: ReturnType<typeof waveOrigins>,
) {
  const x = i % 8,
    y = Math.floor(i / 8);
  return (
    40 +
    28 *
      Math.min(
        rows.includes(y) ? Math.abs(x - origins.rows[y]!) : Infinity,
        columns.includes(x) ? Math.abs(y - origins.columns[x]!) : Infinity,
      )
  );
}

// Shared envelope: cosmetic time never changes the logical combo.
export class Celebration {
  private value = 0;
  private at = 0;
  level(now: number) {
    return (
      this.value * Math.max(0, 1 - Math.max(0, now - this.at) / 2800) ** 1.4
    );
  }
  add(lines: number, now: number) {
    this.value = Math.min(
      1,
      this.level(now) + 0.55 + Math.min(3, lines) * 0.15,
    );
    this.at = now;
    return this.value;
  }
  reset() {
    this.value = 0;
  }
}
