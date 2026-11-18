import { expect, it, vi } from "vitest";
import { ProductAnalytics } from "../src/platform/analytics";
import { ProfileStore } from "../src/platform/save";
import { createProfile } from "../src/core/profile";
import { newGame } from "../src/core/rules";
function harness() {
  let now = 0,
    fail = false;
  const p = createProfile(newGame(5, "g"));
  p.tutorialStep = 4;
  const a = new ProductAnalytics(null, () => now);
  const store = new ProfileStore(p, {
    load: async () => ({ profile: p, recovered: false }),
    write: async () => {
      if (fail) throw Error("disk");
    },
  });
  store.observer = a;
  return {
    a,
    store,
    time: (n: number) => (now = n),
    fail: (v: boolean) => (fail = v),
  };
}
it("emits game start only after first durable move; failed save and repeated menus do not duplicate it", async () => {
  const h = harness();
  h.a.boot(h.store.state, true, false);
  expect(h.a.snapshot().filter((e) => e.name === "game_start")).toHaveLength(0);
  const move = (p: typeof h.store.state) => ({
    ...p,
    revision: p.revision + 1,
    game: { ...p.game, moves: p.game.moves + 1, revision: p.game.revision + 1 },
  });
  h.fail(true);
  await expect(h.store.update(move)).rejects.toThrow();
  expect(h.a.snapshot().filter((e) => e.name === "game_start")).toHaveLength(0);
  h.fail(false);
  await h.store.update(move);
  h.a.setActive(true, h.store.state);
  h.a.setActive(false, h.store.state);
  h.a.setActive(true, h.store.state);
  await h.store.update(move);
  expect(h.a.snapshot().filter((e) => e.name === "game_start")).toHaveLength(1);
  expect(h.a.snapshot().filter((e) => e.name === "save_failure")).toHaveLength(
    1,
  );
});
it("persists active duration excluding pause, carries it across reload, emits defeat once", async () => {
  const h = harness();
  h.a.setActive(true, h.store.state);
  h.time(1000);
  h.a.setActive(false, h.store.state);
  h.time(10000);
  h.a.setActive(true, h.store.state);
  h.time(11000);
  await h.store.update((p) => ({
    ...p,
    revision: 1,
    game: { ...p.game, moves: 1, revision: 1 },
  }));
  expect(h.store.state.metrics!.activeMs).toBe(2000);
  const restored = new ProductAnalytics(null, () => 11000);
  h.store.observer = restored;
  restored.boot(h.store.state, false, false);
  await h.store.update((p) => ({
    ...p,
    revision: 2,
    game: { ...p.game, status: "over", revision: 2 },
  }));
  await h.store.update((p) => ({
    ...p,
    revision: 3,
    settings: { ...p.settings, sound: false },
  }));
  const ends = restored.snapshot().filter((e) => e.name === "game_end");
  expect(ends).toHaveLength(1);
  expect(ends[0]!.params.activeMs).toBe(2000);
  expect(
    restored
      .snapshot()
      .some((e) => e.name === "first_open" || e.name === "game_start"),
  ).toBe(false);
});
it("restart records old game reason and resets duration; abandoned blank game isn't a completed attempt", async () => {
  const h = harness();
  await h.store.update((p) => ({
    ...p,
    revision: 1,
    game: newGame(9, "blank"),
  }));
  expect(h.a.snapshot().filter((e) => e.name === "game_end")).toHaveLength(0);
  await h.store.update((p) => ({
    ...p,
    revision: 2,
    game: { ...p.game, moves: 1, revision: 1 },
  }));
  await h.store.update((p) => ({
    ...p,
    revision: 3,
    game: newGame(10, "next"),
  }));
  const end = h.a.snapshot().find((e) => e.name === "game_end")!;
  expect(end.params.gameId).toBe("blank");
  expect(end.params.reason).toBe("restart");
  expect(h.store.state.metrics!.gameId).toBe("next");
  expect(h.store.state.metrics!.started).toBe(false);
});
it("tutorial skip stays distinct from completion, committed hint and setting emit once", async () => {
  const h = harness();
  h.store.state.tutorialStep = 3;
  await h.store.update(
    (p) => ({ ...p, revision: 1, tutorialStep: 4 }),
    "tutorial_skip",
  );
  expect(h.a.snapshot().map((e) => e.name)).toEqual(["tutorial_skip"]);
  await h.store.update((p) => ({
    ...p,
    revision: 2,
    settings: { ...p.settings, calm: true },
  }));
  await h.store.update((p) => ({
    ...p,
    revision: 3,
    settings: { ...p.settings, calm: true },
  }));
  expect(
    h.a.snapshot().filter((e) => e.name === "intensity_setting"),
  ).toHaveLength(1);
});
it("bounded retry batches keep event IDs, serialize sends, and tolerate a failed bridge", async () => {
  vi.useFakeTimers();
  try {
    const report = vi
      .fn()
      .mockRejectedValueOnce(Error("offline"))
      .mockResolvedValue(undefined);
    const a = new ProductAnalytics({
      initialize: async () => ({ enabled: true }),
      report,
    });
    await a.init();
    for (let i = 0; i < 300; i++) a.track("clear", { streak: i });
    expect(a.snapshot()).toHaveLength(128);
    await a.flush();
    const batch = report.mock.calls[0]![0].events;
    await a.flush();
    expect(report.mock.calls[1]![0].events).toEqual(batch);
    expect(batch).toHaveLength(32);
    await a.flush();
    expect(report.mock.calls[2]![0].events[0].params.eventId).not.toBe(
      batch[0].params.eventId,
    );
    a.dispose();
    await vi.runAllTimersAsync();
    expect(report).toHaveBeenCalledTimes(3);
  } finally {
    vi.useRealTimers();
  }
});
it("broken observer callbacks never turn a durable move into a reported save failure", async () => {
  const h = harness();
  h.store.observer = {
    prepare() {
      throw Error("telemetry");
    },
    committed() {
      throw Error("telemetry");
    },
    saveFailed() {
      throw Error("telemetry");
    },
  };
  await expect(h.store.update((p) => ({ ...p, revision: 1 }))).resolves.toBe(
    true,
  );
  expect(h.store.state.revision).toBe(1);
});
