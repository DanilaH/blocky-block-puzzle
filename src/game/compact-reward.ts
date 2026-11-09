/** One label describes the complete committed move; no cosmetic point queues. */
export function compactMoveReward(move: {
  points: number;
  lines: number;
  allClear: boolean;
  newRecord: boolean;
  finishedStreak: number;
  seriesBonus: number;
  multiplier: number;
  praise: "excellent" | "good" | null;
}) {
  const tier = move.allClear
    ? "all-clear"
    : move.finishedStreak > 0
      ? "series"
      : move.lines > 1
        ? "combo"
        : move.lines
          ? "line"
          : move.newRecord
            ? "record"
            : move.praise
              ? "praise"
              : null;
  if (!tier) return null;
  const label = move.allClear
    ? "Чистое поле!"
    : move.finishedStreak > 0
      ? `Серия ${move.finishedStreak} завершена`
      : move.lines >= 4
        ? `${move.lines} линии!`
        : move.lines === 3
          ? "Тройная!"
          : move.lines === 2
            ? "Двойная!"
            : move.lines
              ? "Линия!"
              : move.newRecord
                ? "Новый рекорд!"
                : move.praise === "excellent"
                  ? "Отличный ход!"
                  : "Хороший ход!";
  return {
    tier,
    label:
      label +
      (move.lines && move.multiplier > 1
        ? ` ×${move.multiplier.toLocaleString("ru")}`
        : "") +
      (move.newRecord && tier !== "record" ? " · Рекорд!" : ""),
    points: move.points,
  };
}
