const cssColor = (color: number) => "#" + color.toString(16).padStart(6, "0");
/** Rasterize each board palette once, then crossfade an opaque previous bed.
 * The transparent live WebGL canvas remains above both beds. Theme frames do
 * not invalidate/repaint the board's repeating grid on every color sample. */
export class BoardBackdrop {
  private previous = document.createElement("div");
  private animation: Animation | null = null;
  constructor(
    private board: HTMLElement,
    color: number,
  ) {
    board.dataset.staticBoard = "true";
    board.dataset.compositedBed = "true";
    this.previous.className = "board-previous-bed";
    this.previous.setAttribute("aria-hidden", "true");
    board.prepend(this.previous);
    board.style.backgroundColor = cssColor(color);
  }
  set(from: number, to: number, duration: number) {
    this.animation?.cancel();
    this.previous.style.backgroundColor = cssColor(from);
    this.board.style.backgroundColor = cssColor(to);
    if (from !== to && duration > 0)
      this.animation = this.previous.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration,
        easing: "linear",
      });
  }
  destroy() {
    this.finish();
    this.previous.remove();
    delete this.board.dataset.staticBoard;
    delete this.board.dataset.compositedBed;
    this.board.style.removeProperty("background-color");
  }
  finish() {
    this.animation?.cancel();
    this.animation = null;
  }
}
