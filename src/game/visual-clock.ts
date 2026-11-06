/** Shared cosmetic RAF. Subscribers stop explicitly with the game lifecycle. */
class VisualClock {
  private jobs = new Map<
    (now: number) => void,
    { interval: number; due: number }
  >();
  private frame = 0;
  add(callback: (now: number) => void, fps = 60) {
    this.jobs.set(callback, { interval: 1000 / fps, due: 0 });
    if (!this.frame) this.frame = requestAnimationFrame(this.tick);
    return () => {
      this.jobs.delete(callback);
      if (!this.jobs.size) {
        cancelAnimationFrame(this.frame);
        this.frame = 0;
      }
    };
  }
  private tick = (now: number) => {
    this.frame = 0;
    for (const [callback, job] of this.jobs) {
      if (now + 0.5 < job.due) continue;
      job.due =
        now +
        job.interval -
        (job.due ? Math.min(job.interval / 2, Math.max(0, now - job.due)) : 0);
      callback(now);
    }
    if (this.jobs.size && !this.frame)
      this.frame = requestAnimationFrame(this.tick);
  };
}
export const visualClock = new VisualClock();
