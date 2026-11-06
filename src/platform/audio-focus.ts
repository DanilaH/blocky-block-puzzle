import { Capacitor, registerPlugin } from "@capacitor/core";

export interface FocusState {
  allowed: boolean;
  revision: number;
}
export interface AudioFocusBridge {
  setActive(value: { active: boolean }): Promise<FocusState>;
  request(): Promise<FocusState>;
  addListener(
    name: "focusChanged",
    fn: (state: FocusState) => void,
  ): Promise<unknown>;
}
export function nativeAudioFocus(): AudioFocusBridge | null {
  return Capacitor.isNativePlatform()
    ? registerPlugin<AudioFocusBridge>("BlockyAudioFocus")
    : null;
}

/** Serializes lifecycle commands; older request replies cannot undo a loss event. */
export class AudioFocus {
  private active = false;
  private allowed = false;
  private revision = -1;
  private generation = 0;
  private queue: Promise<unknown>;
  private listening = false;
  constructor(
    private bridge: AudioFocusBridge | null,
    private output: (allowed: boolean) => void,
  ) {
    output(false);
    this.queue = bridge
      ? bridge
          .addListener("focusChanged", (s) => this.accept(s))
          .then(() => {
            this.listening = true;
          })
          .catch(() => {})
      : Promise.resolve();
  }
  private accept(state: FocusState) {
    if (state.revision < this.revision) return;
    this.revision = state.revision;
    this.allowed = this.active && state.allowed;
    this.output(this.allowed);
  }
  setActive(active: boolean) {
    if (this.active === active) return;
    this.active = active;
    const generation = ++this.generation;
    this.allowed = false;
    this.output(false);
    this.queue = this.queue
      .then(async () => {
        if (this.bridge) {
          const state = await this.bridge.setActive({ active });
          if (generation === this.generation) this.accept(state);
        } else {
          this.allowed = this.active;
          this.output(this.allowed);
        }
      })
      .catch(() => {
        this.allowed = false;
        this.output(false);
      });
  }
  async request(): Promise<boolean> {
    const generation = this.generation;
    if (!this.active) return false;
    if (this.allowed) return true;
    this.queue = this.queue
      .then(async () => {
        if (
          !this.active ||
          generation !== this.generation ||
          (this.bridge && !this.listening)
        )
          return;
        if (this.bridge) {
          const state = await this.bridge.request();
          if (generation === this.generation) this.accept(state);
        }
      })
      .catch(() => {
        this.allowed = false;
        this.output(false);
      });
    await this.queue;
    return generation === this.generation && this.active && this.allowed;
  }
}
