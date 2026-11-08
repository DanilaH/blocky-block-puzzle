/** Shared cosmetic RAF. Subscribers stop explicitly with the game lifecycle. */
import type Phaser from "phaser";
class VisualClock {
  private jobs = new Map<
    (now: number) => void,
    { interval: number; due: number }
  >();
  private frame = 0;
  private external = false;
  /** Align decorative canvases with the board's rendered frames instead of
   * independently submitting new surfaces between two Phaser frames. */
  drive(subscribe: (tick: (now: number) => void) => () => void) {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.external = true;
    const stop = subscribe((now) => this.advance(now));
    return () => {
      stop();
      this.external = false;
      if (this.jobs.size && !this.frame)
        this.frame = requestAnimationFrame(this.tick);
    };
  }
  add(callback: (now: number) => void, fps = 60) {
    this.jobs.set(callback, { interval: 1000 / fps, due: 0 });
    if (!this.external && !this.frame)
      this.frame = requestAnimationFrame(this.tick);
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
    this.advance(now);
    if (!this.external && this.jobs.size && !this.frame)
      this.frame = requestAnimationFrame(this.tick);
  };
  private advance(now: number) {
    for (const [callback, job] of this.jobs) {
      if (now + 0.5 < job.due) continue;
      job.due =
        now +
        job.interval -
        (job.due ? Math.min(job.interval / 2, Math.max(0, now - job.due)) : 0);
      callback(now);
    }
  }
}
export const visualClock = new VisualClock();
export function connectVisualClock(game: Phaser.Game) {
  const release = visualClock.drive((tick) => {
    const frame = () => tick(performance.now());
    game.events.on("postrender", frame);
    return () => {
      game.events.off("postrender", frame);
    };
  });
  game.events.once("destroy", release);
}
