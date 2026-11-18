/** Offline candidate. No production imports this selector. */
export interface RewardCandidate {
  bag: string;
  area: number;
  lines: number;
  clears: number;
  steps: string;
  occupied: number;
  value: number;
}

/** Keep the original search; recover complete alternatives lost by final pruning.
 * Matching witness rewards is a local contract, never a promise about a player. */
export function selectRewardFrontier<T extends RewardCandidate>(
  original: T,
  archive: readonly T[],
  history: readonly string[],
  moves: number,
): T {
  if (moves < 12 || !Number.isFinite(original.value)) return original;
  const count = (bag: string) => history.filter((h) => h === bag).length;
  const repeated = count(original.bag);
  if (!repeated) return original;
  let chosen = original;
  for (const candidate of archive) {
    if (
      candidate.area !== original.area ||
      candidate.lines !== original.lines ||
      candidate.clears !== original.clears ||
      candidate.steps !== original.steps ||
      candidate.occupied > original.occupied ||
      !Number.isFinite(candidate.value) ||
      candidate.value < original.value ||
      count(candidate.bag) >= repeated
    ) continue;
    if (
      chosen === original ||
      count(candidate.bag) < count(chosen.bag) ||
      (count(candidate.bag) === count(chosen.bag) &&
        (candidate.value > chosen.value ||
          (candidate.value === chosen.value && candidate.bag < chosen.bag)))
    ) chosen = candidate;
  }
  return chosen;
}
