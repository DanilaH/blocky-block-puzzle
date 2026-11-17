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
    const base = game.challengeBuildState?.activeMs ?? game.challengeV3State?.activeMs ?? game.challengeV2State?.activeMs ?? game.challengeState?.activeMs ?? 0;
    if (game.gameId !== this.gameId) {
      this.gameId = game.gameId;
      this.elapsed = base;
    } else this.elapsed = Math.max(this.elapsed, base);
    this.active = enabled && ["director-challenge-v1","director-challenge-v2","director-challenge-v3","director-build-v1"].includes(game.dealerVersion);
  }
  observation(game: GameState): ChallengeObservation | undefined {
    this.accumulate();
    return ["director-challenge-v1","director-challenge-v2","director-challenge-v3","director-build-v1"].includes(game.dealerVersion)
      ? { activeMs: Math.floor(this.elapsed) }
      : undefined;
  }
}
