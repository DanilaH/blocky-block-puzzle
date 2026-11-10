import { afterEach, expect, it, vi } from "vitest";
import { MoveCalculator } from "../src/game/move-calculator";
import { applyMove, newGame, type GameState } from "../src/core/rules";

class FakeWorker {
  onmessage: Worker["onmessage"] = null;
  onerror: Worker["onerror"] = null;
  onmessageerror: Worker["onmessageerror"] = null;
  postMessage = vi.fn();
  terminate = vi.fn();
  reply(result: unknown) {
    this.onmessage?.call(
      this as unknown as Worker,
      { data: { result } } as MessageEvent,
    );
  }
}
const state = () => {
  const g = newGame(42, "worker-test", "flow-v4");
  g.tray[0]!.used = g.tray[1]!.used = true;
  return g;
};
const move = { slot: 2, x: 0, y: 0 };
function harness() {
  const workers: FakeWorker[] = [];
  const factory = vi.fn(() => {
    const worker = new FakeWorker();
    workers.push(worker);
    return worker;
  });
  return { calculator: new MoveCalculator(factory), factory, workers };
}
afterEach(() => vi.useRealTimers());

it("isolates a retry from a late response to a timed-out move", async () => {
  vi.useFakeTimers();
  const h = harness(),
    g = state(),
    before = structuredClone(g);
  const first = h.calculator.calculate(g, move, g.revision);
  const rejected = expect(first).rejects.toThrow("timed out");
  const late = h.workers[0]!.onmessage!;
  await vi.advanceTimersByTimeAsync(5000);
  await rejected;
  expect(h.workers[0]!.terminate).toHaveBeenCalledOnce();
  const retry = h.calculator.calculate(g, { ...move, x: 1 }, g.revision);
  let resolved = false;
  void retry.then(() => (resolved = true));
  late.call(
    h.workers[0]! as unknown as Worker,
    { data: { result: { stale: true } } } as MessageEvent,
  );
  await Promise.resolve();
  expect(resolved).toBe(false);
  h.workers[1]!.reply(null);
  expect(await retry).toBeNull();
  expect(g).toEqual(before);
  expect(vi.getTimerCount()).toBe(0);
});

it.each(["error", "messageerror", "reported", "send"])(
  "recovers after a %s failure",
  async (kind) => {
    vi.useFakeTimers();
    const h = harness(),
      g = state();
    if (kind === "send")
      h.factory.mockImplementationOnce(() => {
        const worker = new FakeWorker();
        worker.postMessage.mockImplementation(() => {
          throw new Error("send failed");
        });
        h.workers.push(worker);
        return worker;
      });
    const first = h.calculator.calculate(g, move, g.revision);
    const rejected = expect(first).rejects.toThrow();
    const worker = h.workers[0]!;
    if (kind === "error")
      worker.onerror!.call(worker as unknown as Worker, {} as ErrorEvent);
    if (kind === "messageerror")
      worker.onmessageerror!.call(
        worker as unknown as Worker,
        {} as MessageEvent,
      );
    if (kind === "reported")
      worker.onmessage!.call(
        worker as unknown as Worker,
        { data: { error: true } } as MessageEvent,
      );
    await rejected;
    expect(worker.terminate).toHaveBeenCalledOnce();
    const retry = h.calculator.calculate(g, move, g.revision);
    h.workers[1]!.reply(null);
    expect(await retry).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  },
);

it("reuses a healthy worker and preserves the rules result and RNG", async () => {
  const h = harness(),
    g = state();
  const expected = applyMove(g, move, g.revision);
  for (let i = 0; i < 2; i++) {
    const result = h.calculator.calculate(g, move, g.revision);
    expect(h.workers[0]!.postMessage).toHaveBeenLastCalledWith({
      state: g,
      move,
      revision: g.revision,
    });
    h.workers[0]!.reply(expected);
    expect(await result).toEqual(expected);
  }
  expect(h.factory).toHaveBeenCalledOnce();
  expect(h.workers[0]!.terminate).not.toHaveBeenCalled();
});

it("rejects overlapping searches without stealing the pending response", async () => {
  const h = harness(),
    g = state();
  const first = h.calculator.calculate(g, move, g.revision);
  await expect(h.calculator.calculate(g, move, g.revision)).rejects.toThrow(
    "already pending",
  );
  h.workers[0]!.reply(null);
  expect(await first).toBeNull();
});

it("ordinary moves keep the synchronous rules path without starting a worker", async () => {
  const h = harness(),
    g: GameState = newGame(42, "ordinary");
  expect(
    await h.calculator.calculate(g, { ...move, slot: 0 }, g.revision),
  ).toEqual(applyMove(g, { ...move, slot: 0 }, g.revision));
  expect(h.factory).not.toHaveBeenCalled();
});

it('runs a director refill in the worker and preserves its persisted history',async()=>{
  const h=harness(),g=newGame(42,'director-worker','director-v1');
  g.tray[0]!.used=g.tray[1]!.used=true;
  const expected=applyMove(g,move,g.revision);
  const result=h.calculator.calculate(g,move,g.revision);
  expect(h.workers[0]!.postMessage).toHaveBeenCalledWith({state:g,move,revision:g.revision});
  h.workers[0]!.reply(expected);
  expect(await result).toEqual(expected);
  expect(expected!.state.director!.deals).toBe(g.director!.deals+1);
});

it('runs the goal-cycle refill in the worker with its complete goal state',async()=>{
  const h=harness(),g=newGame(42,'goal-worker','director-v2');
  g.tray[0]!.used=g.tray[1]!.used=true;
  const expected=applyMove(g,move,g.revision),result=h.calculator.calculate(g,move,g.revision);
  expect(h.workers[0]!.postMessage).toHaveBeenCalledWith({state:g,move,revision:g.revision});
  h.workers[0]!.reply(expected);expect(await result).toEqual(expected);
  expect(expected!.state.goalDirector!.deals).toBe(g.goalDirector!.deals+1);
});
