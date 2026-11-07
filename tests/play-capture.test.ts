import { it, expect } from "vitest";
import { PlayCapture } from "../src/platform/play-capture";
import { newGame, applyMove, placements, shapeById } from "../src/core/rules";
import { createProfile } from "../src/core/profile";
import { ProfileStore } from "../src/platform/save";
import { replayRecord } from "../scripts/calibration/replay";
import { revivePlan } from "../src/core/monetization";
const game = () => newGame(42, "capture", "flow-v4");
const next = (g: ReturnType<typeof game>) => {
  const pos = placements(g.board, shapeById(g.tray[0]!.shapeId))[0]!;
  const move = { slot: 0, ...pos };
  return { move, result: applyMove(g, move, g.revision)! };
};
const nextUnused = (g: ReturnType<typeof game>) => {
  const slot = g.tray.findIndex(
    (s) => !s.used && placements(g.board, shapeById(s.shapeId)).length > 0,
  );
  const move = {
    slot,
    ...placements(g.board, shapeById(g.tray[slot]!.shapeId))[0]!,
  };
  return { move, result: applyMove(g, move, g.revision)! };
};

it("replays a recording started at nonzero score without changing its state", () => {
  const first = next(game()).result.state;
  const c = new PlayCapture(() => 0),
    second = nextUnused(first);
  c.start(first);
  c.record(first, second.move, second.result.state);
  const r = replayRecord(c.snapshot());
  expect(r.segments[0]!.initialMoves).toBe(1);
  expect(r.final).toEqual(second.result.state);
});

it("resume after an unrecorded move starts a segment and excludes the recording gap", () => {
  let t = 0;
  const g = game(),
    c = new PlayCapture(() => t),
    a = next(g);
  c.start(g);
  c.setActive(true);
  t = 100;
  c.record(g, a.move, a.result.state);
  c.stop();
  const b = nextUnused(a.result.state);
  t = 20000;
  c.start(b.result.state);
  const d = nextUnused(b.result.state);
  t = 20100;
  c.record(b.result.state, d.move, d.result.state);
  const r = replayRecord(c.snapshot());
  expect(r.segments).toHaveLength(2);
  expect(r.moves.map((m) => m.activeIntervalMs)).toEqual([100, 100]);
  expect(r.moves[1]!.segment).toBe(2);
});

it("a scored revive is a checkpoint rather than a fabricated move", () => {
  const g = game();
  g.score = 123;
  g.status = "over";
  g.board = Array.from(
    { length: 64 },
    (_, i) => ((i % 8) + Math.floor(i / 8)) % 2,
  );
  g.tray.forEach((s) => (s.shapeId = "O3-0"));
  const revived = revivePlan(g)!.game;
  const c = new PlayCapture(() => 0);
  c.start(g);
  c.committed(createProfile(g), createProfile(revived));
  const r = replayRecord(c.snapshot());
  expect(r.moves).toHaveLength(0);
  expect(r.segments.map((s) => s.reason)).toEqual(["start", "revive"]);
  expect(r.final).toEqual(revived);
});

it("accepting scored checkpoints still rejects damaged geometry", () => {
  const first = next(game()).result.state;
  const c = new PlayCapture(() => 0);
  c.start(first);
  const data = c.snapshot();
  const event = data.events[0]!;
  if (event.kind !== "checkpoint") throw Error();
  event.state.board[0] = 99;
  expect(() => replayRecord(data)).toThrow("Invalid checkpoint");
  expect(replayRecord(c.snapshot()).final).toEqual(first);
});
it("is opt-in, records deterministic moves once and excludes paused time", () => {
  let t = 0;
  const c = new PlayCapture(() => t),
    g = game(),
    { move, result } = next(g);
  c.record(g, move, result.state);
  expect(c.hasData).toBe(false);
  c.start(g);
  c.setActive(true);
  t = 100;
  c.setActive(false);
  t = 900;
  c.setActive(true);
  t = 1000;
  c.record(g, move, result.state);
  c.record(g, move, result.state);
  c.stop();
  const r = replayRecord(c.snapshot());
  expect(r.moves).toHaveLength(1);
  expect(r.moves[0]!.activeIntervalMs).toBe(200);
  expect(r.final).toEqual(result.state);
  c.record(result.state, move, result.state);
  expect(c.count).toBe(1);
});
it("does not publish failed saves; checkpoints separate new games and gaps", async () => {
  const g = game(),
    p = createProfile(g),
    c = new PlayCapture(() => 0);
  c.start(g);
  const store = new ProfileStore(p, {
    load: async () => ({ profile: p, recovered: false }),
    write: async () => {
      throw Error("quota");
    },
  });
  store.observer = {
    prepare: (_, p) => p,
    committed: (a, b) => c.committed(a, b),
    saveFailed: () => {},
  };
  await expect(
    store.update((p) => ({ ...p, game: newGame(9, "new", "flow-v4") })),
  ).rejects.toThrow();
  expect(c.snapshot().events).toHaveLength(1);
  const n = newGame(9, "new", "flow-v4");
  c.committed(p, createProfile(n));
  const { move, result } = next(n);
  c.record(n, move, result.state);
  expect(replayRecord(c.snapshot()).segments).toHaveLength(2);
});
it("marks hints, bounds memory, retains export after stopping, and clears explicitly", () => {
  const g = game(),
    p = createProfile(g),
    c = new PlayCapture(() => 0),
    { move, result } = next(g);
  c.start(g);
  c.committed(p, {
    ...p,
    hint: {
      gameId: g.gameId,
      revision: g.revision,
      hintId: "h",
      source: "free",
      move,
    },
  });
  c.record(g, move, result.state);
  expect(replayRecord(c.snapshot()).moves[0]!.event.hinted).toBe(true);
  c.stop();
  expect(c.hasData).toBe(true);
  c.clear();
  expect(c.hasData).toBe(false);
  const small = new PlayCapture(() => 0, 20);
  small.start(g);
  expect(small.enabled).toBe(false);
  expect(small.status).toBe("limit");
  small.stop();
  expect(small.snapshot().stopped).toBe("limit");
});
it("rejects tampered coordinates, hashes and backwards clocks before analysis", () => {
  const g = game(),
    c = new PlayCapture(() => 0),
    { move, result } = next(g);
  c.start(g);
  c.record(g, move, result.state);
  const data = c.snapshot();
  const e = data.events[1]!;
  if (e.kind !== "move") throw Error();
  e.after = "bad";
  expect(() => replayRecord(data)).toThrow("mismatch");
  const bad = c.snapshot();
  bad.events[1]!.wallMs = -1;
  expect(() => replayRecord(bad)).toThrow("clock");
});

it("keeps an already visible hint on capture start and clears it on restart", () => {
  const g = game(),
    c = new PlayCapture(() => 0),
    { move, result } = next(g);
  c.start(g, true);
  c.record(g, move, result.state);
  expect(replayRecord(c.snapshot()).moves[0]!.event.hinted).toBe(true);
  const n = newGame(77, "restart", "flow-v4");
  c.committed(createProfile(result.state), createProfile(n));
  const x = next(n);
  c.record(n, x.move, x.result.state);
  expect(replayRecord(c.snapshot()).moves[1]!.event.hinted).toBe(false);
});
