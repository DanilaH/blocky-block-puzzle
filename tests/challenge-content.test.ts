import { it, expect } from "vitest";
import {
  newGame,
  applyMove,
  random,
  replayDecision,
  emptyBoard,
  shapeById,
  place,
  type GameState,
} from "../src/core/rules";
import { goalDirectorDeal } from "../src/core/goal-director";
import {
  initialChallengeState,
  validChallengeState,
  challengeDirectorDeal,
  observeChallenge,
} from "../src/core/challenge-director";
import {
  CHALLENGE_OPENINGS,
  challengeOpening,
  challengeOpeningIndex,
  openingDecisionKey,
  seedForChallengeOpening,
} from "../src/core/challenge-openings";
import {
  chooseMixed,
  type MixedStyle,
} from "../scripts/director/mixed-players";
import { inspectChoices } from "../scripts/challenge-content/oracle";
import { createProfile, validProfile } from "../src/core/profile";
import {
  ensureExperiment,
  rememberChallengeOpening,
  CHALLENGE_EXPERIMENT,
  assignedDealer,
} from "../src/core/experiment";
import { PlayCapture } from "../src/platform/play-capture";
import { ProfileStore } from "../src/platform/save";
import { replayRecord } from "../scripts/calibration/replay";
import { DecisionPlayClock } from "../src/platform/decision-clock";
import { prepareReward, applyReceipt } from "../src/core/monetization";
import { initialRhythmV4 } from "../src/core/rhythm";
import { initialGoalDirector } from "../src/core/goal-director";
import { AdsController } from "../src/platform/ads";
import { finishGoal } from "../src/core/director-goal-tools";
import { WorkBudget, toRows } from "../src/core/director-search";
import { SHAPES } from "../src/core/rules";

it("retains a complete rewarding incumbent when a preferred exact-cover task is not found before budget ends", () => {
  const board = emptyBoard();
  board.fill(1, 0, 5);
  const rank = SHAPES.map((_, i) => i);
  const original = finishGoal(toRows(board), new WorkBudget(6000), rank);
  expect(original).not.toBeNull();
  const meter = new WorkBudget(6000),
    fallback = finishGoal(toRows(board), meter, rank, undefined, () => false);
  expect(fallback).toEqual(original);
  expect(meter.used).toBeLessThanOrEqual(6000);
  let b = board;
  for (const op of fallback!) b = place(b, SHAPES[op.shape]!, op.x, op.y).board;
  expect(b.some(Boolean)).toBe(false);
});

it("terminal new-game path commits the new opener atomically and preserves the existing rights", async () => {
  const g = newGame(42, "ended", "director-v2");
  g.status = "over";
  g.board = Array.from({ length: 64 }, (_, i) => (i + (i >> 3)) % 2);
  g.tray.forEach((s) => (s.shapeId = "O3-0"));
  const p = ensureExperiment(
    { ...createProfile(g), earnedHints: 5, freeHints: 2, best: 100 },
    1,
    false,
    "terminal",
  );
  let fail = true;
  const store = new ProfileStore(p, {
    load: async () => ({ profile: p, recovered: false }),
    write: async () => {
      if (fail) throw Error("quota");
    },
  });
  const ads = new AdsController(
      store,
      null,
      () => {},
      () => {},
      () => {},
    ),
    next = newGame(8101001, "next", "director-challenge-v1");
  await expect(ads.betweenGames(next)).rejects.toThrow("quota");
  expect(store.state).toEqual(p);
  expect(ads.busy).toBe(false);
  fail = false;
  expect(await ads.betweenGames(next)).toBe(true);
  expect(store.state.experiment!.challengeOpeningHistory).toEqual([
    next.challengeState!.openingKey,
  ]);
  expect(store.state.revision).toBe(p.revision + 1);
  expect(store.state.earnedHints).toBe(5);
  expect(store.state.freeHints).toBe(2);
  expect(store.state.best).toBe(100);
  expect(validProfile(store.state)).toBe(true);
});

