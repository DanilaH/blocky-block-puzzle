import { it, expect } from "vitest";
import { createProfile, validProfile } from "../src/core/profile";
import { newGame, applyMove } from "../src/core/rules";
import { lessonGame, LESSON_MOVES } from "../src/core/tutorial";
it("practice demonstrates placement, clear and refill with valid saved profiles", () => {
  for (let step = 0; step < 3; step++) {
    const result = applyMove(lessonGame(step), LESSON_MOVES[step]!, step)!;
    expect(result).not.toBeNull();
    if (step === 0) expect(result.lines).toBe(0);
    if (step === 1) expect(result.lines).toBe(1);
    if (step === 2) expect(result.state.tray.every((s) => !s.used)).toBe(true);
    expect(result.state).toEqual(lessonGame(step + 1));
  }
  const p = createProfile(newGame(123, "save"));
  expect(validProfile(p)).toBe(true);
  delete p.tutorialStep;
  expect(validProfile(p)).toBe(true);
  p.tutorialStep = 5;
  expect(validProfile(p)).toBe(false);
  p.tutorialStep = 1.5;
  expect(validProfile(p)).toBe(false);
});
