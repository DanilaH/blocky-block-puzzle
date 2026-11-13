import { recoveryRhythm } from "./rhythm";
import { SHAPES, hasMove, type Move, type GameState } from "./rules";
import type { Profile } from "./profile";
import { WorkBudget, catalog, canPlace, proveIds, toRows } from "./director-search";
export interface ReviveSelection {
  version: 2;
  x: number;
  y: number;
  result: "baseline-found" | "alternative-found" | "baseline-unknown" | "no-proven-alternative";
  checks: number;
  witness: Move[];
}
export function validReviveSelection(s: ReviveSelection | undefined): boolean {
  return !!s && s.version === 2 && Number.isInteger(s.x) && s.x >= 0 && s.x <= 5 &&
    Number.isInteger(s.y) && s.y >= 0 && s.y <= 5 && Number.isInteger(s.checks) &&
    s.checks >= 0 && s.checks <= 24000 && ["baseline-found", "alternative-found", "baseline-unknown", "no-proven-alternative"].includes(s.result) &&
    Array.isArray(s.witness) && s.witness.length <= 3 && s.witness.every(m =>
      Number.isInteger(m.slot) && m.slot >= 0 && m.slot < 3 && Number.isInteger(m.x) && m.x >= 0 && m.x < 8 && Number.isInteger(m.y) && m.y >= 0 && m.y < 8);
}
export interface RevivePlan {
  selection?: ReviveSelection;
  x: number;
  y: number;
  cells: number[];
  game: GameState;
}
export interface RewardIntent {
  id: string;
  kind: "hints" | "revive";
  gameId: string;
  revision: number;
  snapshot?: GameState;
  compact?: true;
  plan?: RevivePlan;
  context?: Record<string,string|number|boolean>;
  status: "pending" | "applied" | "available" | "claimed";
}
export interface AdsState {
  ledgerVersion?: 2;
  closedEpisodes?: string[];
  eligibility?: {key:string;reasons:string[];ready:boolean|null;sdkAvailable?:boolean;requestState?:string;result:string}[];
  activeMs: number;
  lastFullscreenMs: number;
  interstitials: number[];
  completed: string[];
  intents: RewardIntent[];
  receipts: string[];
}
export const emptyAds = (): AdsState => ({
  activeMs: 0,
  lastFullscreenMs: 0,
  interstitials: [],
  completed: [],
  intents: [],
  receipts: [],
});
const reviveAllowed = (g: GameState) =>
  g.status === "over" && !g.reviveUsed && !g.reviveOffer?.expired;
function reviveEffect(g: GameState, x: number, y: number, selection?: ReviveSelection): RevivePlan {
  const board = [...g.board], cells: number[] = [];
  for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) {
    const i = (y + dy) * 8 + x + dx;
    if (board[i]) cells.push(i);
    board[i] = 0;
  }
  return { x, y, cells, ...(selection ? { selection } : {}), game: {
    ...structuredClone(g), board, revision: g.revision + 1,
    status: "playing", reviveUsed: true,
          ...(g.dealerVersion === "flow-v3"
            ? { rhythm: recoveryRhythm() }
            : g.dealerVersion === "flow-v4" || g.dealerVersion==='director-v1' || (g.dealerVersion==='director-v2'||g.dealerVersion==='composition-v1') || g.dealerVersion==='director-v3' || g.dealerVersion==='director-v4' || (g.dealerVersion==='director-v5'||g.dealerVersion==='director-v6')
              ? { rhythm: { ...g.rhythm!, ...recoveryRhythm() } }
              : {}),
    streak: 0, streakMisses: 0,
  }};
}
/** One shared 24k work ceiling, including all baseline placement tests and proofs.
 * proofBudget=0 is the supported diagnostic fallback, never an impossibility verdict. */
