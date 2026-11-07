import { Capacitor, registerPlugin } from "@capacitor/core";
import { APP_VERSION } from "../app-version";
export async function sharePlayRecord(data: unknown) {
  const json = JSON.stringify(data);
  if (new TextEncoder().encode(json).length > 900000)
    throw Error("Capture exceeds export limit");
  if (Capacitor.isNativePlatform()) {
    await registerPlugin<{
      share(options: { json: string; kind: string }): Promise<void>;
    }>("BlockyDiagnostics").share({ json, kind: "play" });
  } else {
    const url = URL.createObjectURL(
      new Blob([json], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `blocky-play-${APP_VERSION}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
