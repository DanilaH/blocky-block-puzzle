/** Cosmetic result timeline. Never writes score/save/ad state. */
export function presentResult(
  dialog: HTMLDialogElement,
  total: number,
  calm: boolean,
  tick: (step: number) => void,
  complete: (celebrate: boolean) => void,
) {
  const score = dialog.querySelector<HTMLElement>(".result-score")!;
  const button = dialog.querySelector<HTMLElement>("#again")!;
  const animations: Animation[] = [];
  let frame = 0,
    done = false,
    lastStep = -1;
  const start = performance.now();
  score.setAttribute("aria-label", `Счёт ${total.toLocaleString("ru")}`);
  const finish = (celebrate = false) => {
    if (done) return;
    done = true;
    cancelAnimationFrame(frame);
    score.textContent = total.toLocaleString("ru");
    animations.forEach((a) => a.cancel());
    dialog.removeEventListener("pointerdown", skip);
    dialog.removeEventListener("keydown", skip);
    document.removeEventListener("visibilitychange", hide);
    dialog.dataset.counting = "false";
    if (celebrate && !calm && dialog.open && !document.hidden) {
      score.animate(
        [
          { transform: "scale(1)" },
          { transform: "scale(1.09)", offset: 0.3 },
          { transform: "scale(1)" },
        ],
        { duration: 260 },
      );
      button.animate(
        [
          { transform: "scale(.2)", opacity: 0 },
          { transform: "scale(1.04)", opacity: 1, offset: 0.7 },
          { transform: "scale(1)", opacity: 1 },
        ],
        { duration: 260 },
      );
    }
    complete(celebrate);
  };
  const skip = () => finish(false);
  const hide = () => {
    if (document.hidden) finish(false);
  };
  if (calm || !total || document.hidden) {
    finish(false);
    return () => finish(false);
  }
  dialog.dataset.counting = "true";
  animations.push(
    button.animate([{ opacity: 0 }, { opacity: 0 }], {
      duration: 1250,
      fill: "forwards",
    }),
  );
  dialog.addEventListener("pointerdown", skip);
  dialog.addEventListener("keydown", skip);
  document.addEventListener("visibilitychange", hide);
  const update = (now: number) => {
    if (!dialog.open || !dialog.isConnected) {
      finish(false);
      return;
    }
    const t = Math.max(0, Math.min(1, (now - start - 180) / 950));
    score.textContent = Math.round(total * (1 - (1 - t) ** 1.6)).toLocaleString(
      "ru",
    );
    const step = Math.floor(t * 7);
    if (t > 0 && step !== lastStep && t < 1) {
      lastStep = step;
      tick(step);
    }
    if (t === 1) finish(true);
    else frame = requestAnimationFrame(update);
  };
  score.textContent = "0";
  frame = requestAnimationFrame(update);
  return () => finish(false);
}