export function revivePlan(g: GameState, proofBudget = 16000): RevivePlan | null {
  if (!reviveAllowed(g)) return null;
  const frozen = g.reviveOffer?.selection;
  if (frozen) return reviveEffect(g, frozen.x, frozen.y, frozen);
  const meter = new WorkBudget(24000);
  meter.ceiling = meter.limit;
  const zones: (RevivePlan & { moves: number })[] = [];
  for (let y = 0; y <= 5; y++) for (let x = 0; x <= 5; x++) {
    const plan = reviveEffect(g, x, y), rows = toRows(plan.game.board);
    meter.spend(); // bounded board-copy/clear/ranking operation
    let moves = 0;
    for (const slot of g.tray) if (!slot.used) {
      const id = SHAPES.findIndex((s) => s.id === slot.shapeId);
      for (const op of catalog()[id]!) if (canPlace(rows, op, meter)) moves++;
    }
    if (moves) zones.push({ ...plan, moves });
  }
  zones.sort((a, b) => b.moves - a.moves || b.cells.length - a.cells.length || a.y - b.y || a.x - b.x);
  const baseline = zones[0];
  if (!baseline) return null;
  meter.ceiling = Math.min(meter.limit, meter.used + (Number.isFinite(proofBudget) ? Math.floor(Math.max(0, Math.min(16000, proofBudget))) : 0));
  const remaining = g.tray.map((s, slot) => ({ s, slot })).filter(({ s }) => !s.used);
  const ids = remaining.map(({ s }) => SHAPES.findIndex((piece) => piece.id === s.shapeId));
  let unknown = false;
  for (let index = 0; index < zones.length; index++) {
    const zone = zones[index]!, proof = proveIds(toRows(zone.game.board), ids, meter);
    unknown ||= proof.status === "unknown";
    if (proof.path) {
      const unused = [...remaining];
      const witness = proof.path.map((op) => {
        const at = unused.findIndex(({ s }) => s.shapeId === SHAPES[op.shape]!.id);
        const { slot } = unused.splice(at, 1)[0]!;
        return { slot: slot!, x: op.x, y: op.y };
      });
      const selection: ReviveSelection = { version: 2, x: zone.x, y: zone.y,
        result: index === 0 ? "baseline-found" : "alternative-found", checks: meter.used, witness };
      return reviveEffect(g, zone.x, zone.y, selection);
    }
    if (meter.used >= meter.ceiling) break;
  }
  const selection: ReviveSelection = { version: 2, x: baseline.x, y: baseline.y,
    result: unknown ? "baseline-unknown" : "no-proven-alternative", checks: meter.used, witness: [] };
  return reviveEffect(g, baseline.x, baseline.y, selection);
}
// Validate a persisted prepared effect without re-running the best-zone search on every save.
export function validRevivePlan(
  g: GameState,
  plan: RevivePlan | undefined,
): boolean {
  if (
    !plan ||
    (plan.selection!==undefined&&(!validReviveSelection(plan.selection)||plan.selection.x!==plan.x||plan.selection.y!==plan.y)) ||
    g.status !== "over" ||
    g.reviveUsed ||
    !Number.isInteger(plan.x) ||
    !Number.isInteger(plan.y) ||
    plan.x < 0 ||
    plan.x > 5 ||
    plan.y < 0 ||
    plan.y > 5
  )
    return false;
  const board = g.board.slice(),
    cells: number[] = [];
  for (let y = plan.y; y < plan.y + 3; y++)
    for (let x = plan.x; x < plan.x + 3; x++) {
      const i = y * 8 + x;
      if (board[i]) cells.push(i);
      board[i] = 0;
    }
  const expected = {
    ...g,
    board,
    revision: g.revision + 1,
    status: "playing",
    reviveUsed: true,
    ...(g.dealerVersion === "flow-v3"
      ? { rhythm: recoveryRhythm() }
      : g.dealerVersion === "flow-v4" || g.dealerVersion==='director-v1' || (g.dealerVersion==='director-v2'||g.dealerVersion==='composition-v1') || g.dealerVersion==='director-v3' || g.dealerVersion==='director-v4' || (g.dealerVersion==='director-v5'||g.dealerVersion==='director-v6')
        ? { rhythm: { ...g.rhythm!, ...recoveryRhythm() } }
        : {}),
    streak: 0,
    streakMisses: 0,
  };
  return (
    JSON.stringify(cells) === JSON.stringify(plan.cells) &&
    JSON.stringify(expected) === JSON.stringify(plan.game) &&
    hasMove(board, g.tray)
  );
}
export function prepareReward(
  p: Profile,
  id: string,
  kind: RewardIntent["kind"],
): Profile {
  const a = p.ads ?? emptyAds();
  if (a.intents.some((i) => i.id === id)) throw Error("Duplicate intent");
  const plan = kind === "revive" ? revivePlan(p.game) : null;
  if (
    kind === "revive" &&
    (!plan ||
      (p.game.reviveOffer && !p.game.reviveOffer.accepted) ||
      a.intents.some(
        (i) =>
          i.kind === "revive" &&
          i.gameId === p.game.gameId &&
          ["available", "applied", "claimed"].includes(i.status),
      ))
  )
    throw Error("Revive unavailable");
  const intent: RewardIntent = {
    id,
    kind,
    gameId: p.game.gameId,
    revision: p.game.revision,
    snapshot: structuredClone(p.game),
    status: "pending",
    ...(plan ? { plan } : {}),
  };
  return {
    ...p,
    revision: p.revision + 1,
    ads: {
      ...a,
      lastFullscreenMs: a.activeMs,
      intents: [...a.intents, intent],
    },
  };
}
export function applyReceipt(
  p: Profile,
  r: { id: string; intentId: string },
): Profile {
  const a = p.ads ?? emptyAds();
  if (a.receipts.includes(r.id)) return p;
  const intent = a.intents.find((i) => i.id === r.intentId);
  // Unknown receipt must remain native-side, never acknowledge an ungranted reward.
  if (!intent) throw Error("Unknown reward intent");
  let game = p.game,
    earnedHints = p.earnedHints,
    status = intent.status;
  if (status === "pending") {
    if (intent.kind === "hints") {
      earnedHints += 3;
      status = "applied";
    } else {
      if (
        !intent.plan ||
        !hasMove(intent.plan.game.board, intent.plan.game.tray)
      )
        throw Error("Invalid revive");
      if (game.gameId === intent.gameId && game.revision === intent.revision) {
        game = structuredClone(intent.plan.game);
        status = "applied";
      } else status = "available";
    }
  }
  return {
    ...p,
    revision: p.revision + 1,
    game,
    earnedHints,
    hint: game === p.game ? p.hint : null,
    ads: {
      ...a,
      lastFullscreenMs: a.activeMs,
      receipts: [...a.receipts, r.id],
      intents: a.intents.map((i) =>
        i.id === intent.id ? { ...i, status } : i,
      ),
    },
  };
}
export function claimRevive(p: Profile, id: string): Profile {
  const a = p.ads ?? emptyAds(),
    i = a.intents.find(
      (i) => i.id === id && i.status === "available" && i.plan,
    );
  if (!i?.plan) throw Error("No pending revive");
  return {
    ...p,
    revision: p.revision + 1,
    game: structuredClone(i.plan.game),
    hint: null,
    ads: {
      ...a,
      intents: a.intents.map((v) =>
        v.id === id ? { ...v, status: "claimed" } : v,
      ),
    },
  };
}
export function finishAttempt(p: Profile): Profile {
  const a = p.ads ?? emptyAds(), key = `${p.game.gameId}:${p.metrics?.episode??1}`;
  if (p.game.status !== "over" || a.closedEpisodes?.includes(key)) return p;
  return { ...p, revision:p.revision+1, ads:{...a,
    completed:a.completed.includes(p.game.gameId)?a.completed:[...a.completed,p.game.gameId],
    closedEpisodes:[...(a.closedEpisodes??[]),key],
  }};
}
export function interstitialReasons(p:Profile, state:{enabled:boolean;busy:boolean;ready:boolean|null;statusError?:boolean}) {
  const a=p.ads??emptyAds(), reasons:string[]=[];
  if (p.tutorialStep!==4) reasons.push("tutorial");
  if (p.game.status!=="over") reasons.push("not_final");
  if (a.completed.length<2) reasons.push("too_few_finished_runs");
  if (a.activeMs-a.lastFullscreenMs<180000) reasons.push("cooldown");
  if (a.interstitials.filter(t=>a.activeMs-t<3600000).length>=3) reasons.push("hourly_cap");
  if (!state.enabled) reasons.push("unavailable");
  if (state.busy) reasons.push("busy");
  if (state.statusError) reasons.push("status_error");
  if (state.ready===false) reasons.push("not_ready");
  return reasons;
}
export function canInterstitial(p: Profile, _now?: number): boolean {
  const a = p.ads ?? emptyAds();
  return (
    p.tutorialStep === 4 &&
    p.game.status === "over" &&
    a.completed.length >= 2 &&
    a.activeMs - a.lastFullscreenMs >= 180000 &&
    a.interstitials.filter((t) => a.activeMs - t < 3600000).length < 3
  );
}

