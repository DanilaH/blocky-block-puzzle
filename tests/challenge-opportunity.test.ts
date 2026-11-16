import { expect, it } from "vitest";
import {
  newGame,
  applyMove,
  random,
  deal,
  replayDecision,
  SHAPES,
  type DealerVersion,
  type GameState,
} from "../src/core/rules";
import { goalDirectorDeal } from "../src/core/goal-director";
import {
  verifiedGoalDeal,
  opportunityGoalDeal,
  verifiedRefinement,
} from "../src/core/verified-goal";
import { directorBeam } from "../src/core/director-goal-tools";
import { WorkBudget } from "../src/core/director-search";
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
  CHALLENGE_V3_EXPERIMENT,
  ensureExperiment,
  rememberChallengeOpening,
  enabledDealer,
} from "../src/core/experiment";
import { ProfileStore } from "../src/platform/save";
import { DecisionPlayClock } from "../src/platform/decision-clock";

function inputAt(
  seed: number,
  style: MixedStyle,
  at: number,
  policy: DealerVersion = "director-challenge-v2",
  variant: "tasks" | "full" = "full",
) {
  let g = newGame(seed, "opportunity-fixture", policy, undefined, variant),
    player = (seed ^ 0x85ebca6b) >>> 0,
    active = 0,
    trace: any;
  while (g.status === "playing" && g.moves < at) {
    const r = random(player);
    player = r.state;
    const m = chooseMixed(g.board, g.tray, style, r.value).move!;
    const next = applyMove(g, m, g.revision, true, {
      activeMs: (active +=
        style === "clear" ? 1500 : style === "bounded" ? 2200 : 2400),
    })!;
    g = next.state;
    if (next.decision) trace = next.decision;
  }
  expect(g.moves).toBe(at);
  return trace.input;
}

it("demonstrates traversal coverage within the same six operations, without changing default traversal", () => {
  const rank = [
    SHAPES.findIndex((s) => s.id === "S1-0"),
    SHAPES.findIndex((s) => s.id === "I2-0"),
  ];
  expect(rank.every((i) => i >= 0)).toBe(true);
  for (const interleaved of [false, true]) {
    const meter = new WorkBudget(1024),
      seen: number[] = [];
    directorBeam({
      rows: Array(8).fill(0),
      meter,
      rank,
      reverse: false,
      allow: () => true,
      score: () => 0,
      work: 6,
      depths: 1,
      interleaved,
      completed: (n) => seen.push(n.path[0]!.shape),
    });
    expect(meter.used).toBe(6);
    expect(meter.ceiling).toBe(512);
    expect(seen).toEqual(
      interleaved ? [rank[0], rank[1], rank[0]] : [rank[0], rank[0], rank[0]],
    );
  }
});

it("accepts the witnessed one-line tradeoff as a separate version and preserves the strict 0.71 result", () => {
  const i = inputAt(706842389, "clear", 159),
    c = i.context;
  const base = goalDirectorDeal(
      i.board,
      i.seed,
      i.moves,
      c.rhythm,
      c.goalDirector,
    ),
    strict = verifiedGoalDeal(
      i.board,
      i.seed,
      i.moves,
      c.rhythm,
      c.goalDirector,
      24000,
      false,
      "chain",
    );
  const next = opportunityGoalDeal(
    i.board,
    i.seed,
    i.moves,
    c.rhythm,
    c.goalDirector,
    24000,
    false,
    "chain",
  );
  expect(strict.tray).toEqual(base.tray);
  expect(strict.admission!.version).toBe(1);
  expect(strict.admission!.qualityBand).toBeUndefined();
  expect(next.tray).not.toEqual(base.tray);
  expect(next.rngState).toBe(base.rngState);
  expect(next.director).toEqual(base.director);
  const a = next.admission!;
  expect(a.version).toBe(2);
  expect(a.baseline!.lines).toBe(6);
  expect(a.accepted!.lines).toBe(5);
  expect(a.accepted!.clears).toBe(a.baseline!.clears);
  expect(a.accepted!.occupied - a.baseline!.occupied).toBe(8);
  expect(next.diagnostic.checks).toBeLessThanOrEqual(24000);
  verifyWitness(i.board, next.tray, next.witness);
  expect(inspectChoices(i.board, base.tray).chain).toBe(false);
  expect(inspectChoices(i.board, next.tray).chain).toBe(true);
  const ref = verifiedRefinement("chain", 0, "one-line");
  const tiny = goalDirectorDeal(
    i.board,
    i.seed,
    i.moves,
    c.rhythm,
    c.goalDirector,
    24000,
    false,
    "observe",
    ref,
  );
  expect(tiny.tray).toEqual(base.tray);
  expect(tiny.witness).toEqual(base.witness);
  expect(tiny.director).toEqual(base.director);
  expect(tiny.rngState).toBe(base.rngState);
});

