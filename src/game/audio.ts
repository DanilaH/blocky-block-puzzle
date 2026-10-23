// Original procedural prototype SFX. No extracted third-party audio.
export class GameAudio {
  enabled = true;
  private context: AudioContext | null = null;
  private voices = new Set<OscillatorNode>();
  async unlock() {
    if (!this.context) this.context = new AudioContext();
    if (this.context.state === "suspended") await this.context.resume();
  }
  stop() {
    for (const o of this.voices) {
      try {
        o.stop();
      } catch {}
    }
    this.voices.clear();
    void this.context?.suspend();
  }
  play(kind: "pick" | "place" | "clear" | "combo" | "hint", streak = 0) {
    if (!this.enabled || !this.context || this.context.state !== "running")
      return;
    const c = this.context;
    const notes =
      kind === "combo"
        ? [392, 494, 587]
        : kind === "clear"
          ? [440, 660]
          : [kind === "pick" ? 180 : kind === "place" ? 260 : 540];
    notes.forEach((hz, i) => {
      if (this.voices.size >= 6) return;
      const o = c.createOscillator(),
        v = c.createGain(),
        now = c.currentTime + i * 0.035;
      this.voices.add(o);
      o.type = kind === "place" ? "triangle" : "sine";
      o.frequency.setValueAtTime(hz * (1 + Math.min(streak, 4) * 0.035), now);
      o.frequency.exponentialRampToValueAtTime(hz * 0.7, now + 0.14);
      v.gain.setValueAtTime(0.0001, now);
      v.gain.exponentialRampToValueAtTime(0.08 / notes.length, now + 0.006);
      v.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
      o.connect(v).connect(c.destination);
      o.start(now);
      o.stop(now + 0.2);
      o.onended = () => {
        this.voices.delete(o);
        o.disconnect();
        v.disconnect();
      };
    });
  }
}