it("advances an interrupted focus window before reopening it, while keeping the reward and recovery priorities", () => {
  const state = {
    ...initialChallengeState("tasks"),
    phase: "BUILD" as const,
    windowEndsAt: 14,
    nextWindowAt: 13,
  };
  const rhythm = initialRhythmV4(),
    saved = { ...initialGoalDirector(), deals: 13, rest: 1 };
  const reward = challengeDirectorDeal(
    emptyBoard(),
    91,
    39,
    rhythm,
    saved,
    state,
  );
  expect(reward.challengeDecision.focus).toBeNull();
  const gap = challengeDirectorDeal(
    emptyBoard(),
    91,
    42,
    rhythm,
    { ...saved, deals: 14, rest: 0 },
    reward.challengeState,
  );
  expect(gap.challengeDecision.focus).toBeNull();
  expect(gap.challengeState.nextFocus).toBe("choice");
  const next = challengeDirectorDeal(
    emptyBoard(),
    91,
    45,
    rhythm,
    { ...saved, deals: 15, rest: 0 },
    gap.challengeState,
  );
  expect(next.challengeDecision.focus).toBe("choice");
  const protectedDeal = challengeDirectorDeal(
    emptyBoard(),
    91,
    45,
    { ...rhythm, recoveryDeals: 3 },
    { ...saved, deals: 15, rest: 0 },
    gap.challengeState,
  );
  expect(protectedDeal.challengeDecision.focus).toBeNull();
  expect(protectedDeal.challengeDecision.selectedPhase).toBe("POST_REVIVE");
  expect(observeChallenge(state, undefined, true, 14).nextFocus).toBe("choice");
});

it("has eight D4-distinct original starts, six first-decision families and verified rotations without scripted all-clear", () => {
  const rotations = new Set<string>(),
    keys = CHALLENGE_OPENINGS.map((_, i) => openingDecisionKey(i));
  expect(new Set(keys).size).toBe(8);
  expect(new Set(CHALLENGE_OPENINGS.map((o) => o.kind)).size).toBe(6);
  for (let seed = 1; seed < 200000; seed += 197) {
    const d = challengeOpening(seed);
    rotations.add(
      `${d.openingId}:${Math.floor(random(random(seed).state).value * 4)}`,
    );
    let b = d.board,
      firstLine = 0,
      firstClear = 0;
    const initiallyBlocked = d.tray.some((s) => !inspectLegal(b, s.shapeId));
    for (const [i, m] of d.witness.entries()) {
      const n = place(b, shapeById(d.tray[m.slot]!.shapeId), m.x, m.y);
      b = n.board;
      if (i === 0) firstLine = n.lines;
      if (n.lines && !firstClear) firstClear = i + 1;
      expect(b.some(Boolean)).toBe(true);
    }
    if (d.kind === "prepare-one") expect(firstClear).toBe(2);
    if (d.kind === "prepare-two") expect(firstClear).toBe(3);
    if (d.kind === "cross-clear" || d.kind === "parallel-clear")
      expect(firstLine).toBe(2);
    if (d.kind === "space-unlock") expect(initiallyBlocked).toBe(true);
    expect(d.work).toBe(6);
  }
  expect(rotations.size).toBe(32);
});
function inspectLegal(board: number[], id: string) {
  const s = shapeById(id);
  for (let y = 0; y <= 8 - s.height; y++)
    for (let x = 0; x <= 8 - s.width; x++)
      if (s.cells.every(([dx, dy]) => !board[(y + dy) * 8 + x + dx]))
        return true;
  return false;
}

it("anti-repeat rejects rotated first-decision equivalents and repeats of the last decision family", () => {
  let history: string[] = [];
  for (let i = 0; i < 128; i++) {
    const seed = seedForChallengeOpening(0x9e3779b9, history),
      key = openingDecisionKey(challengeOpeningIndex(seed));
    expect(history).not.toContain(key);
    expect(key.split(":")[0]).not.toBe(history.at(-1)?.split(":")[0]);
    history = [...history, key].slice(-3);
  }
});

