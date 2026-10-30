import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "e2e",
  // Recorded WebGL scenarios share software rendering on the CI runner.
  // Isolate them so GPU/video contention does not consume effect lifetimes.
  workers: process.env.CI ? 1 : undefined,
  timeout: 60000,
  use: { baseURL: "http://127.0.0.1:5173", headless: true },
  webServer: {
    command: "npm run dev -- --port 5173",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: !process.env.CI,
  },
  reporter: "list",
});
