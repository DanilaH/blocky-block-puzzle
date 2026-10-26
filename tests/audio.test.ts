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
  "keeps the placement hit after %s and pickup within six voices",
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
    expect(peak).toBeLessThanOrEqual(6);
    audio.stop();
    expect(active.size).toBe(0);
    await audio.unlock();
    audio.enabled = false;
    audio.play("place");
    expect(active.size).toBe(0);
  },
);

it.each(["place", "clear", "combo", "mega", "record", "allClear"] as const)(
  "%s includes one shared contact before reward notes within six voices",
  async (kind) => {
    vi.stubGlobal("AudioContext", FakeContext);
    const audio = new GameAudio();
    await audio.unlock();
    audio.play(kind);
    expect([...active].filter((v) => v.hz === 230)).toHaveLength(1);
    expect([...active].filter((v) => v.hz === 740)).toHaveLength(1);
    expect([...active].filter((v) => v.hz === 1250)).toHaveLength(1);
    expect(peak).toBeLessThanOrEqual(6);
  },
);
