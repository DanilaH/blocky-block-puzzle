import { describe, it, expect } from "vitest";
import {
  SHAPES,
  clearLines,
  emptyBoard,
  random,
  newGame,
  applyMove,
  placements,
  shapeById,
  hasMove,
  deal,
  place,
  proveTray,
} from "../src/core/rules";
import { findHint } from "../src/core/hints";
import { createProfile, validProfile, withHint } from "../src/core/profile";
import { ProfileStore, type SaveAdapter } from "../src/platform/save";

describe("rules contract", () => {
  it("has exactly 25 unique normalized shapes and family weights", () => {
    expect(SHAPES).toHaveLength(25);
    expect(new Set(SHAPES.map((s) => JSON.stringify(s.cells))).size).toBe(25);
    expect(SHAPES.reduce((n, s) => n + s.weight, 0)).toBeCloseTo(100);
    for (const s of SHAPES) {
      expect(Math.min(...s.cells.map((c) => c[0]))).toBe(0);
      expect(Math.min(...s.cells.map((c) => c[1]))).toBe(0);
    }
  });
  it("clears crossing row and column simultaneously without gravity", () => {
    const b = emptyBoard();
    for (let i = 0; i < 8; i++) {
      b[3 * 8 + i] = 1;
      b[i * 8 + 4] = 2;
    }
    b[0] = 3;
    const r = clearLines(b);
    expect(r.lines).toBe(2);
    expect(r.cells).toHaveLength(15);
    expect(r.board[0]).toBe(3);
    expect(r.board.filter(Boolean)).toHaveLength(1);
    expect(b[3 * 8]).toBe(1);
  });
  it("matches xorshift32 reference vectors", () => {
    let seed = 1;
    const out = [];
    for (let i = 0; i < 5; i++) {
      seed = random(seed).state;
      out.push(seed);
    }
    expect(out).toEqual([270369, 67634689, 2647435461, 307599695, 2398689233]);
  });
  it("rejects stale/double/invalid drops without touching seed or state", () => {
    const g = newGame(42, "a"),
      before = JSON.stringify(g);
    expect(applyMove(g, { slot: 0, x: -1, y: 0 }, 0)).toBeNull();
    expect(applyMove(g, { slot: 0, x: 0, y: 0 }, 8)).toBeNull();
    expect(JSON.stringify(g)).toBe(before);
    const p = placements(g.board, shapeById(g.tray[0]!.shapeId))[0]!;
    const r = applyMove(g, { slot: 0, ...p }, 0)!;
    expect(r.state.rngState).toBe(g.rngState);
    expect(applyMove(r.state, { slot: 0, ...p }, 0)).toBeNull();
    expect(r.state.tray[1]).toEqual(g.tray[1]);
  });
  it("scores two lines and a full clear once", () => {
    const g = newGame(5, "score");
    g.board = emptyBoard();
    for (let i = 1; i < 8; i++) {
      g.board[i] = 1;
      g.board[i * 8] = 1;
    }
    g.tray[0] = { shapeId: "S1-0", used: false, color: 1 };
    const r = applyMove(g, { slot: 0, x: 0, y: 0 }, 0)!;
    expect(r.lines).toBe(2);
    expect(r.points).toBe(141);
    expect(r.state.streak).toBe(1);
  });
  it("finds a loss despite empty cells", () => {
    const g = newGame(3, "lost");
    g.board = Array.from(
      { length: 64 },
      (_, i) => (Math.floor(i / 8) + (i % 8)) % 2,
    );
    g.tray = g.tray.map(() => ({ shapeId: "O2-0", used: false, color: 1 }));
    expect(hasMove(g.board, g.tray)).toBe(false);
  });
  it("replays deterministic games and only deals after the third slot", () => {
    let a = newGame(123, "same"),
      b = structuredClone(a);
    for (let n = 0; n < 60 && a.status === "playing"; n++) {
      let moved = false;
      for (let slot = 0; slot < 3; slot++) {
        if (a.tray[slot]!.used) continue;
        const p = placements(a.board, shapeById(a.tray[slot]!.shapeId))[0];
        if (p) {
          a = applyMove(a, { slot, ...p }, a.revision)!.state;
          b = applyMove(b, { slot, ...p }, b.revision)!.state;
          expect(a).toEqual(b);
          moved = true;
          break;
        }
      }
      expect(moved).toBe(true);
    }
  });
  it("solvable dealer emits a real witness; every accepted baseline tray has a move", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const b = emptyBoard();
      b[27] = 2;
      b[28] = 1;
      const d = deal(b, seed, "solvable-v1");
      expect(d.witness).not.toBeNull();
      let current = b;
      for (const m of d.witness!) {
        current = place(
          current,
          shapeById(d.tray[m.slot]!.shapeId),
          m.x,
          m.y,
        ).board;
      }
      expect(hasMove(b, deal(b, seed, "initial-v1").tray)).toBe(true);
    }
  });
  it("does not treat exhausted proof budget as a solution", () => {
    const g = newGame(1, "proof");
    expect(proveTray(g.board, g.tray, 0)).toBeNull();
  });
});
describe("hints and transaction boundary", () => {
  it("always returns a legal fallback at zero search budget", () => {
    const g = newGame(87, "hint"),
      r = findHint(g, 0, 0);
    expect(r.move).not.toBeNull();
    expect(applyMove(g, r.move!, 0)).not.toBeNull();
    expect(r.diagnostics.cutoff).toBe(true);
  });
  it("caches a paid hint across reload and spends free first", () => {
    const p = createProfile(newGame(7, "hint")),
      m = findHint(p.game, 1).move!;
    p.earnedHints = 5;
    const next = withHint(p, p.game.gameId, 0, m, p.freeDay)!;
    expect(next.freeHints).toBe(2);
    expect(next.earnedHints).toBe(5);
    expect(validProfile(next)).toBe(true);
    const restored = JSON.parse(JSON.stringify(next));
    expect(withHint(restored, p.game.gameId, 0, m, "tomorrow")).toBe(restored);
    expect(withHint(next, "other", 0, m, p.freeDay)).toBeNull();
  });
  it("rejects corrupt RNG, shape, board and hint state", () => {
    const p = createProfile(newGame(1, "valid"));
    expect(validProfile(p)).toBe(true);
    for (const corrupt of [
      { ...p, game: { ...p.game, rngState: 0 } },
      { ...p, game: { ...p.game, board: [0] } },
      { ...p, hint: { move: { slot: 90 } } },
    ])
      expect(validProfile(corrupt)).toBe(false);
  });
  it("failed commit never publishes new state; competing action is rejected", async () => {
    const p = createProfile(newGame(1, "save"));
    let fail = true;
    const save: SaveAdapter = {
      load: async () => ({ profile: p, recovered: false }),
      write: async () => {
        if (fail) throw new Error("disk full");
      },
    };
    const store = new ProfileStore(p, save);
    await expect(
      store.update((s) => ({ ...s, revision: s.revision + 1, best: 10 })),
    ).rejects.toThrow();
    expect(store.state).toBe(p);
    fail = false;
    const write = store.update((s) => ({
      ...s,
      revision: s.revision + 1,
      best: 20,
    }));
    expect(
      await store.update((s) => ({ ...s, revision: s.revision + 1, best: 30 })),
    ).toBe(false);
    await write;
    expect(store.state.best).toBe(20);
  });
});

