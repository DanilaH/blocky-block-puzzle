import { Capacitor, registerPlugin } from "@capacitor/core";
export function nativeHaptics() {
  return Capacitor.isNativePlatform()
    ? registerPlugin<{
        setActive(p: { active: boolean }): Promise<void>;
        pulse(p: { kind: string; level: number }): Promise<void>;
      }>("BlockyHaptics")
    : null;
}
const bridge = nativeHaptics();
export class GameHaptics {
  private active = false;
  setActive(value: boolean) {
    if (value === this.active) return;
    this.active = value;
    void bridge?.setActive({ active: value }).catch(() => {});
  }
  pulse(kind: string, level = 1) {
    if (this.active) void bridge?.pulse({ kind, level }).catch(() => {});
  }
}

/** Physical reward tiers, bounded independently of an unbounded score multiplier. */
export function clearHapticLevel(lines: number, streak: number) {
  return Math.max(
    lines >= 4 ? 8 : lines >= 3 ? 6 : lines >= 2 ? 4 : 1,
    streak >= 16 ? 8 : streak >= 10 ? 6 : streak >= 6 ? 4 : streak >= 2 ? 2 : 1,
  );
}
