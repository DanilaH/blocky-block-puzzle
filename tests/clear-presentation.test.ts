import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ClearPresentation,
  type PresentationEffect,
} from "../src/game/clear-presentation";

function effect() {
  let finish!: () => void;
  const cancel = vi.fn(() => finish());
  return {
    finished: new Promise<void>((resolve) => {
      finish = resolve;
    }),
    finish,
    cancel,
  };
}
function setup() {
  vi.useFakeTimers();
  let game = "one",
    busy = false,
    blocked = false;
  const reveal = vi.fn();
  const presentation = new ClearPresentation(
    { gameId: () => game, busy: () => busy, blocked: () => blocked, reveal },
    {
      now: () => Date.now(),
      delay: (fn, ms) => {
        const id = setTimeout(fn, ms);
        return () => clearTimeout(id);
      },
    },
  );
  return {
    presentation,
    reveal,
    game: (value: string) => {
      game = value;
    },
    busy: (value: boolean) => {
      busy = value;
    },
    blocked: (value: boolean) => {
      blocked = value;
    },
  };
}
afterEach(() => vi.useRealTimers());
describe("two-phase clear presentation", () => {
  it("waits for actual caption AND particle completion, then owns the late notice", async () => {
    const x = setup(),
      caption = effect(),
      particles = effect(),
      notice = effect();
    const run = x.presentation.begin("one", 1, 5);
    run.track(caption);
    run.after(650, () => {
      run.celebrationStarted();
      return particles;
    });
    x.reveal.mockImplementation(() =>
      x.presentation.themeRun!.after(450, () => notice),
    );
    run.seal();
    await vi.advanceTimersByTimeAsync(650);
    expect(x.presentation.rewardTheme).toBe(5);
    await vi.advanceTimersByTimeAsync(2100);
    caption.finish();
    await Promise.resolve();
    expect(x.presentation.heldTheme).toBe(1);
    expect(x.reveal).not.toHaveBeenCalled();
    particles.finish();
    await Promise.resolve();
    expect(x.presentation.heldTheme).toBeNull();
    expect(x.reveal).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(450);
    expect(x.presentation.snapshot().phase).toBe("theme");
    notice.finish();
    await Promise.resolve();
    expect(x.presentation.snapshot()).toMatchObject({
      phase: "idle",
      pending: 0,
      errors: [],
    });
    expect(vi.getTimerCount()).toBe(0);
  });
  it("defers reveal during interaction without blocking other work", async () => {
    const x = setup(),
      caption = effect();
    x.busy(true);
    const run = x.presentation.begin("one", 1, 5);
    run.track(caption);
    run.seal();
    caption.finish();
    await Promise.resolve();
    expect(x.presentation.heldTheme).toBe(1);
    expect(x.reveal).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    x.busy(false);
    x.presentation.flush();
    expect(x.reveal).toHaveBeenCalledTimes(1);
    expect(x.presentation.snapshot().phase).toBe("idle");
  });
  it("replaces stale celebrations, settles omitted work once and ignores old completion", async () => {
    const x = setup(),
      old = effect(),
      current = effect(),
      omitted = vi.fn(),
      staleLaunch = vi.fn();
    const first = x.presentation.begin("one", 1, 5);
    first.track(old);
    first.after(650, staleLaunch, omitted);
    first.seal();
    const second = x.presentation.begin("one", 1, 8);
    second.track(current);
    second.seal();
    await vi.advanceTimersByTimeAsync(1000);
    expect(omitted).toHaveBeenCalledTimes(1);
    expect(old.cancel).toHaveBeenCalledTimes(1);
    expect(staleLaunch).not.toHaveBeenCalled();
    expect(x.reveal).not.toHaveBeenCalled();
    current.finish();
    await Promise.resolve();
    expect(x.reveal).toHaveBeenCalledTimes(1);
    x.presentation.cancel();
    expect(omitted).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("drops an old game's pending reveal", async () => {
    const x = setup(),
      caption = effect();
    const run = x.presentation.begin("one", 1, 5);
    run.track(caption);
    run.seal();
    x.game("two");
    caption.finish();
    await Promise.resolve();
    expect(x.reveal).not.toHaveBeenCalled();
    expect(x.presentation.snapshot().phase).toBe("idle");
    expect(run.signal.aborted).toBe(true);
  });
  it("cancels delayed work and active resources on background/pause", async () => {
    const x = setup(),
      caption = effect(),
      omitted = vi.fn(),
      launched = vi.fn();
    const run = x.presentation.begin("one", 1, 5);
    run.track(caption);
    run.after(650, launched, omitted);
    run.seal();
    x.blocked(true);
    x.presentation.flush();
    await vi.runAllTimersAsync();
    expect(launched).not.toHaveBeenCalled();
    expect(omitted).toHaveBeenCalledTimes(1);
    expect(caption.cancel).toHaveBeenCalledTimes(1);
    expect(x.reveal).not.toHaveBeenCalled();
    expect(x.presentation.snapshot().pending).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("records an effect failure and cleans up without a delayed reveal", async () => {
    const x = setup();
    const run = x.presentation.begin("one", 1, 5);
    run.after(650, () => {
      throw new Error("effect failed");
    });
    run.seal();
    await vi.advanceTimersByTimeAsync(1000);
    expect(x.presentation.snapshot().errors).toEqual(["Error: effect failed"]);
    expect(x.presentation.snapshot().phase).toBe("idle");
    expect(x.reveal).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
