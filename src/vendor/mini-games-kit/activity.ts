export type BlockedListener = (blocked: boolean) => void;

/**
 * Aggregates independent external blockers and exposes one gameplay-active edge.
 * Reasons are semantic strings so a game can use platform-specific blockers without
 * teaching the coordinator about ads, visibility, orientation or SDK details.
 */
export class GameplayActivityCoordinator {
  private readonly blockers = new Set<string>();
  private readonly blockedListeners = new Set<BlockedListener>();
  private desiredGameplay = false;
  private markedGameplay = false;
  private externallyBlocked = false;

  public constructor(
    private readonly startGameplay: () => void,
    private readonly stopGameplay: () => void,
  ) {}

  public setGameplayDesired(active: boolean): void {
    this.desiredGameplay = active;
    this.syncGameplayMarkup();
  }

  public setBlocked(reason: string, blocked: boolean): void {
    if (blocked) this.blockers.add(reason);
    else this.blockers.delete(reason);

    const nextBlocked = this.blockers.size > 0;
    if (nextBlocked !== this.externallyBlocked) {
      this.externallyBlocked = nextBlocked;
      for (const listener of this.blockedListeners) listener(nextBlocked);
    }

    this.syncGameplayMarkup();
  }

  public isBlocked(): boolean {
    return this.externallyBlocked;
  }

  public onBlockedChange(listener: BlockedListener): () => void {
    this.blockedListeners.add(listener);
    listener(this.externallyBlocked);
    return () => this.blockedListeners.delete(listener);
  }

  private syncGameplayMarkup(): void {
    const shouldBeMarked = this.desiredGameplay && this.blockers.size === 0;
    if (shouldBeMarked === this.markedGameplay) return;

    this.markedGameplay = shouldBeMarked;
    if (shouldBeMarked) this.startGameplay();
    else this.stopGameplay();
  }
}

export const installDocumentVisibilityBlocker = (
  activity: Pick<GameplayActivityCoordinator, "setBlocked">,
  reason = "visibility",
): (() => void) => {
  if (typeof document === "undefined") return () => undefined;
  const handleVisibility = (): void =>
    activity.setBlocked(reason, document.hidden);
  document.addEventListener("visibilitychange", handleVisibility);
  handleVisibility();
  return () =>
    document.removeEventListener("visibilitychange", handleVisibility);
};

export interface ViewportSizeSource {
  innerWidth: number;
  innerHeight: number;
  addEventListener(type: "resize", listener: () => void): void;
  removeEventListener(type: "resize", listener: () => void): void;
}

export interface ViewportOrientationBlockerOptions {
  reason?: string;
  isBlocked?: (width: number, height: number) => boolean;
  onChange?: (blocked: boolean) => void;
}

/**
 * Mirrors a viewport-derived orientation constraint into the activity coordinator.
 * The default policy blocks portrait viewports; games can inject another predicate.
 */
export const installViewportOrientationBlocker = (
  activity: Pick<GameplayActivityCoordinator, "setBlocked">,
  source?: ViewportSizeSource,
  options: ViewportOrientationBlockerOptions = {},
): (() => void) => {
  const viewport = source ?? (typeof window === "undefined" ? null : window);
  if (viewport === null) return () => undefined;

  const reason = options.reason ?? "orientation";
  const isBlocked =
    options.isBlocked ?? ((width: number, height: number) => height > width);
  const sync = (): void => {
    const blocked = isBlocked(viewport.innerWidth, viewport.innerHeight);
    activity.setBlocked(reason, blocked);
    options.onChange?.(blocked);
  };

  viewport.addEventListener("resize", sync);
  sync();
  return () => viewport.removeEventListener("resize", sync);
};
