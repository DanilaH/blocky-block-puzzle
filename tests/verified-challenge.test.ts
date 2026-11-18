import { it, expect } from "vitest";
import {
  newGame,
  applyMove,
  random,
  deal,
  replayDecision,
  place,
  shapeById,
} from "../src/core/rules";
import { goalDirectorDeal } from "../src/core/goal-director";
import {
  verifiedGoalDeal,
  verifiedRefinement,
} from "../src/core/verified-goal";
import {
  chooseMixed,
  type MixedStyle,
} from "../scripts/director/mixed-players";
import {
  inspectChoices,
  verifyWitness,
} from "../scripts/challenge-content/oracle";
import { validProfile, createProfile } from "../src/core/profile";
import { PlayCapture } from "../src/platform/play-capture";
import { replayRecord } from "../scripts/calibration/replay";
import { prepareReward, applyReceipt } from "../src/core/monetization";
import {
  CHALLENGE_V2_EXPERIMENT,
  ensureExperiment,
  rememberChallengeOpening,
  enabledDealer,
} from "../src/core/experiment";
import { ProfileStore } from "../src/platform/save";
import { DecisionPlayClock } from "../src/platform/decision-clock";

it("uses the durable v2 clock without counting blocked input or changing the saved v1 clock", () => {
  let now = 0;
  const clock = new DecisionPlayClock(() => now),
    g = newGame(8101001, "v2-clock", "director-challenge-v2");
  g.challengeV2State!.activeMs = 3000;
  clock.sync(g, true);
  now = 100;
  expect(clock.observation(g)).toEqual({ activeMs: 3100 });
  clock.sync(g, false);
  now += 10000;
  expect(clock.observation(g)).toEqual({ activeMs: 3100 });
  clock.sync(g, true);
  now += 100;
  expect(clock.observation(g)).toEqual({ activeMs: 3200 });
  const old = newGame(8101001, "v1-clock", "director-challenge-v1");
  old.challengeState!.activeMs = 7000;
  clock.sync(old, true);
  expect(clock.observation(old)).toEqual({ activeMs: 7000 });
});

function inputAt(
  seed: number,
  style: MixedStyle,
  at: number,
  policy: "director-v2" | "director-challenge-v1" = "director-v2",
) {
  let g = newGame(
      seed,
      `verified-${style}-${seed}`,
      policy,
      undefined,
      "tasks",
    ),
    player = (seed ^ 0x85ebca6b) >>> 0,
    active = 0;
  while (g.moves < at) {
    const roll = random(player);
    player = roll.state;
    const move = chooseMixed(g.board, g.tray, style, roll.value).move!;
    const r = applyMove(g, move, g.revision, true, {
      activeMs: (active += style === "clear" ? 1500 : 2400),
    })!;
    g = r.state;
    if (g.moves === at) return r.decision!;
  }
  throw Error("Missing input");
}
function metrics(board: number[], tray: any[], path: any[]) {
  let b = board,
    lines = 0,
    clears = 0;
  for (const m of path) {
    const n = place(b, shapeById(tray[m.slot].shapeId), m.x, m.y);
    b = n.board;
    lines += n.lines;
    clears += Number(b.every((v) => !v));
  }
  return { lines, clears };
}

it("reproduces the shipped unselected-change defect while the new zero-allowance branch preserves the actual control", () => {
  const trace = inputAt(8105002, "clear", 36, "director-challenge-v1"),
    i = trace.input,
    c = i.context;
  const base = goalDirectorDeal(
    i.board,
    i.seed,
    i.moves,
    c.rhythm,
    c.goalDirector,
  );
  expect(trace.challenge!.selected).toBe(false);
  expect(trace.challenge!.changedHand).toBe(false);
  expect(trace.finalPieceIds).not.toEqual(base.tray.map((s) => s.shapeId));
  const refinement = verifiedRefinement("chain", 0),
    d = goalDirectorDeal(
      i.board,
      i.seed,
      i.moves,
      c.rhythm,
      c.goalDirector,
      24000,
      false,
      "observe",
      refinement,
    );
  for (const key of ["tray", "rngState", "director", "witness"] as const)
    expect(d[key]).toEqual(base[key]);
  expect(d.diagnostic).toEqual(base.diagnostic);
  expect(refinement.admission.reason).toBe("no-blocked-piece");
});

