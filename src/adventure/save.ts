import {
  canPlace,
  moves,
  commitAttempt,
  emptyCampaign,
  startAttempt,
  step,
  type Campaign,
  type CampaignHint,
} from "./core";
import { LEVELS, levelFor } from "./levels";
import { dayKey, type Profile } from "../core/profile";
import type { Move } from "../core/rules";
export function beginLevel(
  p: Profile,
  id: string,
  attemptId: string,
): Profile | null {
  const c = p.campaign ?? emptyCampaign(),
    index = LEVELS.findIndex((l) => l.id === id);
  if (index < 0 || (index > 0 && !c.completed.includes(LEVELS[index - 1]!.id)))
    return null;
  return {
    ...p,
    revision: p.revision + 1,
    campaign: {
      ...c,
      active: startAttempt(LEVELS[index]!, attemptId),
      hint: null,
    },
  };
}
export function acceptMove(
  p: Profile,
  id: string,
  revision: number,
  m: Move,
): Profile | null {
  const c = p.campaign,
    a = c?.active;
  if (!c || !a || a.id !== id || a.revision !== revision) return null;
  const l = levelFor(a.levelId, a.levelVersion),
    r = step(l, a, m);
  if (!r) return null;
  return {
    ...p,
    revision: p.revision + 1,
    campaign: commitAttempt(c, l, r.state),
  };
}
export function acceptHint(
  p: Profile,
  request: Omit<CampaignHint, "source">,
  day = dayKey(),
): Profile | null {
  const c = p.campaign,
    a = c?.active;
  if (
    !c ||
    !a ||
    request.mode !== "adventure" ||
    a.id !== request.attemptId ||
    a.levelId !== request.levelId ||
    a.levelVersion !== request.levelVersion ||
    a.revision !== request.revision ||
    !canPlace(a, request.move)
  )
    return null;
  if (c.hint?.attemptId === a.id && c.hint.revision === a.revision) return p;
  const free = p.freeDay === day ? p.freeHints : 3;
  if (!free && !p.earnedHints) return null;
  const source = free ? "free" : "earned";
  return {
    ...p,
    revision: p.revision + 1,
    freeDay: day,
    freeHints: free - Number(source === "free"),
    earnedHints: p.earnedHints - Number(source === "earned"),
    campaign: { ...c, hint: { ...request, source } },
  };
}
const num = (x: unknown, max = Number.MAX_SAFE_INTEGER): x is number =>
  typeof x === "number" && Number.isSafeInteger(x) && x >= 0 && x <= max;
export function validCampaign(c: Campaign): boolean {
  try {
    if (
      !c ||
      !Array.isArray(c.completed) ||
      !Array.isArray(c.rewards) ||
      new Set(c.completed).size !== c.completed.length ||
      new Set(c.rewards).size !== c.rewards.length
    )
      return false;
    if (
      c.completed.some((id, i) => id !== LEVELS[i]?.id) ||
      c.rewards.length !== c.completed.length ||
      c.rewards.some((r, i) => r !== levelFor(c.completed[i]!).reward)
    )
      return false;
    const a = c.active;
    if (!a) return c.hint === null;
    const l = levelFor(a.levelId, a.levelVersion);
    if (
      !a.id ||
      a.mode !== "adventure" ||
      a.rulesVersion !== l.rulesVersion ||
      !num(a.revision) ||
      a.revision !== a.moves ||
      !num(a.score) ||
      !num(a.streak) ||
      !num(a.misses, 2) ||
      !["playing", "won", "lost"].includes(a.status)
    )
      return false;
    const index = LEVELS.indexOf(l);
    if (index > 0 && !c.completed.includes(LEVELS[index - 1]!.id)) return false;
    if (a.status === "won" && !c.completed.includes(l.id)) return false;
    if (
      !Array.isArray(a.board) ||
      a.board.length !== 64 ||
      !a.board.every((v) => num(v, 6)) ||
      !Array.isArray(a.ice) ||
      a.ice.length !== 64 ||
      !a.ice.every((v, i) => num(v, l.ice[i]))
    )
      return false;
    if (
      !num(a.nextTray, l.trays.length) ||
      a.nextTray < 1 ||
      !Array.isArray(a.tray) ||
      a.tray.length !== 3
    )
      return false;
    if (
      a.tray.some(
        (s, i) =>
          JSON.stringify({ ...s, used: false }) !==
            JSON.stringify(l.trays[a.nextTray - 1]![i]) ||
          typeof s.used !== "boolean",
      )
    )
      return false;
    const known = [
      ...l.objects,
      ...l.trays
        .flat()
        .flatMap((s) =>
          (s.items ?? []).map((i) => ({ id: i.id, kind: i.kind })),
        ),
    ];
    if (
      !Array.isArray(a.objects) ||
      new Set(a.objects.map((o) => o.cell)).size !== a.objects.length ||
      new Set(a.objects.map((o) => o.id)).size !== a.objects.length
    )
      return false;
    for (const o of a.objects) {
      const orig = known.find((v) => v.id === o.id);
      if (!orig || orig.kind !== o.kind || !num(o.cell, 63)) return false;
      if (o.kind === "lock") {
        const ref = l.objects.find((v) => v.id === o.id)!;
        if (
          o.cell !== ref.cell ||
          o.threshold !== ref.threshold ||
          typeof o.open !== "boolean" ||
          o.open !== a.collected.key >= o.threshold! ||
          a.board[o.cell] ||
          a.ice[o.cell]
        )
          return false;
      }
    }
    if (
      !a.collected ||
      !(["gem", "key", "ice"] as const).every((k) => num(a.collected[k], 64))
    )
      return false;
    const won = Object.entries(l.goals).every(
      ([k, v]) => a.collected[k as keyof typeof a.collected] >= v!,
    );
    if (won !== (a.status === "won")) return false;
    if (
      a.status === "playing" &&
      (a.tray.every((s) => s.used) || !moves(a).length)
    )
      return false;
    if (
      a.status === "lost" &&
      !(
        a.reason === "exhausted" &&
        a.nextTray === l.trays.length &&
        a.tray.every((s) => s.used)
      ) &&
      !(a.reason === "no-move" && !moves({ ...a, status: "playing" }).length) &&
      !(a.reason === "limit" && l.moveLimit !== null && a.moves >= l.moveLimit)
    )
      return false;
    const originalItems = l.objects.filter((o) => o.kind !== "lock");
    if (
      a.objects.some(
        (o) =>
          o.kind !== "lock" &&
          originalItems.some(
            (orig) => orig.id === o.id && orig.cell !== o.cell,
          ),
      )
    )
      return false;
    const removedIce = l.ice.filter((hp, i) => hp > 0 && a.ice[i] === 0).length;
    if (a.collected.ice !== removedIce) return false;
    const h = c.hint;
    if (
      h &&
      (h.mode !== "adventure" ||
        h.attemptId !== a.id ||
        h.levelId !== a.levelId ||
        h.levelVersion !== a.levelVersion ||
        h.revision !== a.revision ||
        !["free", "earned"].includes(h.source) ||
        !canPlace(a, h.move))
    )
      return false;
    return true;
  } catch {
    return false;
  }
}