function oldContext(seed: number, style: MixedStyle, at: number) {
  let g = newGame(seed, `probe-${style}-${seed}`, "director-v2"),
    player = (seed ^ 0x85ebca6b) >>> 0;
  while (g.moves < at) {
    const roll = random(player);
    player = roll.state;
    const m = chooseMixed(g.board, g.tray, style, roll.value).move!;
    const r = applyMove(g, m, g.revision, true)!;
    g = r.state;
    if (g.moves === at) return r.decision!.input;
  }
  throw Error("Missing context");
}
it.each([
  { style: "clear" as const, at: 36, focus: "chain" as const },
  { style: "three" as const, at: 66, focus: "choice" as const },
])(
  "changes real content with independently proved $focus, rather than adding a label",
  ({ style, at, focus }) => {
    const i = oldContext(8101008, style, at),
      c = i.context;
    const base = goalDirectorDeal(
        i.board,
        i.seed,
        i.moves,
        c.rhythm,
        c.goalDirector,
      ),
      next = goalDirectorDeal(
        i.board,
        i.seed,
        i.moves,
        c.rhythm,
        c.goalDirector,
        24000,
        false,
        focus,
      );
    expect(next.tray.map((s) => s.shapeId)).not.toEqual(
      base.tray.map((s) => s.shapeId),
    );
    const a = inspectChoices(i.board, base.tray),
      b = inspectChoices(i.board, next.tray);
    expect(a[focus]).toBe(false);
    expect(b[focus]).toBe(true);
    expect(b.complete).toBe(true);
    expect(next.diagnostic.checks).toBeLessThanOrEqual(24000);
  },
);

it("unknown continuation budget never creates a negative proof", () => {
  const d = challengeOpening(8101001),
    r = inspectChoices(d.board, d.tray, 0);
  expect(r.status).toBe("UNKNOWN");
  expect(r.badButLegalFirstMoveCount).toBe(0);
  expect(r.choice).toBe(false);
  expect(r.work).toBe(0);
});

it("the all-off ablation exactly preserves v2, and every recorded observation replays across JSON/save", () => {
  for (const variant of ["control", "starts", "tasks", "full"] as const) {
    let initial: any;
    let g = newGame(
      8101001,
      `record-${variant}`,
      "director-challenge-v1",
      (t) => (initial = t),
      variant,
    );
    let base = newGame(8101001, `record-${variant}`, "director-v2"),
      active = 0;
    expect(replayDecision(initial)).toEqual(initial);
    const capture = new PlayCapture(() => 0);
    capture.start(g);
    for (let n = 0; n < 96 && g.status === "playing"; n++) {
      const m = chooseMixed(g.board, g.tray, "three", 0).move!,
        r = applyMove(g, m, g.revision, true, { activeMs: (active += 1300) })!;
      capture.record(g, m, r.state, r.decision);
      g = JSON.parse(JSON.stringify(r.state));
      expect(validProfile({ ...createProfile(g), best: g.score })).toBe(true);
      if (r.decision) expect(replayDecision(r.decision)).toEqual(r.decision);
      if (variant === "control") {
        base = applyMove(base, m, base.revision)!.state;
        for (const k of [
          "board",
          "tray",
          "rngState",
          "goalDirector",
          "rhythm",
          "score",
          "status",
        ] as const)
          expect(g[k]).toEqual(base[k]);
      }
    }
    expect(g.challengeState!.recentTrayMs.length).toBeLessThanOrEqual(8);
    expect(replayRecord(capture.snapshot()).final).toEqual(g);
    const bad = structuredClone(capture.snapshot()),
      event = bad.events.find((e) => e.kind === "move" && e.observation)!;
    if (event.kind === "move") event.observation!.activeMs++;
    expect(() => replayRecord(bad)).toThrow();
  }
}, 20000);