it("an exhausted refinement allowance never rejects the already proved control hand", () => {
  const { input: i } = inputAt(8101008, "three", 66),
    c = i.context,
    base = goalDirectorDeal(i.board, i.seed, i.moves, c.rhythm, c.goalDirector);
  const refinement = verifiedRefinement("choice", 0),
    d = goalDirectorDeal(
      i.board,
      i.seed,
      i.moves,
      c.rhythm,
      c.goalDirector,
      24000,
      false,
      "observe",
      refinement,
    );
  expect(refinement.admission.reason).toBe("proof-budget");
  expect(d.tray).toEqual(base.tray);
  expect(d.witness).toEqual(base.witness);
  expect(d.rngState).toBe(base.rngState);
  expect(d.diagnostic.certificate).toEqual(base.diagnostic.certificate);
});

it.each([
  { style: "clear" as const, at: 36, focus: "chain" as const },
  { style: "three" as const, at: 66, focus: "choice" as const },
])(
  "accepts a real new $focus without buying it with lost lines or extra rewards",
  ({ style, at, focus }) => {
    const { input: i } = inputAt(8101008, style, at),
      c = i.context;
    const base = goalDirectorDeal(
        i.board,
        i.seed,
        i.moves,
        c.rhythm,
        c.goalDirector,
      ),
      d = verifiedGoalDeal(
        i.board,
        i.seed,
        i.moves,
        c.rhythm,
        c.goalDirector,
        24000,
        false,
        focus,
      );
    expect(d.tray.map((s) => s.shapeId)).not.toEqual(
      base.tray.map((s) => s.shapeId),
    );
    expect(d.rngState).toBe(base.rngState);
    expect(d.director).toEqual(base.director);
    const before = inspectChoices(i.board, base.tray),
      after = inspectChoices(i.board, d.tray);
    expect(before[focus]).toBe(false);
    expect(after[focus]).toBe(true);
    expect(after.complete).toBe(true);
    verifyWitness(i.board, d.tray, d.witness);
    const a = metrics(i.board, base.tray, base.witness),
      b = metrics(i.board, d.tray, d.witness);
    expect(b.lines).toBeGreaterThanOrEqual(a.lines);
    expect(b.clears).toBe(a.clears);
    expect(d.diagnostic.checks).toBeLessThanOrEqual(24000);
  },
);

it("does not allow the old extra-gift witness when a new task misses", () => {
  const trace = inputAt(8105004, "clear", 39, "director-challenge-v1"),
    i = trace.input,
    c = i.context,
    focus = trace.challenge!.focus!;
  const base = goalDirectorDeal(
      i.board,
      i.seed,
      i.moves,
      c.rhythm,
      c.goalDirector,
    ),
    old = {
      tray: trace.finalPieceIds.map((shapeId) => ({ shapeId })),
      witness: trace.validation.witness,
    };
  expect(metrics(i.board, old.tray, old.witness).clears).toBeGreaterThan(
    metrics(i.board, base.tray, base.witness).clears,
  );
  const d = verifiedGoalDeal(
    i.board,
    i.seed,
    i.moves,
    c.rhythm,
    c.goalDirector,
    24000,
    false,
    focus,
  );
  expect(metrics(i.board, d.tray, d.witness).clears).toBe(
    metrics(i.board, base.tray, base.witness).clears,
  );
});

