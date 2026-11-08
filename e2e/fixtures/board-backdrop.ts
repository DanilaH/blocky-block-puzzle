import "/src/style.css";
import "/src/enamel.css";
import "/src/classic.css";
import "/src/arcade.css";
import { BoardBackdrop } from "/src/game/board-backdrop";
document.body.style.cssText =
  "display:flex;gap:12px;padding:16px;background:white";
const reference = document.createElement("div"),
  candidate = document.createElement("div");
for (const board of [reference, candidate]) {
  board.id = "board";
  board.style.cssText = "width:256px;height:256px;flex:none;border-radius:0";
  document.body.append(board);
}
reference.dataset.staticBoard = "true";
reference.dataset.test = "reference";
candidate.dataset.test = "candidate";
const backdrop = new BoardBackdrop(candidate, 0xc9dbe7);
(window as any).beds = { reference, candidate, backdrop };
