import { test, expect } from "@playwright/test";
test("Classic preloads its coherent atlas and keeps the campaign material independent", async ({
  page,
}) => {
  const paths: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/assets/")) paths.push(r.url());
  });
  await page.goto("/");
  await page.locator("#board canvas").waitFor();
  await expect(page.locator("#app")).not.toHaveAttribute("aria-busy", "true");
  await expect(page.locator("html")).toHaveAttribute(
    "data-presentation",
    "classic",
  );
  expect(new Set(paths.filter((p) => p.includes("/classic-tiles/"))).size).toBe(
    18,
  );
  expect(paths.some((p) => p.includes("/tile-study/"))).toBe(false);
  paths.length = 0;
  await page.goto("/?mode=adventure");
  await expect(page.locator("html")).not.toHaveAttribute(
    "data-presentation",
    "classic",
  );
  await expect(page.locator(".adventure")).toBeVisible();
  expect(paths.some((p) => p.includes("/classic-tiles/"))).toBe(false);
});
