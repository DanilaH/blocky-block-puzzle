import type { ProductAnalytics } from "./analytics";
import type { GameState } from "../core/rules";
import { Capacitor, registerPlugin } from "@capacitor/core";
import {
  applyReceipt,
  canInterstitial,
  emptyAds,
  finishAttempt,
  prepareReward,
  type RewardIntent,
} from "../core/monetization";
import { ProfileStore } from "./save";
import type { Profile } from "../core/profile";
import { DurableReceiptQueue } from "../vendor/mini-games-kit/durable-receipt-queue";
import {
  resolveNativeBannerPlacement,
  type NativeBannerPlacementInput,
} from "../vendor/mini-games-kit/native-banner-placement";
export interface Receipt {
  id: string;
  intentId: string;
}
export interface AdBridge {
  initialize(): Promise<{
    enabled: boolean;
    events?: { name: string; kind: string; intentId?: string }[];
  }>;
  status(): Promise<{ rewarded: boolean; interstitial: boolean }>;
  pending(): Promise<{ rewards: Receipt[] }>;
  acknowledge(p: { id: string }): Promise<void>;
  preload(): Promise<void>;
  show(p: {
    kind: "rewarded" | "interstitial";
    intentId?: string;
  }): Promise<{ status: string; shown?: boolean; rewards?: Receipt[] }>;
  geometry(p: { width: number; viewportWidth: number }): Promise<{
    geometry: Omit<NativeBannerPlacementInput, "slot" | "viewport">;
    epoch: number;
  }>;
  banner(p: {
    visible: boolean;
    epoch?: number;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  }): Promise<void>;
  addListener(
    name: string,
    fn: (data: any) => void,
  ): Promise<{ remove(): Promise<void> }>;
}
export function nativeAds(): AdBridge | null {
  return Capacitor.isNativePlatform()
    ? registerPlugin<AdBridge>("BlockyAds")
    : null;
}
export class AdsController {
  busy = false;
  enabled = false;
  private queue: DurableReceiptQueue<Receipt>;
  private active = false;
  private tick = performance.now();
  private elapsed = 0;
  private base: number;
  private listeners: { remove(): Promise<void> }[] = [];
  constructor(
    private store: ProfileStore,
    private bridge: AdBridge | null,
    private block: (v: boolean) => void,
    private changed: () => void,
    private problem: (s: string) => void,
    private analytics?: Pick<ProductAnalytics, "track">,
  ) {
    this.base = store.state.ads?.activeMs ?? 0;
    this.queue = new DurableReceiptQueue({
      commit: async (r) => {
        await store.waitIdle();
        if (store.state.ads?.receipts.includes(r.id)) return "already-applied";
        const intent = store.state.ads?.intents.find(
          (i) => i.id === r.intentId,
        );
        const firstGrant = intent?.status === "pending";
        if (!(await store.update((p) => applyReceipt(this.stamp(p), r))))
          throw Error("Save busy");
        if (firstGrant)
          this.analytics?.track(
            "reward_applied",
            {
              intentId: r.intentId,
              gameId: intent!.gameId,
              kind: intent!.kind,
            },
            `reward_applied:${r.intentId}`,
          );
        this.changed();
        return "applied";
      },
      acknowledge: async (id) => {
        await bridge!.acknowledge({ id });
      },
    });
  }
  setActive(active: boolean) {
    this.accumulate();
    this.active = active;
  }
  private accumulate() {
    const now = performance.now();
    if (this.active) this.elapsed += Math.max(0, now - this.tick);
    this.tick = now;
  }
  stamp(p: Profile): Profile {
    this.accumulate();
    return {
      ...p,
      ads: {
        ...(p.ads ?? emptyAds()),
        activeMs: Math.max(
          p.ads?.activeMs ?? 0,
          this.base + Math.floor(this.elapsed),
        ),
      },
    };
  }
  private async receive(r: Receipt) {
    try {
      await this.queue.deliver(r);
    } catch {
      this.problem(
        "Награда ожидает сохранения. Повторим при возвращении в игру.",
      );
    }
  }
  async recover() {
    if (!this.bridge) return;
    try {
      const { rewards } = await this.bridge.pending();
      for (const r of rewards ?? []) await this.receive(r);
    } catch {
      this.problem("Не удалось проверить ожидающую награду.");
    }
  }
  async init() {
    if (!this.bridge) return;
    try {
      this.listeners.push(
        await this.bridge.addListener("reward", (r) => void this.receive(r)),
      );
      this.listeners.push(
        await this.bridge.addListener("receiptError", () =>
          this.problem("Не удалось сохранить подтверждение награды."),
        ),
      );
      const event = (e: { name: string; kind: string; intentId?: string }) => {
        if (/^ad_[a-z_]+$/.test(e.name))
          this.analytics?.track(e.name, {
            format: e.kind,
            ...(e.intentId ? { intentId: e.intentId } : {}),
          });
      };
      this.listeners.push(await this.bridge.addListener("analytics", event));
      const initialized = await this.bridge.initialize();
      this.enabled = initialized.enabled;
      initialized.events?.forEach(event);
      await this.recover();
    } catch {
      this.enabled = false;
    }
  }
  async ready() {
    if (!this.bridge || !this.enabled) return false;
    try {
      // Native readiness is false while an unacknowledged receipt exists.
      // Retry its durable application before asking for another advertisement.
      await this.recover();
      return (await this.bridge.status()).rewarded;
    } catch {
      return false;
    }
  }
  preload() {
    void this.bridge?.preload().catch(() => {});
  }
  async rewarded(kind: RewardIntent["kind"]): Promise<string> {
    if (this.busy || !this.bridge || !this.enabled) return "unavailable";
    this.busy = true;
    this.block(true);
    this.analytics?.track("ad_opportunity", {
      format: "rewarded",
      kind,
      gameId: this.store.state.game.gameId,
    });
    try {
      if (!(await this.ready())) {
        this.analytics?.track("ad_unavailable", { format: "rewarded", kind });
        return "unavailable";
      }
      await this.recover();
      await this.store.waitIdle();
      const g = this.store.state.game;
      const prior =
        kind === "revive"
          ? this.store.state.ads?.intents.find(
              (i) =>
                i.kind === kind &&
                i.gameId === g.gameId &&
                i.revision === g.revision &&
                i.status === "pending",
            )
          : null;
      const id = prior?.id ?? crypto.randomUUID();
      if (
        !(await this.store.update((p) => {
          const current = this.stamp(p);
          return prior
            ? {
                ...current,
                revision: p.revision + 1,
                ads: {
                  ...current.ads!,
                  lastFullscreenMs: current.ads!.activeMs,
                },
              }
            : prepareReward(current, id, kind);
        }))
      )
        return "error";
      const result = await this.bridge.show({ kind: "rewarded", intentId: id });
      for (const r of result.rewards ?? []) await this.receive(r);
      return this.store.state.ads?.intents.find((i) => i.id === id)?.status !==
        "pending"
        ? "rewarded"
        : result.status;
    } catch {
      return "error";
    } finally {
      this.busy = false;
      this.block(false);
      this.changed();
    }
  }
  async finishGame(): Promise<boolean> {
    if (this.busy) return false;
    this.busy = true;
    this.block(true);
    try {
      await this.store.waitIdle();
      const original = this.store.state.game;
      if (original.status !== "over") return false;
      if (this.store.state.ads?.completed.includes(original.gameId))
        return true;
      let eligible = false;
      const saved = await this.store.update((current) => {
        const next = finishAttempt(this.stamp(current)),
          a = next.ads!;
        eligible = this.enabled && !!this.bridge && canInterstitial(next);
        return {
          ...next,
          revision: current.revision + 1,
          ads: {
            ...a,
            ...(eligible
              ? {
                  lastFullscreenMs: a.activeMs,
                  interstitials: [
                    ...a.interstitials.filter((t) => a.activeMs - t < 3600000),
                    a.activeMs,
                  ],
                }
              : {}),
          },
        };
      });
      if (!saved) return false;
      if (eligible) {
        this.analytics?.track("ad_opportunity", {
          format: "interstitial",
          gameId: original.gameId,
        });
        try {
          if ((await this.bridge!.status()).interstitial)
            await this.bridge!.show({ kind: "interstitial" });
        } catch {
          /* The completed decision is durable; no retry on reload. */
        }
      }
      return true;
    } finally {
      this.busy = false;
      this.block(false);
    }
  }
  async betweenGames(nextGame: GameState): Promise<boolean> {
    if (this.busy) return false;
    this.busy = true;
    this.block(true);
    const original = this.store.state.game;
    try {
      await this.store.waitIdle();
      const changed = await this.store.update((current) => {
        const next = finishAttempt(this.stamp(current)),
          a = next.ads!;
        const intents = a.intents.map((i) =>
          original.status === "over" &&
          i.gameId === original.gameId &&
          i.kind === "revive" &&
          i.status === "applied" &&
          i.plan !== undefined &&
          original.moves === i.plan.game.moves &&
          current.game.moves === original.moves
            ? { ...i, status: "available" as const }
            : i,
        );
        return {
          ...next,
          revision: current.revision + 1,
          game: nextGame,
          tutorialStep: 4,
          hint: null,
          ads: {
            ...a,
            intents,
          },
        };
      });
      if (!changed) return false;
      return true;
    } finally {
      this.busy = false;
      this.block(false);
    }
  }
  async dispose() {
    for (const l of this.listeners) await l.remove();
  }
}
export function watchBanner(
  bridge: AdBridge | null,
  slot: HTMLElement,
  isVisible: () => boolean,
) {
  let disposed = false,
    sequence = 0,
    timer: ReturnType<typeof setTimeout> | undefined;
  let lastKey = "";
  let lastPlacementAt = -Infinity;
  const update = async () => {
    const seq = ++sequence;
    if (!bridge) return;
    try {
      if (!isVisible()) {
        if (lastKey === "hidden") return;
        lastKey = "hidden";
        await bridge.banner({ visible: false });
        return;
      }
      const b = slot.getBoundingClientRect(),
        viewport = { width: innerWidth, height: innerHeight };
      const key = [
        b.x,
        b.y,
        b.width,
        b.height,
        viewport.width,
        viewport.height,
      ].join(":");
      // Native load failure clears the banner without changing its geometry.
      // Preserve its existing 60-second retry opportunity on a later render.
      if (key === lastKey && performance.now() - lastPlacementAt < 60000)
        return;
      const { geometry, epoch } = await bridge.geometry({
        width: b.width,
        viewportWidth: viewport.width,
      });
      if (disposed || seq !== sequence || !isVisible()) return;
      const result = resolveNativeBannerPlacement({
        ...geometry,
        slot: { x: b.x, y: b.y, width: b.width, height: b.height },
        viewport,
      });
      if (result.kind === "reserve") {
        await bridge.banner({ visible: false });
        document.documentElement.style.setProperty(
          "--ad-height",
          `${result.heightCss}px`,
        );
        return;
      }
      if (result.kind === "hidden") {
        await bridge.banner({ visible: false });
        return;
      }
      await bridge.banner({ visible: true, epoch, ...result.rect });
      if (!disposed && seq === sequence) {
        lastKey = key;
        lastPlacementAt = performance.now();
      }
    } catch {
      lastKey = "";
      await bridge?.banner({ visible: false }).catch(() => {});
    }
  };
  const schedule = () => {
    sequence++;
    clearTimeout(timer);
    if (!disposed) timer = setTimeout(() => void update(), 40);
  };
  const observer = new ResizeObserver(schedule);
  observer.observe(slot);
  window.addEventListener("resize", schedule);
  document.addEventListener("visibilitychange", schedule);
  schedule();
  return {
    update: schedule,
    invalidate: () => {
      lastKey = "";
      schedule();
    },
    dispose: () => {
      disposed = true;
      sequence++;
      clearTimeout(timer);
      observer.disconnect();
      window.removeEventListener("resize", schedule);
      document.removeEventListener("visibilitychange", schedule);
      void bridge?.banner({ visible: false });
    },
  };
}
