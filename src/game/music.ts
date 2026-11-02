// C-major pentatonic reward register; avoids chromatic whole-chord transposition
// over the selected diatonic backing. Listening on device remains an acceptance gate.
export function musicalFrequency(hz: number) {
  const midi = 69 + 12 * Math.log2(hz / 440);
  let best = 60,
    distance = Infinity;
  for (let n = 24; n <= 96; n++) {
    if (![0, 2, 4, 7, 9].includes(n % 12)) continue;
    if (Math.abs(n - midi) < distance) {
      best = n;
      distance = Math.abs(n - midi);
    }
  }
  return 440 * 2 ** ((best - 69) / 12);
}

/** One cached buffer and at most one source; late decode cannot undo stop/focus loss. */
export class MusicLoop {
  private gain: GainNode;
  private buffer?: AudioBuffer;
  private loading?: Promise<void>;
  private source?: AudioBufferSourceNode;
  private generation = 0;
  private offset = 0;
  private startedAt = 0;
  private volume = 0;
  private active = false;
  private failed = false;
  constructor(
    private context: AudioContext,
    output: AudioNode,
  ) {
    this.gain = context.createGain();
    this.gain.gain.value = 0;
    this.gain.connect(output);
  }
  setVolume(value: number) {
    if (this.volume === value) return;
    this.volume = value;
    const p = this.gain.gain,
      t = this.context.currentTime;
    p.cancelScheduledValues(t);
    p.setTargetAtTime(value * 0.8, t, 0.12);
    if (value === 0) this.stop();
  }
  async start() {
    if (!this.volume || this.failed || this.context.state !== "running") return;
    this.active = true;
    const generation = this.generation;
    if (!this.buffer) {
      this.loading ??= (async () => {
        const response = await fetch("/audio/cozy-puzzle.ogg");
        if (!response.ok) throw new Error("Music unavailable");
        this.buffer = await this.context.decodeAudioData(
          await response.arrayBuffer(),
        );
      })().catch(() => {
        this.failed = true;
      });
      await this.loading;
    }
    if (
      !this.buffer ||
      !this.active ||
      generation !== this.generation ||
      this.source ||
      !this.volume ||
      this.context.state !== "running"
    )
      return;
    const source = this.context.createBufferSource();
    source.buffer = this.buffer;
    source.loop = true;
    source.connect(this.gain);
    const t = this.context.currentTime;
    this.gain.gain.cancelScheduledValues(t);
    this.gain.gain.setValueAtTime(0, t);
    this.gain.gain.setTargetAtTime(this.volume * 0.8, t, 0.25);
    this.startedAt = t;
    this.source = source;
    source.start(t, this.offset);
  }
  duck(big = false) {
    if (!this.source) return;
    const t = this.context.currentTime,
      p = this.gain.gain,
      base = this.volume * 0.8;
    p.cancelAndHoldAtTime(t);
    p.linearRampToValueAtTime(base * (big ? 0.4 : 0.63), t + 0.035);
    p.setTargetAtTime(base, t + (big ? 1.1 : 0.55), 0.35);
  }
  stop() {
    this.active = false;
    this.generation++;
    if (this.source && this.buffer) {
      this.offset =
        (this.offset + this.context.currentTime - this.startedAt) %
        this.buffer.duration;
      this.source.stop();
      this.source.disconnect();
      this.source = undefined;
    }
    this.gain.gain.cancelScheduledValues(this.context.currentTime);
    this.gain.gain.value = 0;
  }
}
