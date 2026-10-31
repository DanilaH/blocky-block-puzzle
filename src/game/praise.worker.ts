import { rankMoves } from "../core/praise";
self.onmessage = (e) => self.postMessage(rankMoves(e.data));