it("keeps certified legal consequences separate from independently plausible model choices", () => {
  const i = inputAt(8101001, "bounded", 66, "director-v2", "tasks"),
    c = i.context;
  const next = opportunityGoalDeal(
    i.board,
    i.seed,
    i.moves,
    c.rhythm,
    c.goalDirector,
    24000,
    false,
    "choice",
  );
  const a = inspectChoices(i.board, next.tray),
    certificate = next.diagnostic.certificate!;
  expect(certificate.kind).toBe("placement");
  expect(a.complete).toBe(true);
  expect(a.status).toBe("SOLVABLE");
  if (certificate.kind === "placement")
    expect(
      a.first.find(
        (x) => JSON.stringify(x.move) === JSON.stringify(certificate.badFirst),
      )!.status,
    ).toBe("UNSOLVABLE");
  expect(a.choice).toBe(false); // Must not count this technical certificate as new model content.
});

it.each(["control", "starts", "tasks", "full"] as const)(
  "persists the independent v3 state, records active time and exactly replays %s",
  (variant) => {
    let trace: any,
      g = newGame(
        8101008,
        `v3-${variant}`,
        "director-challenge-v3",
        (t) => (trace = t),
        variant,
      ),
      active = 0;
    const record = new PlayCapture(() => 0);
    record.start(g);
    expect(replayDecision(trace)).toEqual(trace);
    let control = newGame(8101008, `v3-${variant}`, "director-v2");
    for (let n = 0; n < 96 && g.status === "playing"; n++) {
      const m = chooseMixed(g.board, g.tray, "three", 0).move!;
      const next = applyMove(g, m, g.revision, true, {
        activeMs: (active += 1300),
      })!;
      record.record(g, m, next.state, next.decision);
      g = JSON.parse(JSON.stringify(next.state));
      expect(validProfile({ ...createProfile(g), best: g.score })).toBe(true);
      expect(g.challengeState).toBeUndefined();
      expect(g.challengeV2State).toBeUndefined();
      if (next.decision)
        expect(replayDecision(next.decision)).toEqual(next.decision);
      if (variant === "control") {
        control = applyMove(control, m, control.revision)!.state;
        for (const key of [
          "board",
          "tray",
          "rngState",
          "goalDirector",
          "rhythm",
          "status",
          "score",
        ] as const)
          expect(g[key]).toEqual(control[key]);
      }
    }
    expect(g.challengeV3State!.configId).toBe("challenge-content-v3");
    expect(g.challengeV3State!.recentTrayMs.length).toBeLessThanOrEqual(8);
    expect(replayRecord(record.snapshot()).final).toEqual(g);
    expect(
      validProfile({
        ...createProfile(g),
        best: g.score,
        game: {
          ...g,
          challengeV2State: {
            ...g.challengeV3State,
            configId: "challenge-content-v2",
          },
        },
      }),
    ).toBe(false);
    expect(CHALLENGE_V3_EXPERIMENT.enabled).toBe(false);
    expect(
      enabledDealer("director-challenge-v3", {
        ...CHALLENGE_V3_EXPERIMENT,
        candidateEnabled: false,
      }),
    ).toBe("director-v2");
  },
  20000,
);

it("preserves an earned revive, its duplicate receipt and exactly three existing recovery refills in v3", () => {
  let g = newGame(3, "v3-revive", "director-challenge-v3", undefined, "tasks");
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
    let t: any;
    for (const m of path) {
      const r = applyMove(g, m, g.revision, true, {
        activeMs: (active += 1300),
      })!;
      g = r.state;
      if (r.decision) t = r.decision;
    }
    const i = t.input,
      c = i.context,
      baseline = deal(
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
      expect(t.challenge.selectedPhase).toBe("POST_REVIVE");
      expect(g.tray).toEqual(baseline.tray);
      expect(g.rngState).toBe(baseline.rngState);
    } else expect(t.challenge.selectedPhase).not.toBe("POST_REVIVE");
    expect(g.rhythm!.recoveryDeals).toBe(Math.max(0, 2 - n));
    path = t.validation.witness;
  }
});

it("commits opening history atomically and excludes blocked wall time for v3", async () => {
  const g = newGame(8101008, "new", "director-challenge-v3"),
    p = ensureExperiment(
      createProfile(newGame(1, "old", "director-v2")),
      1,
      false,
      "installation",
    );
  let fail = true;
  const store = new ProfileStore(p, {
    load: async () => ({ profile: p, recovered: false }),
    write: async () => {
      if (fail) throw Error("quota");
    },
  });
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
    g.challengeV3State!.openingKey,
  ]);
  let now = 0;
  const clock = new DecisionPlayClock(() => now);
  g.challengeV3State!.activeMs = 3000;
  clock.sync(g, true);
  now = 100;
  expect(clock.observation(g)).toEqual({ activeMs: 3100 });
  clock.sync(g, false);
  now += 10000;
  expect(clock.observation(g)).toEqual({ activeMs: 3100 });
  clock.sync(g, true);
  now += 100;
  expect(clock.observation(g)).toEqual({ activeMs: 3200 });
});
