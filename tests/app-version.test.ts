import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { APP_VERSION } from "../src/app-version";
import { ProductAnalytics } from "../src/platform/analytics";
import { PlayCapture } from "../src/platform/play-capture";

it("diagnostic and product events identify the version actually packaged for Android", () => {
  const gradle = readFileSync(
    new URL("../android/app/build.gradle", import.meta.url),
    "utf8",
  );
  expect(gradle.match(/versionName\s+"([^"]+)"/)?.[1]).toBe(APP_VERSION);
  const analytics = new ProductAnalytics(null);
  analytics.track("diagnostic-version-check");
  expect(analytics.snapshot()[0]!.params.appVersion).toBe(APP_VERSION);
  expect(new PlayCapture().snapshot().appVersion).toBe(APP_VERSION);
  analytics.dispose();
});
