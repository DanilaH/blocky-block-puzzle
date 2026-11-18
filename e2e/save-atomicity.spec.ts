import { test, expect } from "@playwright/test";

for (const failure of ["quota", "abort"] as const) {
  test(`ordinary save rolls back both records on ${failure} without an uncaught error`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/");
    await expect(page.locator("#app")).not.toHaveAttribute("aria-busy", "true");
    const result = await page.evaluate(async (failure) => {
      const { IndexedSave } = await import("/src/platform/save.ts");
      const save = new IndexedSave();
      const original = (await save.load()).profile!;
      const accepted = {
        ...original,
        revision: original.revision + 1,
        earnedHints: 4,
      };
      await save.write(accepted);
      async function records() {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const r = indexedDB.open("blocky-classic", 1);
          r.onsuccess = () => resolve(r.result);
          r.onerror = () => reject(r.error);
        });
        return new Promise<Record<string, unknown>>((resolve, reject) => {
          const tx = db.transaction("save"),
            s = tx.objectStore("save"),
            a = s.get("current"),
            b = s.get("backup");
          tx.oncomplete = () => {
            db.close();
            resolve({ current: a.result, backup: b.result });
          };
          tx.onerror = () => reject(tx.error);
        });
      }
      const before = await records();
      const put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (value, key) {
        if (key === "current" && failure === "quota")
          throw new DOMException(
            "Injected quota failure",
            "QuotaExceededError",
          );
        const request = put.call(this, value, key);
        if (key === "current" && failure === "abort") this.transaction.abort();
        return request;
      };
      let rejected = false;
      try {
        await save.write({
          ...accepted,
          revision: accepted.revision + 1,
          earnedHints: 7,
        });
      } catch {
        rejected = true;
      } finally {
        IDBObjectStore.prototype.put = put;
      }
      const after = await records();
      await save.write({
        ...accepted,
        revision: accepted.revision + 1,
        earnedHints: 7,
      });
      return {
        rejected,
        before,
        after,
        retry: (await save.load()).profile!.earnedHints,
      };
    }, failure);
    expect(result.rejected).toBe(true);
    expect(result.after).toEqual(result.before);
    expect(result.retry).toBe(7);
    expect(errors).toEqual([]);
  });
}

test("two writers at the same revision cannot overwrite the accepted save", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("#app")).not.toHaveAttribute("aria-busy", "true");
  const r = await page.evaluate(async () => {
    const { IndexedSave } = await import("/src/platform/save.ts");
    const a = new IndexedSave(),
      b = new IndexedSave();
    const before = (await a.load()).profile!;
    const first = { ...before, revision: before.revision + 1, earnedHints: 3 };
    const stale = { ...before, revision: before.revision + 1, earnedHints: 6 };
    await a.write(first);
    let rejected = false;
    try {
      await b.write(stale);
    } catch (e) {
      rejected = e instanceof Error && e.message === "Save conflict";
    }
    return { rejected, stored: (await b.load()).profile, first };
  });
  expect(r.rejected).toBe(true);
  expect(r.stored).toEqual(r.first);
});

test("closing a page with a live transaction leaves a complete save pair", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await expect(page.locator("#app")).not.toHaveAttribute("aria-busy", "true");
  const before = await page.evaluate(async () => {
    const { IndexedSave } = await import("/src/platform/save.ts");
    const a = new IndexedSave();
    const p = (await a.load()).profile!;
    await a.write({ ...p, revision: p.revision + 1, earnedHints: 4 });
    return (await a.load()).profile!;
  });
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open("blocky-classic", 1);
      r.onsuccess = () => resolve(r.result);
    });
    const tx = db.transaction("save", "readwrite"),
      s = tx.objectStore("save"),
      r = s.get("current");
    r.onsuccess = () => {
      const p = r.result;
      s.put(p, "backup");
      s.put({ ...p, revision: p.revision + 1, earnedHints: 7 }, "current");
      // Keep the transaction live until this browsing context is terminated.
      const keep = () => {
        s.get("current").onsuccess = keep;
      };
      keep();
      (window as any).transactionOpen = true;
    };
  });
  await page.waitForFunction(() => (window as any).transactionOpen);
  await page.close();
  const reopened = await context.newPage();
  await reopened.goto("/");
  await expect(reopened.locator("#app")).not.toHaveAttribute(
    "aria-busy",
    "true",
  );
  const after = await reopened.evaluate(async () => {
    const { IndexedSave } = await import("/src/platform/save.ts");
    return (await new IndexedSave().load()).profile!;
  });
  expect(after).toEqual(before);
});
