import { afterEach, expect, it, vi } from "vitest";
import { MusicLoop, musicalFrequency } from "../src/game/music";

const buffer = () => ({
  duration: 130,
  sampleRate: 100,
  numberOfChannels: 1,
  getChannelData: () => new Float32Array(13000),
});
function harness() {
  const param = {
    value: 0,
    cancelScheduledValues: vi.fn(),
    cancelAndHoldAtTime: vi.fn(),
    setTargetAtTime: vi.fn(),
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
  };
  const sources: any[] = [];
  const c = {
    currentTime: 0,
    state: "running",
    sampleRate: 100,
    createBuffer: (_: number, length: number, rate: number) => ({
      duration: length / rate,
      getChannelData: () => new Float32Array(length),
    }),
    createGain: () => ({ gain: param, connect: vi.fn() }),
    decodeAudioData: vi.fn(async () => buffer()),
    createBufferSource: () => {
      const s = {
        start: vi.fn(),
        stop: vi.fn(),
        disconnect: vi.fn(),
        connect: vi.fn(),
        loop: false,
      };
      sources.push(s);
      return s;
    },
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    })),
  );
  return {
    c,
    param,
    sources,
    music: new MusicLoop(c as unknown as AudioContext, {} as AudioNode),
  };
}
afterEach(() => vi.unstubAllGlobals());
it("concurrent starts share a decode and source; resume keeps offset, not old ducking", async () => {
  const { music, c, param, sources } = harness();
  music.setVolume(0.35);
  await Promise.all([music.start(), music.start(), music.start()]);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(c.decodeAudioData).toHaveBeenCalledTimes(1);
  expect(sources).toHaveLength(4);
  expect(sources[0].loop).toBe(true);
  music.setSeries(2);
  music.setSeries(6);
  music.setSeries(10);
  music.setSeries(0);
  expect(sources).toHaveLength(4);
  c.currentTime = 12;
  music.duck(true);
  expect(param.cancelAndHoldAtTime).toHaveBeenCalled();
  const count = param.cancelScheduledValues.mock.calls.length;
  music.setVolume(0.35);
  expect(param.cancelScheduledValues).toHaveBeenCalledTimes(count);
  music.stop();
  for (const s of sources) {
    expect(s.stop).toHaveBeenCalledTimes(1);
    expect(s.disconnect).toHaveBeenCalledTimes(1);
  }
  c.currentTime = 20;
  await music.start();
  expect(sources).toHaveLength(8);
  expect(sources[4].start).toHaveBeenCalledWith(20, 12);
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("stop during decode never starts late music; later start uses cached buffer", async () => {
  const { music, c, sources } = harness();
  let resolve!: (v: any) => void;
  c.decodeAudioData.mockImplementation(() => new Promise((r) => (resolve = r)));
  music.setVolume(0.35);
  const pending = music.start();
  await vi.waitFor(() => expect(c.decodeAudioData).toHaveBeenCalled());
  music.stop();
  resolve(buffer());
  await pending;
  expect(sources).toHaveLength(0);
  await music.start();
  expect(sources).toHaveLength(4);
});
it("zero volume and suspended context cannot start music; failures do not retry per move", async () => {
  const { music, c, sources } = harness();
  await music.start();
  expect(fetch).not.toHaveBeenCalled();
  music.setVolume(0.5);
  c.state = "suspended";
  await music.start();
  expect(sources).toHaveLength(0);
  c.state = "running";
  vi.mocked(fetch).mockRejectedValue(new Error("offline"));
  await music.start();
  await music.start();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(sources).toHaveLength(0);
});
it("reward frequencies stay in C pentatonic and ascend without exceeding register", () => {
  const values = [
    523.25, 622.25, 698.46, 783.99, 932.33, 1046.5, 1244.5, 1396.91,
  ].map(musicalFrequency);
  expect(values).toEqual([...values].sort((a, b) => a - b));
  for (const hz of values)
    expect([0, 2, 4, 7, 9]).toContain(
      Math.round(69 + 12 * Math.log2(hz / 440)) % 12,
    );
  expect(musicalFrequency(9999)).toBeLessThan(2200);
});
