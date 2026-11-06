import { applyMove, type GameState, type Move } from "../core/rules";
self.onmessage = (
  event: MessageEvent<{ state: GameState; move: Move; revision: number }>,
) => {
  try {
    self.postMessage({
      result: applyMove(event.data.state, event.data.move, event.data.revision),
    });
  } catch {
    self.postMessage({ error: true });
  }
};
