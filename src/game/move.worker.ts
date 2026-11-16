import { applyMove, type GameState, type Move } from "../core/rules";
import type { ChallengeObservation } from "../core/challenge-director";
self.onmessage = (
  event: MessageEvent<{ state: GameState; move: Move; revision: number; captureDecision?: boolean;observation?:ChallengeObservation }>,
) => {
  try {
    self.postMessage({
      result: applyMove(event.data.state, event.data.move, event.data.revision, event.data.captureDecision,event.data.observation),
    });
  } catch {
    self.postMessage({ error: true });
  }
};
