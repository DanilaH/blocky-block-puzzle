import { MusicalChain } from "./festival";
// Original synthesized SFX: shared solid-tile contact and bounded reward tails.
export class GameAudio {
  private soundEnabled = true;
  private allowed = true;
  private generation = 0;
  private unlocked = false;
  beforeUnlock?: () => Promise<boolean>;
  get enabled() {
    return this.soundEnabled;
  }
  set enabled(value: boolean) {
    if (this.soundEnabled === value) return;
    this.soundEnabled = value;
    if (!value) this.stop();
  }
  setAllowed(value: boolean) {
    if (this.allowed === value) return;
    this.allowed = value;
    if (!value) this.stop();
  }
  calm = false;
  private variant = 0;
  private chain = new MusicalChain();
  private context: AudioContext | null = null;
  private voices = new Map<AudioScheduledSourceNode, number>();
  private master: GainNode | null = null;
  private output: DynamicsCompressorNode | null = null;
  private delay: DelayNode | null = null;
  private wet: GainNode | null = null;
  async unlock() {
    const generation = this.generation;
    if (!this.enabled) return;
    if (this.beforeUnlock && !(await this.beforeUnlock())) return;
    if (!this.allowed || !this.enabled || generation !== this.generation)
      return;
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = 0;
      const limiter = this.context.createDynamicsCompressor();
      limiter.threshold.value = -10;
      limiter.ratio.value = 8;
      this.master.connect(limiter).connect(this.context.destination);
      this.output = limiter;
    }
    if (!this.delay) {
      this.delay = this.context.createDelay(0.3);
      this.delay.delayTime.value = 0.11;
      this.wet = this.context.createGain();
      this.wet.gain.value = this.calm ? 0 : 0.15;
      this.master!.connect(this.delay).connect(this.wet).connect(this.output!);
    }
    try {
      if (this.context.state === "suspended") await this.context.resume();
    } catch {
      return;
    }
    if (!this.allowed || !this.enabled || generation !== this.generation) {
      // A pending resume must not resurrect audio after pause/focus loss.
      if (!this.unlocked) void this.context.suspend().catch(() => {});
      return;
    }
    this.master!.gain.value = 0.65;
    this.unlocked = true;
  }
  stop() {
    this.chain.reset();
    this.generation++;
    this.unlocked = false;
    if (this.master) this.master.gain.value = 0;
    for (const voice of this.voices.keys()) {
      try {
        voice.stop();
      } catch {}
    }
    this.voices.clear();
    if (this.delay) this.master?.disconnect(this.delay);
    this.delay?.disconnect();
    this.wet?.disconnect();
    this.delay = null;
    this.wet = null;
    void this.context?.suspend().catch(() => {});
  }
  private tone(
    hz: number,
    end: number,
    start: number,
    duration: number,
    volume: number,
    type: OscillatorType = "sine",
    priority = 0,
  ) {
    if (this.voices.size >= 18) {
      // Keep the latest tactile hit audible; decorative tails yield first.
      if (priority === 0) return;
      const victim = [...this.voices].sort((a, b) => a[1] - b[1])[0];
      if (!victim || victim[1] > priority) return;
      victim[0].stop();
      this.voices.delete(victim[0]);
    }
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
    this.voices.set(o, priority);
    o.start(start);
    o.stop(start + duration + 0.01);
    o.onended = () => {
      this.voices.delete(o);
      o.disconnect();
      gain.disconnect();
    };
  }
  play(
    kind:
      | "score"
      | "pick"
      | "place"
      | "clear"
      | "combo"
      | "hint"
      | "cancel"
      | "mega"
      | "record"
      | "allClear",
    streak = 0,
    points = 0,
    intensity = 0,
  ) {
    if (
      !this.enabled ||
      !this.allowed ||
      !this.unlocked ||
      !this.context ||
      this.context.state !== "running"
    )
      return;
    const t = this.context.currentTime;
    if (["clear", "combo", "mega", "allClear", "record"].includes(kind))
      this.chain.next(performance.now());
    if (kind === "cancel") {
      this.tone(200, 130, t, 0.07, 0.07);
      return;
    }
    if (kind === "pick") {
      this.tone(620, 920, t, 0.055, 0.09);
      this.tone(190, 140, t, 0.07, 0.14);
      return;
    }
    if (this.wet)
      this.wet.gain.value = this.calm ? 0 : 0.1 + Math.min(1, intensity) * 0.12;
    if (kind === "score") {
      const base = 659.25 * Math.pow(2, this.chain.semitones / 12);
      this.tone(base, base, t, 0.22, 0.065, "sine", 1);
      if (!this.calm) this.tone(base * 1.5, base * 1.5, t + 0.065, 0.38, 0.035);
      return;
    }
    // Overlapping tails survive new rewards; only the bounded voice allocator evicts.
    if (kind !== "hint") {
      // Four articulation variants; independent from gameplay RNG and pickup count.
      const v = [
        {
          body: 230,
          end: 76,
          length: 0.105,
          attack: 740,
          tick: 1250,
          click: 0.035,
        },
        {
          body: 242,
          end: 82,
          length: 0.09,
          attack: 810,
          tick: 1370,
          click: 0.028,
        },
        {
          body: 218,
          end: 70,
          length: 0.12,
          attack: 690,
          tick: 1160,
          click: 0.04,
        },
        {
          body: 234,
          end: 79,
          length: 0.1,
          attack: 770,
          tick: 1300,
          click: 0.032,
        },
      ][this.variant++ % 4]!;
      this.tone(v.body, v.end, t, v.length, 0.29, "sine", 2);
      this.tone(v.attack, 310, t, v.click, 0.095, "triangle", 1);
      this.tone(v.tick, 650, t, 0.012, 0.027, "sine", 1);
    }
    if (kind === "place") {
      if (!this.calm && intensity > 0.15)
        this.tone(523.25, 523.25, t + 0.025, 0.36, 0.04 * intensity);
      return;
    }
    const notes =
      kind === "allClear"
        ? [523.25, 1046.5, 1567.98]
        : kind === "record"
          ? [659.25, 783.99, 1046.5]
          : kind === "mega"
            ? [523.25, 987.77, 1318.5]
            : kind === "combo"
              ? [523.25, 659.25, 1046.5]
              : kind === "hint"
                ? [659.25, 987.77]
                : [523.25, 783.99, 1046.5];
    notes.forEach((hz, i) => {
      const f = hz * Math.pow(2, this.chain.semitones / 12),
        at =
          t +
          (kind === "hint" ? 0 : kind === "allClear" ? 0.4 : 0.04) +
          i * (0.07 + Math.min(points, 300) / 3000);
      this.tone(
        f,
        f * 0.999,
        at,
        this.calm ? 0.18 : 0.48 + intensity * 0.5,
        0.105,
        "triangle",
        1,
      );
      if (!this.calm && i === 0) {
        this.tone(f * 0.5, f * 0.5, at, 0.65 + intensity * 0.55, 0.045);
        this.tone(
          f * 1.5,
          f * 1.5,
          at + 0.045,
          0.5 + intensity * 0.6,
          0.025 + intensity * 0.015,
        );
      }
    });
  }
}
