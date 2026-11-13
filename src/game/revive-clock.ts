import { REVIVE_WINDOW_MS } from "../core/revive-offer";

/** Visual interpolation only. Acceptance and expiration use the saved wall deadline. */
export function presentReviveClock(clock: HTMLElement, deadline: number) {
  const ring = clock.querySelector<SVGCircleElement>(".clock-progress")!;
  let animation: Animation | null = null;
  let stopped = false;
  const sync = () => {
    animation?.cancel();
    animation = null;
    if (stopped) return;
    const remaining = Math.max(
      0,
      Math.min(REVIVE_WINDOW_MS, deadline - Date.now()),
    );
    const offset = (100 * remaining) / REVIVE_WINDOW_MS;
    ring.style.strokeDashoffset = String(offset);
    if (remaining && !document.hidden) {
      animation = ring.animate(
        [{ strokeDashoffset: String(offset) }, { strokeDashoffset: "0" }],
        { duration: remaining, easing: "linear", fill: "forwards" },
      );
    }
  };
  document.addEventListener("visibilitychange", sync);
  sync();
  return () => {
    stopped = true;
    animation?.cancel();
    animation = null;
    document.removeEventListener("visibilitychange", sync);
  };
}