// Keep permanent small dedup markers. No TTL: native callbacks can arrive late.
// Applied revives retain their plan until the player has actually continued;
// betweenGames can still restore an unconsumed, already-applied revive right.
export function compactRewards(p: Profile, previousGame?: GameState): Profile {
  const a = p.ads;
  if (!a) return p;
  let changed = a.ledgerVersion !== 2;
  const intents = a.intents.map((i): RewardIntent => {
    if (
      i.kind === "revive" &&
      i.status === "applied" &&
      i.plan &&
      previousGame?.gameId === i.gameId &&
      p.game.gameId !== i.gameId &&
      previousGame.moves === i.plan.game.moves
    ) {
      changed = true;
      return { ...i, status: "available" };
    }
    const terminal =
      (i.kind === "hints" && i.status === "applied") ||
      (i.kind === "revive" &&
        (i.status === "claimed" ||
          (i.status === "applied" &&
            i.plan !== undefined &&
            ((p.game.gameId === i.gameId && p.game.moves > i.plan.game.moves) ||
              (previousGame?.gameId === i.gameId &&
                previousGame.moves > i.plan.game.moves)))));
    if (i.compact || !terminal) return i;
    changed = true;
    const { snapshot: _snapshot, plan: _plan, ...marker } = i;
    return { ...marker, compact: true };
  });
  return changed ? { ...p, ads: { ...a, ledgerVersion: 2, intents } } : p;
}
