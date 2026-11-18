import { test, expect, type Page } from "@playwright/test";

type Mode = "classic" | "adventure";
async function boot(page: Page, mode: Mode, fault: string) {
  await page.addInitScript((fault) => {
    const NativeWorker = window.Worker;
    let used = false;
    const entries: any[] = [];
    (window as any).hintEntries = entries;
    window.Worker = class extends NativeWorker {
      private hint: boolean;
      private fault: string;
      private data: unknown;
      terminated = 0;
      constructor(url: string | URL, options?: WorkerOptions) {
        const hint = String(url).includes("hint.worker");
        const fail = hint && !used;
        if (hint) used = true;
        if (fail && fault === "construct")
          throw Error("Injected worker construction failure");
        super(url, options);
        this.hint = hint;
        this.fault = fail ? fault : fault === "hold" ? "hold" : "";
      }
      postMessage(data: unknown) {
        if (!this.hint) return super.postMessage(data);
        this.data = data;
        entries.push({
          worker: this,
          reply: this.onmessage,
          error: this.onerror,
        });
        if (this.fault === "send") throw Error("Injected send failure");
        if (this.fault === "crash") {
          setTimeout(() => this.dispatchEvent(new Event("error")), 10);
          return;
        }
        if (this.fault === "messageerror") {
          setTimeout(
            () => this.dispatchEvent(new MessageEvent("messageerror")),
            10,
          );
          return;
        }
        if (["timeout", "hold"].includes(this.fault)) return;
        super.postMessage(data);
      }
      sendNative() {
        super.postMessage(this.data);
      }
      terminate() {
        this.terminated++;
        super.terminate();
      }
    };
  }, fault);
  await page.goto(mode === "classic" ? "/" : "/?mode=adventure");
  if (mode === "classic") {
    await page.locator("#lesson-skip").click();
    await expect(page.locator("#lesson")).toBeHidden();
  } else {
    await page.waitForFunction(() => !!(window as any).__adventure);
    await page.locator('[data-level="cove-1"]').click();
    await expect(page.locator("#adv-play")).toBeVisible();
  }
}
const button = (mode: Mode) => (mode === "classic" ? "#hint" : "#adv-hint");
async function requestHint(page: Page, mode: Mode) {
  if (mode === "classic") {
    await page.locator("#pause").click();
    await page.locator("#menu-hint").click();
  } else await page.locator("#adv-hint").click();
}
const saved = (page: Page) =>
  page.evaluate(async () => {
    const { IndexedSave } = await import("/src/platform/save.ts");
    return (await new IndexedSave().load()).profile!;
  });
for (const mode of ["classic", "adventure"] as const) {
  for (const fault of [
    "timeout",
    "crash",
    "messageerror",
    "send",
    "construct",
  ]) {
    test(`${mode}: hint ${fault} keeps credits and permits a successful retry`, async ({
      page,
    }) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await boot(page, mode, fault);
      const before = await saved(page);
      await requestHint(page, mode);
      await expect(
        page.locator(mode === "classic" ? "#toast" : "#adv-status"),
      ).toContainText(
        mode === "classic" ? "Кредит сохранён" : "Можно повторить",
        { timeout: 10000 },
      );
      expect(await saved(page)).toEqual(before);
      await expect(page.locator(button(mode))).not.toHaveAttribute(
        "aria-busy",
        "true",
      );
      await requestHint(page, mode);
      await expect
        .poll(async () => {
          const p = await saved(page);
          return !!(mode === "classic" ? p.hint : p.campaign?.hint);
        })
        .toBe(true);
      const after = await saved(page);
      expect(after.freeHints).toBe(before.freeHints - 1);
      expect(after.game).toEqual(
        mode === "classic" ? { ...before.game, assisted: true } : before.game,
      );
      if (mode === "adventure")
        expect(after.campaign!.active).toEqual(before.campaign!.active);
      expect(errors).toEqual([]);
    });
  }
  test(`${mode}: cancelled hint callbacks cannot cancel or charge a newer request`, async ({
    page,
  }) => {
    await boot(page, mode, "hold");
    const before = await saved(page);
    await requestHint(page, mode);
    await expect
      .poll(() => page.evaluate(() => (window as any).hintEntries.length))
      .toBe(1);
    await page.locator(mode === "classic" ? "#pause" : "#adv-pause").click();
    await page.locator(mode === "classic" ? "#resume" : "#adv-dismiss").click();
    await requestHint(page, mode);
    await expect
      .poll(() => page.evaluate(() => (window as any).hintEntries.length))
      .toBe(2);
    await page.evaluate(() => {
      const [old] = (window as any).hintEntries;
      old.reply.call(old.worker, { data: { move: null } });
      old.error.call(old.worker, new Event("error"));
    });
    expect(await saved(page)).toEqual(before);
    expect(
      await page.evaluate(
        () => (window as any).hintEntries[1].worker.terminated,
      ),
    ).toBe(0);
    await page.evaluate(() =>
      (window as any).hintEntries[1].worker.sendNative(),
    );
    await expect
      .poll(async () => {
        const p = await saved(page);
        return !!(mode === "classic" ? p.hint : p.campaign?.hint);
      })
      .toBe(true);
    expect((await saved(page)).freeHints).toBe(before.freeHints - 1);
  });
}
