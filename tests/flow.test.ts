import { expect, it } from "vitest";
import { flowDeal } from "../src/core/flow-dealer";
import {
  emptyBoard,
  place,
  shapeById,
  newGame,
  deal,
  SHAPES,
} from "../src/core/rules";
import { createProfile, validProfile } from "../src/core/profile";
import { discoverTheme } from "../src/core/wardrobe";
it("flow returns deterministic legal three-step routes, including all-clear opportunities", () => {
  let clears = 0;
  const trays = new Set<string>();
  for (let seed = 1; seed <= 16; seed++) {
    const board = emptyBoard();
    if (seed % 2) for (const i of [48, 49, 56, 57]) board[i] = 3;
    const snapshot = JSON.stringify(board),
      d = flowDeal(board, seed)!;
    expect(d).toEqual(flowDeal(board, seed));
    expect(JSON.stringify(board)).toBe(snapshot);
    let b = board;
    const used = new Set();
    for (const m of d.witness) {
      expect(used.has(m.slot)).toBe(false);
      used.add(m.slot);
      b = place(b, shapeById(d.tray[m.slot]!.shapeId), m.x, m.y).board;
      clears += Number(b.every((c) => !c));
    }
    expect(used.size).toBe(3);
    expect(d.visited).toBeLessThan(40000);
    trays.add(
      d.tray
        .map((s) => s.shapeId)
        .sort()
        .join(),
    );
  }
  expect(clears).toBeGreaterThan(8);
  expect(trays.size).toBeGreaterThan(3);
}, 30000);
it("blocked search falls back without invalid shapes or changed legacy distribution", () => {
  expect(flowDeal(Array(64).fill(1), 3)).toBeNull();
  for (let seed = 1; seed < 100; seed++)
    expect(
      deal(emptyBoard(), seed, "initial-v1").tray.every(
        (s) => !["D3", "L5"].includes(shapeById(s.shapeId).family),
      ),
    ).toBe(true);
  expect(SHAPES.filter((s) => ["D3", "L5"].includes(s.family))).toHaveLength(6);
  const p = createProfile(newGame(54, "flow", "flow-v1"));
  expect(validProfile(p)).toBe(true);
});
it("theme rewards survive serialization, never repeat immediately and cannot corrupt the dealer RNG", () => {
  let p = createProfile(newGame(42, "wardrobe"));
  const rng = p.game.rngState;
  for (let i = 0; i < 30; i++) {
    const old = p.wardrobe?.selected ?? 0;
    p = { ...p, wardrobe: discoverTheme(p) };
    expect(p.wardrobe!.selected).not.toBe(old);
    expect(validProfile(JSON.parse(JSON.stringify(p)))).toBe(true);
    expect(p.game.rngState).toBe(rng);
  }
  expect(p.wardrobe!.unlocked).toHaveLength(11);
  expect(
    validProfile({ ...p, wardrobe: { ...p.wardrobe, selected: 99 } }),
  ).toBe(false);
  expect(
    validProfile({ ...p, wardrobe: { ...p.wardrobe, unlocked: [0] } }),
  ).toBe(false);
});

it("successive empty-board deals avoid the previous family combination when alternatives exist", () => {
  let previous = "";
  for (let seed = 1; seed <= 12; seed++) {
    const d = flowDeal(emptyBoard(), seed, seed * 3, previous)!;
    const signature = d.tray
      .map((s) => shapeById(s.shapeId).family)
      .sort()
      .join(",");
    expect(signature).not.toBe(previous);
    previous = signature;
  }
});
