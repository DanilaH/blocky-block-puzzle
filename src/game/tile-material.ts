import { type TileMaterial } from "./tile-study-config";

/** Two opaque overlays above plastic. Shared timing for newly created DOM tiles. */
export class TileMaterialBlend {
  material: TileMaterial = "plastic";
  from = [0, 0];
  target = [0, 0];
  started = 0;
  duration = 0;
  sample(now: number) {
    const t = this.duration
      ? Math.min(1, Math.max(0, (now - this.started) / this.duration))
      : 1;
    return this.from.map((v, i) => v + (this.target[i]! - v) * t);
  }
  set(material: TileMaterial, now: number, duration: number) {
    if (material === this.material) return false;
    this.from = this.sample(now);
    this.material = material;
    this.target = [
      material === "plastic" ? 0 : 1,
      material === "chrome" ? 1 : 0,
    ];
    this.started = now;
    this.duration = duration;
    return true;
  }
}

/** No animation loop or layout reads. New tray/drag tiles join the same timeline. */
export class TileMaterialDOM {
  private blend = new TileMaterialBlend();
  private applied = new WeakMap<Element, number>();
  private revision = 0;
  set(material: TileMaterial, duration: number) {
    if (this.blend.set(material, performance.now(), duration)) this.revision++;
    document.documentElement.dataset.tileMaterial = material;
    this.sync(document);
  }
  sync(root: ParentNode) {
    const { from, target, started, duration } = this.blend;
    const elapsed = Math.max(0, performance.now() - started);
    root
      .querySelectorAll<HTMLElement>(".tile-enamel, .tile-chrome")
      .forEach((el) => {
        if (this.applied.get(el) === this.revision) return;
        this.applied.set(el, this.revision);
        const i = el.classList.contains("tile-chrome") ? 1 : 0;
        el.getAnimations().forEach((a) => a.cancel());
        el.style.opacity = String(target[i]);
        if (elapsed < duration && from[i] !== target[i]) {
          const animation = el.animate(
            [{ opacity: from[i] }, { opacity: target[i] }],
            { duration, easing: "linear" },
          );
          animation.startTime = Number(document.timeline.currentTime) - elapsed;
        }
      });
  }
}
