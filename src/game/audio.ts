// Original synthesized arcade SFX: woody transients, body and bell harmonics.
export class GameAudio {
  enabled = true;
  private context: AudioContext | null = null;
  private voices = new Set<AudioScheduledSourceNode>();
  private master: GainNode | null = null;
  async unlock() {
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = 0.65;
      const limiter = this.context.createDynamicsCompressor();
      limiter.threshold.value = -10;
      limiter.ratio.value = 8;
      this.master.connect(limiter).connect(this.context.destination);
    }
    if (this.context.state === "suspended") await this.context.resume();
  }
  stop() {
    for (const voice of this.voices) {
      try {
        voice.stop();
      } catch {}
    }
    this.voices.clear();
    void this.context?.suspend();
  }
  private tone(
    hz: number,
    end: number,
    start: number,
    duration: number,
    volume: number,
    type: OscillatorType = "sine",
  ) {
    if (this.voices.size >= 24) return;
    const c = this.context!,
      o = c.createOscillator(),
      gain = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(hz, start);
    o.frequency.exponentialRampToValueAtTime(end, start + duration);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    o.connect(gain).connect(this.master!);
    this.voices.add(o);
    o.start(start);
    o.stop(start + duration + 0.01);
    o.onended = () => {
      this.voices.delete(o);
      o.disconnect();
      gain.disconnect();
    };
  }
  play(kind: "pick" | "place" | "clear" | "combo" | "hint", streak = 0) {
    if (!this.enabled || !this.context || this.context.state !== "running")
      return;
    const t = this.context.currentTime;
    if (kind === "pick") {
      this.tone(620, 920, t, 0.055, 0.09);
      this.tone(190, 140, t, 0.07, 0.14);
      return;
    }
    if (kind === "place") {
      this.tone(230, 72, t, 0.12, 0.32);
      this.tone(740, 280, t, 0.045, 0.12, "triangle");
      this.tone(1250, 620, t, 0.025, 0.05);
      return;
    }
    const notes =
      kind === "combo"
        ? [523.25, 659.25, 783.99, 1046.5]
        : kind === "hint"
          ? [659.25, 987.77]
          : [523.25, 783.99, 1046.5];
    if (kind !== "hint") this.tone(160, 48, t, 0.2, 0.25);
    notes.forEach((hz, i) => {
      const f = hz * Math.pow(2, Math.min(streak, 5) / 24),
        at = t + i * 0.055;
      this.tone(f, f * 0.995, at, 0.3, 0.13);
      this.tone(f * 2.01, f * 2, at, 0.12, 0.025);
      this.tone(f * 3, f * 3, at, 0.065, 0.012);
    });
  }
}
