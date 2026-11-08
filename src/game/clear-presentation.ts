/** DEV prototype: one cancellable all-clear presentation, without game state. */
export type PresentationEffect = {
  finished: Promise<void>;
  cancel: () => void;
};
export type ClearRun = {
  gameId: string;
  signal: AbortSignal;
  track: (effect: PresentationEffect | undefined) => void;
  after: (
    ms: number,
    task: () => PresentationEffect | undefined,
    omitted?: () => void,
  ) => void;
  celebrationStarted: () => void;
  seal: () => void;
};
type Phase = "celebration" | "theme";
type Resource = { cancel: () => void };
type Job = {
  gameId: string;
  fromTheme: number;
  toTheme: number;
  phase: Phase;
  controller: AbortController;
  resources: Set<Resource>;
  sealed: boolean;
  executing: number;
  largeStarted: boolean;
  run: ClearRun;
};
type Hooks = {
  gameId: () => string;
  blocked: () => boolean;
  busy: () => boolean;
  reveal: () => void;
  changed?: () => void;
};
type Runtime = {
  now: () => number;
  delay: (fn: () => void, ms: number) => () => void;
};

export class ClearPresentation {
  private job: Job | null = null;
  private events: { name: string; at: number; gameId: string; phase: Phase }[] =
    [];
  private errors: string[] = [];
  constructor(
    private hooks: Hooks,
    private runtime: Runtime = {
      now: () => performance.now(),
      delay: (fn, ms) => {
        const id = setTimeout(fn, ms);
        return () => clearTimeout(id);
      },
    },
  ) {}
  get heldTheme() {
    return this.job?.phase === "celebration" ? this.job.fromTheme : null;
  }
  get rewardTheme() {
    return this.job?.phase === "celebration" && this.job.largeStarted
      ? this.job.toTheme
      : null;
  }
  get themeRun() {
    return this.job?.phase === "theme" ? this.job.run : null;
  }
  snapshot() {
    return {
      phase: this.job?.phase ?? "idle",
      heldTheme: this.heldTheme,
      pending: this.job?.resources.size ?? 0,
      errors: [...this.errors],
      events: [...this.events],
    };
  }
  beginSample() {
    this.events = [];
    this.errors = [];
  }
  private record(job: Job, name: string) {
    this.events.push({
      name,
      at: this.runtime.now(),
      gameId: job.gameId,
      phase: job.phase,
    });
    if (this.events.length > 128) this.events.shift();
    this.hooks.changed?.();
  }
  private valid(job: Job) {
    if (this.job !== job || job.controller.signal.aborted) return false;
    if (job.gameId !== this.hooks.gameId() || this.hooks.blocked()) {
      this.cancel();
      return false;
    }
    return true;
  }
  begin(gameId: string, fromTheme: number, toTheme: number): ClearRun {
    this.cancel();
    const job = {
      gameId,
      fromTheme,
      toTheme,
      phase: "celebration" as Phase,
      controller: new AbortController(),
      resources: new Set<Resource>(),
      sealed: false,
      executing: 0,
      largeStarted: false,
    } as Job;
    job.run = {
      gameId,
      signal: job.controller.signal,
      track: (effect) => this.track(job, effect),
      after: (ms, task, omitted) => this.after(job, ms, task, omitted),
      celebrationStarted: () => {
        if (this.valid(job)) {
          job.largeStarted = true;
          this.record(job, "large-start");
        }
      },
      seal: () => {
        if (this.valid(job)) {
          job.sealed = true;
          this.advance(job);
        }
      },
    };
    this.job = job;
    this.record(job, "start");
    return job.run;
  }
  private track(job: Job, effect: PresentationEffect | undefined) {
    if (!effect) return;
    if (!this.valid(job)) {
      effect.cancel();
      return;
    }
    const resource = { cancel: effect.cancel };
    job.resources.add(resource);
    effect.finished.then(
      () => {
        job.resources.delete(resource);
        if (this.valid(job)) this.advance(job);
      },
      (error) => {
        if (this.job === job) {
          this.errors.push(String(error));
          this.cancel();
        }
      },
    );
  }
  private after(
    job: Job,
    ms: number,
    task: () => PresentationEffect | undefined,
    omitted?: () => void,
  ) {
    if (!this.valid(job)) {
      omitted?.();
      return;
    }
    let waiting = true;
    const resource = {
      cancel: () => {
        cancelDelay();
        if (waiting) {
          waiting = false;
          omitted?.();
        }
      },
    };
    job.resources.add(resource);
    const cancelDelay = this.runtime.delay(() => {
      if (!this.valid(job)) return;
      waiting = false;
      job.executing++;
      job.resources.delete(resource);
      try {
        this.track(job, task());
      } catch (error) {
        this.errors.push(String(error));
        this.cancel();
      } finally {
        job.executing--;
        if (this.valid(job)) this.advance(job);
      }
    }, ms);
  }
  flush() {
    if (this.job && this.valid(this.job)) this.advance(this.job);
  }
  private advance(job: Job) {
    if (!job.sealed || job.executing || job.resources.size || !this.valid(job))
      return;
    if (job.phase === "celebration") {
      if (this.hooks.busy()) return;
      this.record(job, "celebration-end");
      job.phase = "theme";
      job.executing++;
      this.record(job, "theme-start");
      try {
        this.hooks.reveal();
      } catch (error) {
        this.errors.push(String(error));
        this.cancel();
      } finally {
        job.executing--;
        if (this.valid(job)) this.advance(job);
      }
    } else {
      this.record(job, "complete");
      this.job = null;
      job.controller.abort();
      this.hooks.changed?.();
    }
  }
  cancel() {
    const job = this.job;
    if (!job) return;
    this.job = null;
    job.controller.abort();
    for (const resource of job.resources) resource.cancel();
    job.resources.clear();
    this.record(job, "cancel");
  }
}
