import { expect, it } from "vitest";
import { newGame } from "../src/core/rules";
import { createProfile, validProfile } from "../src/core/profile";
import {
  compactRewards,
  prepareReward,
  applyReceipt,
  claimRevive,
  emptyAds,
} from "../src/core/monetization";
import { ProfileStore } from "../src/platform/save";
import { AdsController } from "../src/platform/ads";
function lost() {
  const p = createProfile(newGame(3, "old"));
  p.tutorialStep = 4;
  p.game.board = Array.from(
    { length: 64 },
    (_, i) => ((i % 8) + Math.floor(i / 8)) % 2,
  );
  p.game.tray = [0, 1, 2].map(() => ({
    shapeId: "O3-0",
    color: 1,
    used: false,
  }));
  p.game.status = "over";
  return p;
}
it("compacts 1000 legacy hints without losing tokens, pending snapshots or duplicate protection", () => {
  const p = prepareReward(createProfile(newGame(7, "g")), "pending", "hints");
  const pending = structuredClone(p.ads!.intents[0]!);
  p.ads!.intents.push(
    ...Array.from({ length: 1000 }, (_, n) => ({
      ...pending,
      id: `h${n}`,
      status: "applied" as const,
    })),
  );
  p.ads!.receipts = Array.from({ length: 1000 }, (_, n) => `r${n}`);
  p.earnedHints = 3000;
  const bytes = JSON.stringify(p).length;
  const compact = JSON.parse(JSON.stringify(compactRewards(p)));
  expect(validProfile(compact)).toBe(true);
  expect(compact.ads.intents[0]).toEqual(pending);
  expect(compact.ads.receipts).toEqual(p.ads!.receipts);
  expect(JSON.stringify(compact).length).toBeLessThan(bytes * 0.4);
  expect(compactRewards(compact)).toBe(compact);
  expect(applyReceipt(compact, { id: "r0", intentId: "h0" })).toBe(compact);
  expect(
    applyReceipt(compact, { id: "late-new-token", intentId: "h0" }).earnedHints,
  ).toBe(3000);
  expect(
    applyReceipt(compact, { id: "new", intentId: "pending" }).earnedHints,
  ).toBe(3003);
});
it("keeps late revive intact; claimed right becomes a validated small marker", () => {
  let p = prepareReward(lost(), "revive", "revive");
  const snapshot = structuredClone(p.ads!.intents[0]);
  p = compactRewards(p);
  expect(p.ads!.intents[0]).toEqual(snapshot);
  p.game = newGame(8, "next");
  p = compactRewards(applyReceipt(p, { id: "earned", intentId: "revive" }));
  expect(p.ads!.intents[0]!.status).toBe("available");
  expect(p.ads!.intents[0]!.plan).toBeDefined();
  p = compactRewards(claimRevive(JSON.parse(JSON.stringify(p)), "revive"));
  expect(p.game.reviveUsed).toBe(true);
  expect(p.ads!.intents[0]!.plan).toBeUndefined();
  expect(validProfile(p)).toBe(true);
  expect(() => claimRevive(p, "revive")).toThrow();
  expect(applyReceipt(p, { id: "late", intentId: "revive" }).game).toEqual(
    p.game,
  );
});
it("never compacts an unconsumed applied revive, nor reopens a consumed one on next defeat", async () => {
  let p = applyReceipt(prepareReward(lost(), "revive", "revive"), {
    id: "r",
    intentId: "revive",
  });
  expect(compactRewards(p).ads!.intents[0]!.plan).toBeDefined();
  // Simulate a later, genuinely different defeat after playing beyond the revive.
  p.game = { ...lost().game, moves: p.game.moves + 2, reviveUsed: true };
  const store = new ProfileStore(p, {
    load: async () => ({ profile: p, recovered: false }),
    write: async () => {},
  });
  const ads = new AdsController(
    store,
    null,
    () => {},
    () => {},
    () => {},
  );
  await ads.betweenGames(newGame(2, "next"));
  expect(store.state.ads!.intents[0]!.status).toBe("applied");
  expect(store.state.ads!.intents[0]!.compact).toBe(true);
  expect(validProfile(store.state)).toBe(true);
  // Normal played continuation compacts while it is still the active game.
  p = compactRewards(p);
  expect(p.ads!.intents[0]!.compact).toBe(true);
});
it("failed compact write publishes neither migration nor reward; successful retry is durable", async () => {
  const p = prepareReward(createProfile(newGame(2, "g")), "hint", "hints");
  let fail = true,
    durable = p;
  const store = new ProfileStore(p, {
    load: async () => ({ profile: durable, recovered: false }),
    write: async (n) => {
      if (fail) throw Error("disk");
      durable = structuredClone(n);
    },
  });
  await expect(
    store.update((p) => applyReceipt(p, { id: "r", intentId: "hint" })),
  ).rejects.toThrow();
  expect(store.state).toBe(p);
  expect(durable.earnedHints).toBe(0);
  fail = false;
  await store.update((p) => applyReceipt(p, { id: "r", intentId: "hint" }));
  expect(durable.earnedHints).toBe(3);
  expect(durable.ads!.intents[0]!.snapshot).toBeUndefined();
  expect(validProfile(durable)).toBe(true);
});
it("rejects incomplete compact pending/available states and unknown ledger versions", () => {
  const p = compactRewards(
    applyReceipt(prepareReward(lost(), "h", "hints"), {
      id: "r",
      intentId: "h",
    }),
  );
  for (const status of ["pending", "available"] as const) {
    const v = structuredClone(p);
    v.ads!.intents[0]!.status = status;
    expect(validProfile(v)).toBe(false);
  }
  const v = structuredClone(p);
  (v.ads as any).ledgerVersion = 3;
  expect(validProfile(v)).toBe(false);
});

it("leaving an applied but unplayed revive preserves its archived right", async () => {
  const p = applyReceipt(prepareReward(lost(), "revive", "revive"), {
    id: "r",
    intentId: "revive",
  });
  const store = new ProfileStore(p, {
    load: async () => ({ profile: p, recovered: false }),
    write: async () => {},
  });
  await store.update((p) => ({
    ...p,
    revision: p.revision + 1,
    game: newGame(9, "next"),
  }));
  expect(store.state.ads!.intents[0]!.status).toBe("available");
  expect(validProfile(store.state)).toBe(true);
  expect(claimRevive(store.state, "revive").game).toEqual(p.game);
});
