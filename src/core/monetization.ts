import { recoveryRhythm } from "./rhythm";
import { hasMove, placements, shapeById, type GameState } from "./rules";
import type { Profile } from "./profile";
export interface RevivePlan {
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
  status: "pending" | "applied" | "available" | "claimed";
}
export interface AdsState {
  ledgerVersion?: 2;
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
export function revivePlan(g: GameState): RevivePlan | null {
  if (g.status !== "over" || g.reviveUsed || g.reviveOffer?.expired)
    return null;
  let best: RevivePlan | null = null,
    bestMoves = -1,
    bestCells = -1;
  for (let y = 0; y <= 5; y++)
    for (let x = 0; x <= 5; x++) {
      const board = g.board.slice(),
        cells: number[] = [];
      for (let dy = 0; dy < 3; dy++)
        for (let dx = 0; dx < 3; dx++) {
          const i = (y + dy) * 8 + x + dx;
          if (board[i]) cells.push(i);
          board[i] = 0;
        }
      const moves = g.tray.reduce(
        (n, s) =>
          n + (s.used ? 0 : placements(board, shapeById(s.shapeId)).length),
        0,
      );
      if (
        !moves ||
        moves < bestMoves ||
        (moves === bestMoves && cells.length <= bestCells)
      )
        continue;
      bestMoves = moves;
      bestCells = cells.length;
      best = {
        x,
        y,
        cells,
        game: {
          ...structuredClone(g),
          board,
          revision: g.revision + 1,
          status: "playing",
          reviveUsed: true,
          ...(g.dealerVersion === "flow-v3"
            ? { rhythm: recoveryRhythm() }
            : g.dealerVersion === "flow-v4" || g.dealerVersion==='director-v1' || g.dealerVersion==='director-v2'
              ? { rhythm: { ...g.rhythm!, ...recoveryRhythm() } }
              : {}),
          streak: 0,
          streakMisses: 0,
        },
      };
    }
  return best;
}
// Validate a persisted prepared effect without re-running the best-zone search on every save.
export function validRevivePlan(
  g: GameState,
  plan: RevivePlan | undefined,
): boolean {
  if (
    !plan ||
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
      : g.dealerVersion === "flow-v4" || g.dealerVersion==='director-v1' || g.dealerVersion==='director-v2'
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
  const a = p.ads ?? emptyAds();
  if (p.game.status !== "over" || a.completed.includes(p.game.gameId)) return p;
  return {
    ...p,
    revision: p.revision + 1,
    ads: { ...a, completed: [...a.completed, p.game.gameId] },
  };
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
