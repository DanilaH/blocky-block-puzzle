import type { Board } from "./rules";
/** Persisted gameplay history only: no clock, ads, session count or visual state. */
export interface RhythmState {
  pressure: number;
  dryMoves: number;
  recoveryDeals: number;
  reliefMoves: number;
  cycleMoves?: number;
  recentBags?: string[];
  encoreDeals?: number;
}
export const initialRhythm = (): RhythmState => ({
  pressure: 0,
  dryMoves: 0,
  recoveryDeals: 0,
  reliefMoves: 0,
});
export function advanceRhythm(
  previous: RhythmState,
  board: Board,
  lines: number,
  allClear: boolean,
): RhythmState {
  const dryMoves = lines ? 0 : Math.min(30, previous.dryMoves + 1);
  const occupied = board.filter(Boolean).length;
  const crowding = Math.max(0, Math.min(100, (occupied - 10) * 5));
  const drought =
    occupied >= 12 ? Math.max(0, Math.min(80, (dryMoves - 3) * 12)) : 0;
  const reliefMoves = allClear ? 0 : Math.max(0, previous.reliefMoves - 1);
  const target = Math.max(crowding, drought, reliefMoves > 0 ? 75 : 0);
  const pressure = allClear
    ? Math.round(previous.pressure * 0.25)
    : Math.round(
        previous.pressure +
          Math.max(-18, Math.min(14, target - previous.pressure)),
      );
  return {
    ...previous,
    pressure,
    dryMoves,
    reliefMoves:
      !allClear && previous.pressure < 55 && pressure >= 55 ? 18 : reliefMoves,
  };
}
export function assistance(rhythm = initialRhythm()) {
  return Math.max(
    rhythm.pressure / 100,
    rhythm.reliefMoves > 0 ? 0.95 : 0,
    rhythm.recoveryDeals ? 0.4 + rhythm.recoveryDeals * 0.2 : 0,
  );
}
export function recoveryRhythm(): RhythmState {
  return { pressure: 70, dryMoves: 0, recoveryDeals: 3, reliefMoves: 0 };
}
export function validRhythm(value: RhythmState | undefined): boolean {
  return (
    !!value &&
    Number.isInteger(value.pressure) &&
    value.pressure >= 0 &&
    value.pressure <= 100 &&
    Number.isInteger(value.dryMoves) &&
    value.dryMoves >= 0 &&
    value.dryMoves <= 30 &&
    Number.isInteger(value.recoveryDeals) &&
    value.recoveryDeals >= 0 &&
    value.recoveryDeals <= 3 &&
    Number.isInteger(value.reliefMoves) &&
    value.reliefMoves >= 0 &&
    value.reliefMoves <= 18
  );
}

/** v4: every earned theme starts a fresh buildup; manual theme selection is cosmetic. */
export const initialRhythmV4 = (): RhythmState => ({
  ...initialRhythm(),
  cycleMoves: 0,
  recentBags: [],
  encoreDeals: 0,
});
export function advanceRhythmV4(
  previous: RhythmState,
  board: Board,
  lines: number,
  allClear: boolean,
  roll: number,
): RhythmState {
  const next = advanceRhythm(previous, board, lines, allClear);
  if (allClear)
    return {
      ...next,
      pressure: 0,
      dryMoves: 0,
      reliefMoves: 0,
      cycleMoves: 0,
      encoreDeals: (previous.cycleMoves ?? 0) >= 9 && roll < 1 / 6 ? 1 : 0,
    };
  return {
    ...next,
    cycleMoves: Math.min(1000000, (previous.cycleMoves ?? 0) + 1),
  };
}
export function validRhythmV4(value: RhythmState | undefined) {
  return (
    validRhythm(value) &&
    !!value &&
    Number.isInteger(value.cycleMoves) &&
    value.cycleMoves! >= 0 &&
    value.cycleMoves! <= 1000000 &&
    Number.isInteger(value.encoreDeals) &&
    value.encoreDeals! >= 0 &&
    value.encoreDeals! <= 1 &&
    Array.isArray(value.recentBags) &&
    value.recentBags.length <= 4 &&
    value.recentBags.every(
      (s) =>
        typeof s === "string" && s.length <= 60 && /^[A-Za-z0-9,-]+$/.test(s),
    )
  );
}