it.each(["control", "starts", "tasks", "full"] as const)(
  "persists and exactly replays the independent v2 state and clock: %s",
  (variant) => {
    let initial: any,
      g = newGame(
        8101001,
        `new-${variant}`,
        "director-challenge-v2",
        (t) => (initial = t),
        variant,
      ),
      active = 0,
      control = newGame(8101001, `new-${variant}`, "director-v2");
    const capture = new PlayCapture(() => 0);
    capture.start(g);
    expect(replayDecision(initial)).toEqual(initial);
    for (let n = 0; n < 96 && g.status === "playing"; n++) {
      const m = chooseMixed(g.board, g.tray, "three", 0).move!,
        r = applyMove(g, m, g.revision, true, { activeMs: (active += 1300) })!;
      capture.record(g, m, r.state, r.decision);
      g = JSON.parse(JSON.stringify(r.state));
      expect(validProfile({ ...createProfile(g), best: g.score })).toBe(true);
      expect(g.challengeState).toBeUndefined();
      if (r.decision) expect(replayDecision(r.decision)).toEqual(r.decision);
      if (variant === "control") {
        control = applyMove(control, m, control.revision)!.state;
        for (const k of [
          "board",
          "tray",
          "score",
          "rngState",
          "goalDirector",
          "rhythm",
          "status",
        ] as const)
          expect(g[k]).toEqual(control[k]);
      }
    }
    expect(g.challengeV2State!.configId).toBe("challenge-content-v2");
    expect(g.challengeV2State!.recentTrayMs.length).toBeLessThanOrEqual(8);
    expect(replayRecord(capture.snapshot()).final).toEqual(g);
    expect(
      validProfile({
        ...createProfile({
          ...g,
          challengeState: {
            ...g.challengeV2State!,
            configId: "challenge-content-v1-r3",
          },
        }),
        best: g.score,
      }),
    ).toBe(false);
    expect(CHALLENGE_V2_EXPERIMENT.enabled).toBe(false);
    expect(
      enabledDealer("director-challenge-v2", {
        ...CHALLENGE_V2_EXPERIMENT,
        candidateEnabled: false,
      }),
    ).toBe("director-v2");
  },
  20000,
);

it("preserves an earned revive, duplicate receipt and exactly the three original recovery refills", () => {
  let g = newGame(3, "v2-revive", "director-challenge-v2", undefined, "tasks");
  g.board = Array.from({ length: 64 }, (_, i) => (i + (i >> 3)) % 2);
  g.status = "over";
  g.tray = [
    { shapeId: "O3-0", color: 1, used: false },
    { shapeId: "S1-0", color: 1, used: true },
    { shapeId: "S1-0", color: 1, used: true },
  ];
  const prepared = prepareReward(createProfile(g), "intent", "revive"),
    earned = applyReceipt(prepared, { id: "earned", intentId: "intent" });
  expect(
    applyReceipt(earned, { id: "duplicate", intentId: "intent" }).game,
  ).toEqual(earned.game);
  g = earned.game;
  let path = prepared.ads!.intents[0]!.plan!.selection!.witness,
    active = 0;
  for (let n = 0; n < 4; n++) {
    let trace: any;
    for (const m of path) {
      const r = applyMove(g, m, g.revision, true, {
        activeMs: (active += 1300),
      })!;
      g = r.state;
      if (r.decision) trace = r.decision;
    }
    const i = trace.input,
      c = i.context,
      d = deal(
        i.board,
        i.seed,
        "director-v2",
        i.moves,
        i.previous,
        c.rhythm,
        c.director,
        c.goalDirector,
      );
    if (n < 3) {
      expect(trace.challenge.selectedPhase).toBe("POST_REVIVE");
      expect(g.tray).toEqual(d.tray);
      expect(g.rngState).toBe(d.rngState);
    } else expect(trace.challenge.selectedPhase).not.toBe("POST_REVIVE");
    expect(g.rhythm!.recoveryDeals).toBe(Math.max(0, 2 - n));
    path = trace.validation.witness;
  }
});

it("commits v2 opening history with the game and does not consume it on a failed save", async () => {
  const p = ensureExperiment(
    createProfile(newGame(1, "old", "director-v2")),
    1,
    false,
    "v2-save",
  );
  let fail = true;
  const store = new ProfileStore(p, {
      load: async () => ({ profile: p, recovered: false }),
      write: async () => {
        if (fail) throw Error("quota");
      },
    }),
    g = newGame(8101001, "new", "director-challenge-v2");
  const save = () =>
    store.update((p) => ({
      ...rememberChallengeOpening(p, g),
      revision: p.revision + 1,
      game: g,
    }));
  await expect(save()).rejects.toThrow();
  expect(store.state).toBe(p);
  fail = false;
  await save();
  expect(store.state.experiment!.challengeOpeningHistory).toEqual([
    g.challengeV2State!.openingKey,
  ]);
});
