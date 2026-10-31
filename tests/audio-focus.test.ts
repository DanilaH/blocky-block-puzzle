import { expect, it, vi } from "vitest";
import {
  AudioFocus,
  type AudioFocusBridge,
  type FocusState,
} from "../src/platform/audio-focus";
function harness() {
  let event: (s: FocusState) => void = () => {};
  let revision = 0;
  const bridge: AudioFocusBridge = {
    addListener: async (_, fn) => {
      event = fn;
    },
    setActive: vi.fn(async () => ({ allowed: false, revision: ++revision })),
    request: vi.fn(async () => ({ allowed: true, revision: ++revision })),
  };
  const output = vi.fn();
  return {
    bridge,
    output,
    focus: new AudioFocus(bridge, output),
    emit: (s: FocusState) => event(s),
  };
}
it("waits for an explicit gesture; mute/pause releases immediately", async () => {
  const h = harness();
  h.focus.setActive(true);
  await Promise.resolve();
  expect(h.bridge.request).not.toHaveBeenCalled();
  expect(await h.focus.request()).toBe(true);
  h.focus.setActive(false);
  expect(h.output).toHaveBeenLastCalledWith(false);
  expect(await h.focus.request()).toBe(false);
  await Promise.resolve();
  expect(h.bridge.setActive).toHaveBeenLastCalledWith({ active: false });
});
it("ignores an old granted reply after a newer native loss event", async () => {
  const h = harness();
  let resolve!: (s: FocusState) => void;
  h.bridge.request = vi.fn(
    () =>
      new Promise<FocusState>((r) => {
        resolve = r;
      }),
  );
  h.focus.setActive(true);
  const pending = h.focus.request();
  await vi.waitFor(() => expect(resolve).toBeDefined());
  h.emit({ allowed: false, revision: 10 });
  resolve({ allowed: true, revision: 9 });
  expect(await pending).toBe(false);
  expect(h.output).toHaveBeenLastCalledWith(false);
});
it("does not resurrect an interrupted gesture after pause and resume", async () => {
  const h = harness();
  let resolve!: (s: FocusState) => void;
  h.bridge.request = () =>
    new Promise<FocusState>((r) => {
      resolve = r;
    });
  h.focus.setActive(true);
  const pending = h.focus.request();
  await vi.waitFor(() => expect(resolve).toBeDefined());
  h.focus.setActive(false);
  h.focus.setActive(true);
  resolve({ allowed: true, revision: 2 });
  expect(await pending).toBe(false);
});
it("denied/failed focus does not block gameplay or allow sound", async () => {
  const h = harness();
  h.focus.setActive(true);
  h.bridge.request = async () => ({ allowed: false, revision: 2 });
  expect(await h.focus.request()).toBe(false);
  h.bridge.request = async () => {
    throw Error("bridge unavailable");
  };
  expect(await h.focus.request()).toBe(false);
  expect(h.output).toHaveBeenLastCalledWith(false);
});
it("native gain while inactive cannot unmute; web needs no plugin", async () => {
  const h = harness();
  await Promise.resolve();
  h.emit({ allowed: true, revision: 20 });
  expect(h.output).toHaveBeenLastCalledWith(false);
  const web = new AudioFocus(null, h.output);
  web.setActive(true);
  expect(await web.request()).toBe(true);
  web.setActive(false);
  expect(await web.request()).toBe(false);
});

it("fails closed if loss notifications cannot be registered", async () => {
  const h = harness();
  h.bridge.addListener = async () => {
    throw Error("listener unavailable");
  };
  const focus = new AudioFocus(h.bridge, h.output);
  focus.setActive(true);
  expect(await focus.request()).toBe(false);
  expect(h.bridge.request).not.toHaveBeenCalled();
});
