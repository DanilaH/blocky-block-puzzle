import { afterEach, expect, it, vi } from "vitest";
import { GameAudio } from "../src/game/audio";
const active = new Set<FakeOscillator>();
let peak = 0;
class FakeOscillator {
  hz = 0;
  onended: (() => void) | null = null;
  frequency = {
    setValueAtTime: (v: number) => {
      this.hz = v;
    },
    exponentialRampToValueAtTime() {},
  };
  connect() {
    return this;
  }
  disconnect() {}
  start() {
    active.add(this);
    peak = Math.max(peak, active.size);
  }
  stop(at?: number) {
    if (at === undefined) {
      active.delete(this);
      this.onended?.();
    }
  }
}
class FakeContext {
  state = "running";
  currentTime = 0;
  destination = {};
  createOscillator() {
    return new FakeOscillator();
  }
  createDelay() {
    return {
      delayTime: { value: 0 },
      connect() {
        return this;
      },
      disconnect() {},
    };
  }
  createGain() {
    return {
      gain: {
        value: 0,
        setValueAtTime() {},
        exponentialRampToValueAtTime() {},
      },
      connect() {
        return this;
      },
      disconnect() {},
    };
  }
  createDynamicsCompressor() {
    return {
      threshold: { value: 0 },
      ratio: { value: 0 },
      connect() {
        return this;
      },
    };
  }
  async resume() {
    this.state = "running";
  }
  async suspend() {
    this.state = "suspended";
  }
}
afterEach(() => {
  vi.unstubAllGlobals();
  active.clear();
  peak = 0;
});
it.each(["record", "allClear"] as const)(
  "keeps the placement hit after %s and pickup within eighteen voices",
  async (kind) => {
    vi.stubGlobal("AudioContext", FakeContext);
    const audio = new GameAudio();
    await audio.unlock();
    audio.play(kind);
    audio.play("pick");
    audio.play("place");
    expect([...active].some((v) => v.hz > 210 && v.hz < 250)).toBe(true);
    expect([...active].some((v) => v.hz >= 690 && v.hz <= 810)).toBe(true);
    expect([...active].some((v) => v.hz >= 1160 && v.hz <= 1370)).toBe(true);
    for (let i = 0; i < 12; i++) audio.play("place");
    expect(peak).toBeLessThanOrEqual(18);
    audio.stop();
    expect(active.size).toBe(0);
    await audio.unlock();
    audio.enabled = false;
    audio.play("place");
    expect(active.size).toBe(0);
  },
);

it.each(["place", "clear", "combo", "mega", "record", "allClear"] as const)(
  "%s includes one shared contact before reward notes within eighteen voices",
  async (kind) => {
    vi.stubGlobal("AudioContext", FakeContext);
    const audio = new GameAudio();
    await audio.unlock();
    audio.play(kind);
    expect([...active].filter((v) => v.hz === 230)).toHaveLength(1);
    expect([...active].filter((v) => v.hz === 740)).toHaveLength(1);
    expect([...active].filter((v) => v.hz === 1250)).toHaveLength(1);
    expect(peak).toBeLessThanOrEqual(18);
  },
);

it("reward pitch rises with combo and points, stays bounded and respects mute", async () => {
  vi.stubGlobal("AudioContext", FakeContext);
  const audio = new GameAudio();
  await audio.unlock();
  audio.play("clear", 1, 11);
  const low = [...active]
    .map((v) => v.hz)
    .filter((v) => v !== 230 && v !== 740 && v !== 1250);
  audio.play("clear", 6, 300);
  const high = [...active]
    .map((v) => v.hz)
    .filter((v) => v !== 242 && v !== 810 && v !== 1370);
  expect(Math.max(...high)).toBeGreaterThan(Math.max(...low));
  audio.play("clear", 999, 999999);
  expect(Math.max(...[...active].map((v) => v.hz))).toBeLessThan(2300);
  expect(peak).toBeLessThanOrEqual(18);
  audio.stop();
  expect(active.size).toBe(0);
});

it("a new reward keeps a live tail and stop clears all voices", async () => {
  vi.stubGlobal("AudioContext", FakeContext);
  const audio = new GameAudio();
  await audio.unlock();
  audio.play("clear", 1, 11, 0.4);
  const old = [...active];
  audio.play("clear", 2, 16, 0.8);
  expect(old.some((v) => active.has(v))).toBe(true);
  expect(peak).toBeLessThanOrEqual(18);
  audio.stop();
  expect(active.size).toBe(0);
});

it("mute and focus loss cut live tails, gain does not replay them", async () => {
  vi.stubGlobal("AudioContext", FakeContext);
  const audio = new GameAudio();
  await audio.unlock();
  audio.play("allClear");
  expect(active.size).toBeGreaterThan(0);
  audio.setAllowed(false);
  expect(active.size).toBe(0);
  await audio.unlock();
  audio.play("place");
  expect(active.size).toBe(0);
  audio.setAllowed(true);
  audio.play("place");
  expect(active.size).toBe(0);
  await audio.unlock();
  audio.play("place");
  expect(active.size).toBeGreaterThan(0);
  audio.enabled = false;
  expect(active.size).toBe(0);
});

it("late AudioContext.resume cannot play after stop", async () => {
  let finish!: () => void;
  let context!: FakeContext;
  class DeferredContext extends FakeContext {
    constructor() {
      super();
      context = this;
      this.state = "suspended";
    }
    override resume() {
      return new Promise<void>((resolve) => {
        finish = () => {
          this.state = "running";
          resolve();
        };
      });
    }
  }
  vi.stubGlobal("AudioContext", DeferredContext);
  const audio = new GameAudio();
  const pending = audio.unlock();
  audio.stop();
  finish();
  await pending;
  audio.play("clear");
  expect(active.size).toBe(0);
  expect(context.state).toBe("suspended");
});

it("denied native focus never creates an AudioContext", async () => {
  const ctor = vi.fn();
  vi.stubGlobal("AudioContext", ctor);
  const audio = new GameAudio();
  audio.beforeUnlock = async () => false;
  await audio.unlock();
  expect(ctor).not.toHaveBeenCalled();
});

it("series pitch survives a long wait and audio stop/resume", async () => {
  vi.stubGlobal("AudioContext", FakeContext);
  const audio = new GameAudio();
  await audio.unlock();
  audio.play("clear", 4, 300);
  const frequency = 523.25 * Math.pow(2, 7 / 12);
  expect([...active].some((v) => Math.abs(v.hz - frequency) < 0.01)).toBe(true);
  audio.stop();
  await audio.unlock();
  audio.play("place", 4, 1);
  audio.play("clear", 5, 400);
  const next = 523.25 * Math.pow(2, 10 / 12);
  expect([...active].some((v) => Math.abs(v.hz - next) < 0.01)).toBe(true);
  audio.stop();
  await audio.unlock();
  audio.play("clear", 1, 100);
  expect([...active].some((v) => v.hz === 523.25)).toBe(true);
  audio.stop();
});
