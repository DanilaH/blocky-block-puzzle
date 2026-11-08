import { test, expect } from "@playwright/test";
for (const mode of ["cancel", "complete", "mismatch"])
  test(`native export never attaches a stale trace: ${mode}`, async ({
    page,
  }) => {
    await page.addInitScript(
      ({ mode }) => {
        (window as any).__nativeCalls = [];
        (window as any).__testApp = {
          addListener: async () => ({ remove: async () => {} }),
        };
        (window as any).__traceBridge = {
          reset: async () => {
            (window as any).__nativeCalls.push("reset");
            return { ready: false, error: "not-started" };
          },
          setScreenOn: async ({ enabled }: { enabled: boolean }) => {
            (window as any).__nativeCalls.push(enabled ? "screen-on" : "screen-off");
          },
          start: async () => {
            (window as any).__nativeCalls.push("start");
            return { ready: false, recording: true, captureId: "fresh" };
          },
          stop: async () => {
            (window as any).__nativeCalls.push("stop");
            return {
              ready: true,
              captureId: mode === "complete" ? "fresh" : "old",
            };
          },
          share: async (p: any) => {
            (window as any).__shared = p;
          },
        };
      },
      { mode },
    );
    await page.route("**/src/diagnostics/phone-clear.ts", async (route) => {
      const response = await route.fetch(),
        source = await response.text();
      const body = source
        .replace(
          /const native = Capacitor\.isNativePlatform\(\)[\s\S]*?: null;/,
          "const native = window.__traceBridge;",
        )
        .replaceAll("App.addListener(", "window.__testApp.addListener(");
      if (body === source) throw Error("Missing bridge test transform");
      await route.fulfill({ response, body });
    });
    await page.goto("/?clearTrace=1&test=fast");
    await expect(page.locator("#phone-clear-start")).toBeEnabled();
    await page.locator("#phone-clear-start").click();
    if (mode === "cancel")
      await page.evaluate(() => {
        Object.defineProperty(document, "hidden", {
          configurable: true,
          value: true,
        });
        document.dispatchEvent(new Event("visibilitychange"));
      });
    await expect(page.locator("#phone-clear-export")).toBeEnabled();
    await page.locator("#phone-clear-export").click();
    const result = await page.evaluate(() => (window as any).__shared),
      r = JSON.parse(result.json);
    expect(result.includeTrace).toBe(mode === "complete");
    expect(r.trace.ready).toBe(mode === "complete");
    expect(r.screenAwake).toBe(true);
    const calls = await page.evaluate(() => (window as any).__nativeCalls);
    expect(calls.filter((x: string) => x.startsWith("screen-"))).toEqual(["screen-on", "screen-off"]);
    expect((await page.evaluate(() => (window as any).__nativeCalls))[0]).toBe(
      "reset",
    );
    if (mode !== "complete")
      expect(r.trace.error).toBe("not-captured-this-run");
  });
