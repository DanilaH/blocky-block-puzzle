import { findHint } from "../core/hints";
import type { GameState } from "../core/rules";
self.onmessage = (event: MessageEvent<GameState>) => {
  self.postMessage(findHint(event.data));
};
