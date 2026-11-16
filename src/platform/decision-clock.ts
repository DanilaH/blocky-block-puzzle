import type { GameState } from "../core/rules";
import type { ChallengeObservation } from "../core/challenge-director";

/** Observed foreground thinking time, excluding every blocked input interval. */
export class DecisionPlayClock {
  private gameId = "";
  private active = false;
  private elapsed = 0;
  private tick: number;
  constructor(private now = () => performance.now()) {
    this.tick = now();
  }
  private accumulate() {
    const n = this.now();
    if (this.active) this.elapsed += Math.max(0, n - this.tick);
    this.tick = n;
  }
  sync(game: GameState, enabled: boolean) {
    this.accumulate();
    const base = game.challengeState?.activeMs ?? 0;
    if (game.gameId !== this.gameId) {
      this.gameId = game.gameId;
      this.elapsed = base;
    } else this.elapsed = Math.max(this.elapsed, base);
    this.active = enabled && game.dealerVersion === "director-challenge-v1";
  }
  observation(game: GameState): ChallengeObservation | undefined {
    this.accumulate();
    return game.dealerVersion === "director-challenge-v1"
      ? { activeMs: Math.floor(this.elapsed) }
      : undefined;
  }
}
