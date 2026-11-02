import { percussionLoops, percussionLevels } from "./music-layers";
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

/** Cached backing + three percussion loops; at most four sources, none created on combo. */
export class MusicLoop {
  private gain: GainNode;
  private layers: {
    buffer: AudioBuffer;
    gain: GainNode;
    source?: AudioBufferSourceNode;
  }[] = [];
  private streak = 0;
  setSeries(streak: number) {
    if (this.streak === streak) return;
    this.streak = streak;
    const levels = percussionLevels(streak);
    this.layers.forEach((l, i) =>
      l.gain.gain.setTargetAtTime(
        levels[i]!,
        this.context.currentTime,
        streak ? 0.35 : 0.65,
      ),
    );
  }
  private buffer?: AudioBuffer;
  private loading?: Promise<void>;
  private source?: AudioBufferSourceNode;
  private generation = 0;
  private offset = 0;
  private loopDuration = 0;
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
    p.setTargetAtTime(value * 0.32, t, 0.12);
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
        this.layers = percussionLoops(this.context).map((buffer) => {
          const gain = this.context.createGain();
          gain.gain.value = 0;
          gain.connect(this.gain);
          return { buffer, gain };
        });
        const frames = Math.min(
          Math.round(this.buffer.duration * this.buffer.sampleRate),
          Math.round(((256 * 60) / 118) * this.buffer.sampleRate),
        );
        this.loopDuration = frames / this.buffer.sampleRate;
        // Bridge only the final 2 ms to the first sample: no silent gap, and no
        // lossy-codec endpoint step when the sample-aligned loop wraps.
        const bridge = Math.max(1, Math.round(this.buffer.sampleRate * 0.002));
        for (let ch = 0; ch < this.buffer.numberOfChannels; ch++) {
          const data = this.buffer.getChannelData(ch);
          const delta = data[0]! - data[frames - 1]!;
          for (let i = 0; i < bridge; i++)
            data[frames - bridge + i]! += (delta * (i + 1)) / bridge;
        }
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
    // Exact 256 beats at 118 BPM: exclude decoder padding at the tail.
    source.loopEnd = this.loopDuration;
    source.connect(this.gain);
    const t = this.context.currentTime;
    this.gain.gain.cancelScheduledValues(t);
    this.gain.gain.setValueAtTime(0, t);
    this.gain.gain.setTargetAtTime(this.volume * 0.32, t, 0.25);
    this.startedAt = t;
    this.source = source;
    source.start(t, this.offset);
    const levels = percussionLevels(this.streak);
    this.layers.forEach((layer, i) => {
      const s = this.context.createBufferSource();
      s.buffer = layer.buffer;
      s.loop = true;
      s.connect(layer.gain);
      layer.gain.gain.cancelScheduledValues(t);
      layer.gain.gain.setValueAtTime(0, t);
      layer.gain.gain.setTargetAtTime(levels[i]!, t, 0.35);
      s.start(t, this.offset % layer.buffer.duration);
      layer.source = s;
    });
  }
  duck(big = false) {
    if (!this.source) return;
    const t = this.context.currentTime,
      p = this.gain.gain,
      base = this.volume * 0.32;
    p.cancelAndHoldAtTime(t);
    p.linearRampToValueAtTime(base * (big ? 0.4 : 0.63), t + 0.035);
    p.setTargetAtTime(base, t + (big ? 1.1 : 0.55), 0.35);
  }
  stop() {
    this.layers.forEach((layer) => {
      layer.source?.stop();
      layer.source?.disconnect();
      layer.source = undefined;
      layer.gain.gain.cancelScheduledValues(this.context.currentTime);
      layer.gain.gain.value = 0;
    });
    this.active = false;
    this.generation++;
    if (this.source && this.buffer) {
      this.offset =
        (this.offset + this.context.currentTime - this.startedAt) %
        this.loopDuration;
      this.source.stop();
      this.source.disconnect();
      this.source = undefined;
    }
    this.gain.gain.cancelScheduledValues(this.context.currentTime);
    this.gain.gain.value = 0;
  }
}
