type Animate = (
  target: Element,
  frames: Keyframe[],
  duration: number,
) => Animation | undefined;
type Shadow = { value: string; priority: string };
const owners = new WeakMap<HTMLElement, { shadow: Shadow }>();
export type ScoreGlowMode = "legacy" | "filter";
let diagnosticMode: ScoreGlowMode | null = null;

export function setDiagnosticScoreGlow(mode: ScoreGlowMode | null) {
  diagnosticMode = mode;
  if (mode) document.documentElement.dataset.scoreFeedback = mode;
  else delete document.documentElement.dataset.scoreFeedback;
}

export function presentScoreGlow(target: HTMLElement, animate: Animate) {
  const composited =
    document.documentElement.dataset.presentation === "classic" &&
    diagnosticMode === "filter" &&
    CSS.supports("filter", "drop-shadow(0 0 9px #8edaff)");
  if (!composited)
    return animate(
      target,
      [
        { textShadow: "0 0 18px #8edaff" },
        { textShadow: "0 2px 2px #00000026" },
      ],
      600,
    );

  const previous = owners.get(target);
  const owner = {
    shadow:
      previous && target.style.getPropertyValue("text-shadow") === "none"
        ? previous.shadow
        : {
            value: target.style.getPropertyValue("text-shadow"),
            priority: target.style.getPropertyPriority("text-shadow"),
          },
  };
  owners.set(target, owner);
  target.style.setProperty("text-shadow", "none", owner.shadow.priority);
  const cleanup = () => {
    if (owners.get(target) !== owner) return;
    if (target.style.getPropertyValue("text-shadow") === "none") {
      if (owner.shadow.value)
        target.style.setProperty(
          "text-shadow",
          owner.shadow.value,
          owner.shadow.priority,
        );
      else target.style.removeProperty("text-shadow");
    }
    owners.delete(target);
  };
  try {
    const effect = animate(
      target,
      [
        { filter: "drop-shadow(0 0 9px #8edaff)" },
        { filter: "drop-shadow(0 2px 1px #00000026)" },
      ],
      600,
    );
    if (effect) {
      effect.addEventListener("finish", cleanup, { once: true });
      effect.addEventListener("cancel", cleanup, { once: true });
    } else cleanup();
    return effect;
  } catch (error) {
    cleanup();
    throw error;
  }
}
