import { Atmosphere } from "/src/game/atmosphere";
import { Festival } from "/src/game/festival";
// Run deterministic draw steps without a competing cosmetic RAF.
window.requestAnimationFrame = () => 0;
const atmosphere = new Atmosphere(),
  festival = new Festival();
const board = new DOMRect(30, 140, 320, 320);
(window as any).effects = { atmosphere, festival, board };
