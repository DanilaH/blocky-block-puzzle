import { expect, it, vi } from "vitest";
import { newGame, hasMove } from "../src/core/rules";
import { createProfile, validProfile } from "../src/core/profile";
import {
  applyReceipt,
  prepareReward,
  revivePlan,
  claimRevive,
  emptyAds,
  canInterstitial,
  finishAttempt,
} from "../src/core/monetization";
import {
  AdsController,
  type AdBridge,
  type Receipt,
} from "../src/platform/ads";
import { ProfileStore } from "../src/platform/save";
function lost() {
  const g = newGame(3, "old");
  g.board = Array.from(
    { length: 64 },
    (_, i) => ((i % 8) + Math.floor(i / 8)) % 2,
  );
  g.tray = [0, 1, 2].map(() => ({ shapeId: "O3-0", color: 1, used: false }));
  g.status = "over";
  g.score = 142;
  g.streak = 8;
  return g;
}
function profile() {
  const p = createProfile(lost());
  p.best = 142;
  p.tutorialStep = 4;
  return p;
}
it("revive plans deterministic useful 3x3, preserves tray/RNG/score; refuses second revive", () => {
  const g = lost(),
    before = structuredClone(g),
    plan = revivePlan(g)!;
  expect(plan).not.toBeNull();
  expect(plan).toEqual(revivePlan(g));
  expect(g).toEqual(before);
  expect(hasMove(plan.game.board, plan.game.tray)).toBe(true);
  expect(plan.game.tray).toEqual(g.tray);
  expect(plan.game.score).toBe(g.score);
  expect(plan.game.rngState).toBe(g.rngState);
  expect(plan.game.streak).toBe(0);
  expect(plan.game.reviveUsed).toBe(true);
  expect(revivePlan(plan.game)).toBeNull();
  for (let i = 0; i < 64; i++)
    if (
      i % 8 < plan.x ||
      i % 8 > plan.x + 2 ||
      Math.floor(i / 8) < plan.y ||
      Math.floor(i / 8) > plan.y + 2
    )
      expect(plan.game.board[i]).toBe(g.board[i]);
});
it("hints are applied once across duplicate receipts and multiple tokens for one intent", () => {
  const p = prepareReward(profile(), "hint", "hints");
  expect(p.earnedHints).toBe(0);
  const a = applyReceipt(p, { id: "a", intentId: "hint" });
  expect(a.earnedHints).toBe(3);
  expect(a.game).toEqual(p.game);
  expect(applyReceipt(a, { id: "a", intentId: "hint" })).toBe(a);
  const b = applyReceipt(JSON.parse(JSON.stringify(a)), {
    id: "b",
    intentId: "hint",
  });
  expect(b.earnedHints).toBe(3);
  expect(validProfile(b)).toBe(true);
  expect(() =>
    applyReceipt(p, { id: "unknown", intentId: "missing" }),
  ).toThrow();
});
it("current revive atomically consumes reward and clears exact prepared cells without points", () => {
  const p = prepareReward(profile(), "revive", "revive");
  const a = applyReceipt(p, { id: "a", intentId: "revive" });
  expect(a.game).toEqual(p.ads!.intents[0]!.plan!.game);
  expect(a.best).toBe(p.best);
  expect(validProfile(a)).toBe(true);
  expect(() => prepareReward(a, "second", "revive")).toThrow();
});
it("late revive never overwrites new game; archived entitlement can be claimed once after reload", () => {
  const p = prepareReward(profile(), "revive", "revive");
  p.game = newGame(8, "new");
  const a = applyReceipt(p, { id: "a", intentId: "revive" });
  expect(a.game.gameId).toBe("new");
  expect(a.ads!.intents[0]!.status).toBe("available");
  const b = claimRevive(JSON.parse(JSON.stringify(a)), "revive");
  expect(b.game.gameId).toBe("old");
  expect(b.game.reviveUsed).toBe(true);
  expect(validProfile(b)).toBe(true);
  expect(() => claimRevive(b, "revive")).toThrow();
  expect(applyReceipt(b, { id: "a", intentId: "revive" })).toBe(b);
});
it("malformed prepared effects are rejected while pre-ads profiles remain valid", () => {
  expect(validProfile(profile())).toBe(true);
  const p = prepareReward(profile(), "revive", "revive");
  expect(validProfile(p)).toBe(true);
  p.ads!.intents[0]!.plan!.game.score++;
  expect(validProfile(p)).toBe(false);
});
it("interstitial gate enforces final state, two completed games, active interval and sliding hour", () => {
  let p = profile();
  p.ads = { ...emptyAds(), activeMs: 180000, completed: ["one"] };
  p = finishAttempt(p);
  expect(p.ads!.completed).toHaveLength(2);
  expect(finishAttempt(p)).toBe(p);
  const now = 180000;
  expect(canInterstitial(p, now)).toBe(true);
  p.ads!.lastFullscreenMs = 1;
  expect(canInterstitial(p, now)).toBe(false);
  p.ads!.lastFullscreenMs = 0;
  p.ads!.interstitials = [now - 100, now - 200, now - 300];
  expect(canInterstitial(p, now)).toBe(false);
  p.ads!.interstitials[0] = now - 3600001;
  expect(canInterstitial(p, now)).toBe(true);
  p.game.status = "playing";
  expect(canInterstitial(p, now)).toBe(false);
});
function harness() {
  let durable = createProfile(newGame(2, "current")),
    fail = false;
  durable.tutorialStep = 4;
  const store = new ProfileStore(durable, {
    load: async () => ({ profile: durable, recovered: false }),
    write: async (p) => {
      if (fail) throw Error("disk");
      durable = structuredClone(p);
    },
  });
  const listeners: Record<string, (r: any) => void> = {};
  let receipts: Receipt[] = [];
  const bridge = {
    initialize: async () => ({ enabled: true }),
    pending: async () => ({ rewards: receipts }),
    acknowledge: vi.fn(async ({ id }) => {
      receipts = receipts.filter((r) => r.id !== id);
    }),
    status: async () => ({ rewarded: true, interstitial: true }),
    preload: async () => {},
    addListener: async (n: string, fn: (r: any) => void) => {
      listeners[n] = fn;
      return { remove: async () => {} };
    },
    show: vi.fn(async () => ({ status: "closed" })),
  } as unknown as AdBridge;
  const block = vi.fn(),
    problem = vi.fn(),
    controller = new AdsController(store, bridge, block, () => {}, problem);
  return {
    store,
    bridge,
    controller,
    block,
    problem,
    fail: (v: boolean) => (fail = v),
    receipts: (r: Receipt[]) => (receipts = r),
    listeners,
  };
}
it("dismiss without reward grants nothing; duplicate event/result/startup delivery grants exactly once", async () => {
  const h = harness();
  await h.controller.init();
  expect(await h.controller.rewarded("hints")).toBe("closed");
  expect(h.store.state.earnedHints).toBe(0);
  const intent = h.store.state.ads!.intents[0]!;
  const r = { id: "token", intentId: intent.id };
  h.receipts([r]);
  h.listeners.reward!(r);
  await h.controller.recover();
  await h.controller.recover();
  expect(h.store.state.earnedHints).toBe(3);
  expect(h.store.state.ads!.receipts).toEqual(["token"]);
});
it("failed commit leaves native receipt unacknowledged, recovery retries safely", async () => {
  const h = harness();
  await h.controller.init();
  await h.controller.rewarded("hints");
  const r = { id: "token", intentId: h.store.state.ads!.intents[0]!.id };
  h.receipts([r]);
  h.fail(true);
  await h.controller.recover();
  expect(h.bridge.acknowledge).not.toHaveBeenCalled();
  expect(h.store.state.earnedHints).toBe(0);
  h.fail(false);
  await h.controller.recover();
  expect(h.store.state.earnedHints).toBe(3);
  expect(h.bridge.acknowledge).toHaveBeenCalledOnce();
});
it("no ad request when intent save fails; foreground gate is released", async () => {
  const h = harness();
  await h.controller.init();
  h.fail(true);
  expect(await h.controller.rewarded("hints")).toBe("error");
  expect(h.bridge.show).not.toHaveBeenCalled();
  expect(h.controller.busy).toBe(false);
  expect(h.block).toHaveBeenLastCalledWith(false);
});
it("only active gameplay contributes time; conservative fullscreen reservation survives serialization", async () => {
  const h = harness();
  vi.spyOn(performance, "now").mockReturnValue(1000);
  h.controller.setActive(true);
  vi.mocked(performance.now).mockReturnValue(181000);
  h.controller.setActive(false);
  vi.mocked(performance.now).mockReturnValue(900000);
  const p = h.controller.stamp(h.store.state);
  expect(p.ads!.activeMs).toBe(180000);
  vi.restoreAllMocks();
});
it("receipts wait for ordinary save, then rebase on its committed state", async () => {
  const h = harness();
  await h.controller.init();
  await h.controller.rewarded("hints");
  let release!: () => void;
  const p = h.store.state;
  const store = new ProfileStore(p, {
    load: async () => ({ profile: p, recovered: false }),
    write: async () => {
      await new Promise<void>((r) => (release = r));
    },
  });
  const writing = store.update((p) => ({
    ...p,
    revision: p.revision + 1,
    best: p.best + 1,
  }));
  let ready = false;
  const waiting = store.waitIdle().then(() => (ready = true));
  await Promise.resolve();
  expect(ready).toBe(false);
  release();
  await writing;
  await waiting;
  expect(ready).toBe(true);
  expect(store.state.best).toBe(1);
});
it("failed native acknowledgement retries without granting again", async () => {
  const h = harness();
  await h.controller.init();
  await h.controller.rewarded("hints");
  h.receipts([{ id: "ack-fail", intentId: h.store.state.ads!.intents[0]!.id }]);
  vi.mocked(h.bridge.acknowledge).mockRejectedValueOnce(Error("ack failure"));
  await h.controller.recover();
  expect(h.store.state.earnedHints).toBe(3);
  await h.controller.recover();
  expect(h.store.state.earnedHints).toBe(3);
  expect(h.bridge.acknowledge).toHaveBeenCalledTimes(2);
});
it("late reward during interstitial cannot replace newly committed game", async () => {
  const h = harness();
  await h.controller.init();
  h.store.state = prepareReward(profile(), "old-revive", "revive");
  h.store.state.ads!.activeMs = 180001;
  h.store.state.ads!.lastFullscreenMs = 0;
  h.store.state.ads!.completed = ["earlier"];
  vi.mocked(h.bridge.show).mockImplementationOnce(async () => {
    expect(h.store.state.game.gameId).toBe("next");
    h.receipts([{ id: "late", intentId: "old-revive" }]);
    await h.controller.recover();
    return { status: "closed", shown: true };
  });
  expect(await h.controller.betweenGames(newGame(4, "next"))).toBe(true);
  expect(h.store.state.game.gameId).toBe("next");
  expect(h.store.state.ads!.intents[0]!.status).toBe("available");
});
it("wall clock changes do not expire the conservative hourly active-play cap", () => {
  const p = profile();
  p.ads = {
    ...emptyAds(),
    activeMs: 500000,
    completed: ["a", "b"],
    interstitials: [200000, 300000, 400000],
  };
  expect(canInterstitial(p, 0)).toBe(false);
  expect(canInterstitial(p, Date.now() + 9e10)).toBe(false);
});
it("locks immediately on consent while native readiness is pending", async () => {
  const h = harness();
  await h.controller.init();
  let resolve!: (v: { rewarded: boolean; interstitial: boolean }) => void;
  h.bridge.status = () => new Promise((r) => (resolve = r));
  const result = h.controller.rewarded("hints");
  expect(h.controller.busy).toBe(true);
  expect(h.block).toHaveBeenLastCalledWith(true);
  resolve({ rewarded: false, interstitial: false });
  expect(await result).toBe("unavailable");
  expect(h.controller.busy).toBe(false);
});
it("retry of the same pending revive restarts fullscreen cooldown", async () => {
  const h = harness();
  await h.controller.init();
  h.store.state = profile();
  await h.controller.rewarded("revive");
  const id = h.store.state.ads!.intents[0]!.id;
  h.store.state.ads!.activeMs = 240000;
  await h.controller.rewarded("revive");
  expect(h.store.state.ads!.intents).toHaveLength(1);
  expect(h.store.state.ads!.intents[0]!.id).toBe(id);
  expect(h.store.state.ads!.lastFullscreenMs).toBe(240000);
});
it("late confirmed reward postpones interstitial from delivery, not old intent time", () => {
  let p = prepareReward(profile(), "late", "hints");
  p.ads!.activeMs = 500000;
  p.ads!.completed = ["a", "b"];
  p = applyReceipt(p, { id: "receipt", intentId: "late" });
  expect(p.ads!.lastFullscreenMs).toBe(500000);
  expect(canInterstitial(p)).toBe(false);
});