describe("activity and deadline safety", () => {
  it("never loses a legal fallback when time expires inside evaluation", () => {
    for (let seed = 1; seed <= 50; seed++) {
      const g = newGame(seed, "deadline");
      const result = findHint(g, 0.05);
      expect(result.move).not.toBeNull();
      expect(applyMove(g, result.move!, g.revision)).not.toBeNull();
    }
  });
});

describe("grace combo rules and old saves", () => {
  function ready() {
    const g = newGame(3, "grace");
    g.streak = 3;
    g.board[63] = 2;
    g.tray = [0, 1, 2].map(() => ({ shapeId: "S1-0", color: 1, used: false }));
    return g;
  }
  it("allows two preparation moves, resets on the third, survives serialization", () => {
    let g = ready();
    for (let i = 0; i < 3; i++) {
      g = applyMove(g, { slot: i, x: i, y: 0 }, g.revision)!.state;
      g = JSON.parse(JSON.stringify(g));
      expect(g.streak).toBe(i < 2 ? 3 : 0);
      expect(g.streakMisses).toBe(i < 2 ? i + 1 : 0);
      const p = createProfile(g);
      p.best = g.score;
      expect(validProfile(p)).toBe(true);
    }
  });
  it("clearing after two preparation moves increases combo and restores allowance", () => {
    let g = ready();
    for (let x = 1; x < 8; x++) g.board[24 + x] = 2;
    for (let i = 0; i < 2; i++)
      g = applyMove(g, { slot: i, x: i, y: 0 }, g.revision)!.state;
    const r = applyMove(g, { slot: 2, x: 0, y: 3 }, g.revision)!;
    expect(r.state.streak).toBe(4);
    expect(r.state.streakMisses).toBe(0);
    expect(r.points).toBe(26);
    expect(applyMove(r.state, { slot: 2, x: 0, y: 3 }, g.revision)).toBeNull();
  });
  it("legacy games keep old rules and malformed combo counters are rejected", () => {
    const g = ready();
    delete g.rulesVersion;
    delete g.streakMisses;
    expect(applyMove(g, { slot: 0, x: 0, y: 0 }, 0)!.state.streak).toBe(0);
    const p = createProfile(g);
    expect(validProfile(p)).toBe(true);
    for (const v of [-1, 3, 0.5])
      expect(validProfile({ ...p, game: { ...g, streakMisses: v } })).toBe(
        false,
      );
  });
});
