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
