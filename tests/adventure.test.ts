import { describe, it, expect } from "vitest";
import { LEVELS, validateLevels } from "../src/adventure/levels";
import {
  startAttempt,
  step,
  replay,
  canPlace,
  emptyCampaign,
  commitAttempt,
  validateLevel,
} from "../src/adventure/core";
import {
  acceptMove,
  beginLevel,
  acceptHint,
  validCampaign,
} from "../src/adventure/save";
import { createProfile, validProfile } from "../src/core/profile";
import { newGame } from "../src/core/rules";
import { ProfileStore } from "../src/platform/save";
describe("campaign contracts", () => {
  it("validates five finite authored solutions and all saved intermediate states", () => {
    validateLevels();
    let p = createProfile(newGame(12, "classic"));
    const original = structuredClone(p.game);
    for (const l of LEVELS) {
      p = beginLevel(p, l.id, l.id)!;
      expect(validProfile(p)).toBe(true);
      for (const m of l.solution) {
        const a = p.campaign!.active!;
        p = acceptMove(p, a.id, a.revision, m)!;
        expect(validProfile(p)).toBe(true);
      }
      expect(p.campaign!.active!.status).toBe("won");
    }
    expect(p.game).toEqual(original);
    expect(p.campaign!.rewards).toHaveLength(5);
  });
  it("ice loses one layer and the anchored item survives until the final hit", () => {
    const l = LEVELS[1]!;
    let a = startAttempt(l, "ice");
    a = step(l, a, l.solution[0]!)!.state;
    expect(a.ice[26]).toBe(1);
    expect(a.board[26]).toBe(0);
    expect(a.objects.some((o) => o.cell === 26)).toBe(true);
    a = step(l, a, l.solution[1]!)!.state;
    a = step(l, a, l.solution[2]!)!.state;
    expect(a.ice[26]).toBe(0);
    expect(a.collected.gem).toBe(1);
  });
  it("key in same clear unlocks but cannot retrospectively collect lock", () => {
    const l = structuredClone(LEVELS[2]!);
    l.board = Array(64).fill(0);
    for (let x = 0; x < 7; x++) l.board[x] = 1;
    l.board[1] = 0;
    l.objects = [
      { id: "k", kind: "key", cell: 0 },
      { id: "l", kind: "lock", cell: 1, threshold: 1, open: false },
    ];
    l.trays[0]![0]!.shapeId = "S1-0";
    l.goals = { gem: 1 };
    const r = step(l, startAttempt(l, "k"), { slot: 0, x: 7, y: 0 })!;
    expect(r.state.collected.key).toBe(1);
    expect(r.state.collected.gem).toBe(0);
    expect(r.state.objects[0]!.open).toBe(true);
  });
  it("row/column intersection damages ice once", () => {
    const l = structuredClone(LEVELS[0]!);
    l.board = Array(64).fill(0);
    for (let i = 0; i < 8; i++) {
      l.board[i] = 1;
      l.board[i * 8] = 1;
    }
    l.board[0] = 0;
    l.ice[0] = 2;
    l.objects = [];
    l.goals = { ice: 1 };
    l.trays[0]![0]!.shapeId = "S1-0";
    const r = step(l, startAttempt(l, "cross"), { slot: 0, x: 0, y: 0 })!;
    expect(r.event.lines).toBe(2);
    expect(r.state.ice[0]).toBe(1);
  });
  it("rejects carried item overlap and duplicate IDs", () => {
    const l = structuredClone(LEVELS[0]!);
    l.objects.push({ id: "anchor", kind: "key", cell: 19 });
    l.trays[0]![0]!.items = [{ id: "carried", offset: 0, kind: "gem" }];
    expect(canPlace(startAttempt(l, "a"), { slot: 0, x: 3, y: 2 })).toBe(false);
    l.objects[1]!.id = l.objects[0]!.id;
    expect(() => validateLevel(l)).toThrow();
  });
  it("wins on final figure before exhaustion, otherwise loses without extra dealer", () => {
    const l = LEVELS[0]!;
    expect(replay(l).status).toBe("won");
    const fail = structuredClone(l);
    fail.goals.gem = 5;
    let a = startAttempt(fail, "end");
    for (const m of l.solution) a = step(fail, a, m)!.state;
    expect(a.status).toBe("lost");
    expect(a.reason).toBe("exhausted");
    expect(a.nextTray).toBe(1);
  });
  it("atomically awards only first completion and rejects locked levels/stale moves", () => {
    let p = createProfile(newGame(12, "classic"));
    expect(beginLevel(p, LEVELS[4]!.id, "bad")).toBe(null);
    p = beginLevel(p, LEVELS[0]!.id, "a")!;
    expect(acceptMove(p, "old", 0, LEVELS[0]!.solution[0]!)).toBe(null);
    const l = LEVELS[0]!,
      a = replay(l);
    let c = commitAttempt(emptyCampaign(), l, a);
    c = commitAttempt(c, l, { ...a, id: "retry" });
    expect(c.rewards).toHaveLength(1);
    expect(validCampaign(c)).toBe(true);
  });
  it("hint debit is shared, persisted and bound to mode/attempt/version/revision", () => {
    let p = beginLevel(
      createProfile(newGame(12, "classic")),
      LEVELS[0]!.id,
      "a",
    )!;
    const req = {
      mode: "adventure" as const,
      attemptId: "a",
      levelId: LEVELS[0]!.id,
      levelVersion: 1 as const,
      revision: 0,
      move: LEVELS[0]!.solution[0]!,
    };
    p = acceptHint(p, req)!;
    expect(p.freeHints).toBe(2);
    expect(acceptHint(p, req)).toBe(p);
    expect(acceptHint(p, { ...req, attemptId: "b" })).toBe(null);
    expect(validProfile(p)).toBe(true);
  });
  it("storage failure leaves victory, picture and classic untouched", async () => {
    const l = LEVELS[0]!;
    let p = beginLevel(createProfile(newGame(12, "classic")), l.id, "a")!;
    for (const m of l.solution.slice(0, -1)) {
      const a = p.campaign!.active!;
      p = acceptMove(p, a.id, a.revision, m)!;
    }
    const store = new ProfileStore(p, {
      load: async () => ({ profile: p, recovered: false }),
      write: async () => {
        throw Error("quota");
      },
    });
    const before = structuredClone(p),
      a = p.campaign!.active!;
    await expect(
      store.update((p) => acceptMove(p, a.id, a.revision, l.solution.at(-1)!)),
    ).rejects.toThrow("quota");
    expect(store.state).toEqual(before);
  });
});