it("foreground clock excludes blocked intervals, reuses the durable base and resets for a new game", () => {
  let now = 0;
  const clock = new DecisionPlayClock(() => now),
    g = newGame(8101001, "clock", "director-challenge-v1");
  clock.sync(g, true);
  now = 400;
  expect(clock.observation(g)!.activeMs).toBe(400);
  for (const blocked of [
    "worker",
    "save",
    "pause",
    "background",
    "ad",
    "loading",
  ]) {
    clock.sync(g, false);
    now += 10000;
    expect(clock.observation(g)!.activeMs).toBe(400);
  }
  clock.sync(g, true);
  now += 100;
  expect(clock.observation(g)!.activeMs).toBe(500);
  const next = newGame(8101002, "other", "director-challenge-v1");
  clock.sync(next, true);
  expect(clock.observation(next)!.activeMs).toBe(0);
  const resumed = {
    ...next,
    challengeState: { ...next.challengeState!, activeMs: 3000 },
  };
  clock.sync(resumed, true);
  expect(clock.observation(resumed)!.activeMs).toBe(3000);
  expect(clock.observation(newGame(1, "old", "director-v2"))).toBeUndefined();
});

it("opening history is atomic with a new game and failed save does not consume an opener", async () => {
  const original = createProfile(newGame(1, "original", "director-v2")),
    p = ensureExperiment(original, 1, true, "history");
  let fail = true;
  const store = new ProfileStore(p, {
    load: async () => ({ profile: p, recovered: false }),
    write: async () => {
      if (fail) throw Error("quota");
    },
  });
  const game = newGame(8101001, "new", "director-challenge-v1"),
    start = () =>
      store.update((p) => ({
        ...rememberChallengeOpening(p, game),
        revision: p.revision + 1,
        game,
      }));
  await expect(start()).rejects.toThrow("quota");
  expect(store.state.experiment!.challengeOpeningHistory).toBeUndefined();
  fail = false;
  expect(await start()).toBe(true);
  expect(store.state.experiment!.challengeOpeningHistory).toEqual([
    game.challengeState!.openingKey,
  ]);
  expect(rememberChallengeOpening(store.state, game)).toBe(store.state);
  expect(CHALLENGE_EXPERIMENT.enabled).toBe(false);
  expect(assignedDealer(original)).toBe("director-v2");
  expect(
    validChallengeState({
      ...initialChallengeState(),
      recentTrayMs: Array(9).fill(1),
    }),
  ).toBe(false);
});

it("earned revive retains the promised three exact v2 recovery refills and never sticks in post-revive", () => {
  const g = newGame(
    3,
    "challenge-revive",
    "director-challenge-v1",
    undefined,
    "tasks",
  );
  g.board = Array.from({ length: 64 }, (_, i) => ((i % 8) + (i >> 3)) % 2);
  g.status = "over";
  g.tray = [
    { shapeId: "O3-0", color: 1, used: false },
    { shapeId: "S1-0", color: 1, used: true },
    { shapeId: "S1-0", color: 1, used: true },
  ];
  const prepared = prepareReward(createProfile(g), "test-revive", "revive"),
    revived = applyReceipt(prepared, { id: "earned", intentId: "test-revive" });
  expect(
    applyReceipt(revived, { id: "duplicate", intentId: "test-revive" }).game,
  ).toEqual(revived.game);
  let state = revived.game,
    route = prepared.ads!.intents[0]!.plan!.selection!.witness,
    active = 0;
  for (let refill = 0; refill < 4; refill++) {
    let final: any;
    for (const m of route) {
      const r = applyMove(state, m, state.revision, true, {
        activeMs: (active += 1300),
      })!;
      expect(r).not.toBeNull();
      state = r.state;
      if (r.decision) final = r.decision;
    }
    const i = final.input,
      c = i.context,
      d = goalDirectorDeal(i.board, i.seed, i.moves, c.rhythm, c.goalDirector);
    if (refill < 3) {
      expect(final.challenge.selectedPhase).toBe("POST_REVIVE");
      expect(state.tray).toEqual(d.tray);
      expect(state.rngState).toBe(d.rngState);
    } else expect(final.challenge.selectedPhase).not.toBe("POST_REVIVE");
    expect(state.rhythm!.recoveryDeals).toBe(Math.max(0, 2 - refill));
    route = final.validation.witness;
  }
});
