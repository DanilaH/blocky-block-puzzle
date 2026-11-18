import {
  clearLines,
  fits,
  shapeById,
  scoreBreakdown,
  type Move,
  type Slot,
} from "../core/rules";
export type ItemKind = "gem" | "key";
export type GoalKind = ItemKind | "ice";
export interface ObjectCell {
  id: string;
  cell: number;
  kind: ItemKind | "lock";
  threshold?: number;
  open?: boolean;
}
export interface Piece extends Slot {
  items?: { id: string; offset: number; kind: ItemKind }[];
}
export interface Level {
  id: string;
  version: 1;
  rulesVersion: "adventure-v1";
  chapterId: "cove";
  title: string;
  lesson: string;
  board: number[];
  ice: number[];
  objects: ObjectCell[];
  trays: Piece[][];
  goals: Partial<Record<GoalKind, number>>;
  moveLimit: number | null;
  reward: string;
  solution: Move[];
}
export interface Attempt {
  mode: "adventure";
  id: string;
  levelId: string;
  levelVersion: 1;
  rulesVersion: "adventure-v1";
  revision: number;
  board: number[];
  ice: number[];
  objects: ObjectCell[];
  tray: Piece[];
  nextTray: number;
  collected: Record<GoalKind, number>;
  moves: number;
  streak: number;
  misses: number;
  score: number;
  status: "playing" | "won" | "lost";
  reason?: "no-move" | "exhausted" | "limit";
}
export interface Campaign {
  active: Attempt | null;
  completed: string[];
  rewards: string[];
  hint: CampaignHint | null;
}
export interface CampaignHint {
  mode: "adventure";
  attemptId: string;
  levelId: string;
  levelVersion: 1;
  revision: number;
  move: Move;
  source: "free" | "earned";
}
export interface Events {
  placed: number[];
  cleared: number[];
  lines: number;
  board: number[];
  collected: ObjectCell[];
  cracked: number[];
  unlocked: number[];
}
export const emptyCampaign = (): Campaign => ({
  active: null,
  completed: [],
  rewards: [],
  hint: null,
});
export function occupied(a: Pick<Attempt, "board" | "objects">) {
  const b = a.board.slice();
  for (const o of a.objects) if (o.kind === "lock") b[o.cell] = 4;
  return b;
}
export function canPlace(a: Attempt, m: Move) {
  const s = a.tray[m.slot];
  if (
    a.status !== "playing" ||
    !s ||
    s.used ||
    !fits(occupied(a), shapeById(s.shapeId), m.x, m.y)
  )
    return false;
  const cells = shapeById(s.shapeId).cells;
  return (s.items ?? []).every((item) => {
    const [dx, dy] = cells[item.offset]!;
    return !a.objects.some((o) => o.cell === (m.y + dy) * 8 + m.x + dx);
  });
}
export function moves(a: Attempt): Move[] {
  const out: Move[] = [];
  for (let slot = 0; slot < 3; slot++)
    if (!a.tray[slot]?.used)
      for (let y = 0; y < 8; y++)
        for (let x = 0; x < 8; x++) {
          const m = { slot, x, y };
          if (canPlace(a, m)) out.push(m);
        }
  return out;
}
export function startAttempt(l: Level, id: string): Attempt {
  return {
    mode: "adventure",
    id,
    levelId: l.id,
    levelVersion: l.version,
    rulesVersion: l.rulesVersion,
    revision: 0,
    board: l.board.slice(),
    ice: l.ice.slice(),
    objects: structuredClone(l.objects),
    tray: structuredClone(l.trays[0]!),
    nextTray: 1,
    collected: { gem: 0, key: 0, ice: 0 },
    moves: 0,
    streak: 0,
    misses: 0,
    score: 0,
    status: "playing",
  };
}
export function step(
  l: Level,
  a: Attempt,
  m: Move,
): { state: Attempt; event: Events } | null {
  if (
    a.levelId !== l.id ||
    a.levelVersion !== l.version ||
    a.rulesVersion !== l.rulesVersion ||
    !canPlace(a, m)
  )
    return null;
  const n = structuredClone(a),
    s = n.tray[m.slot]!,
    shape = shapeById(s.shapeId);
  const placed = shape.cells.map(([dx, dy]) => (m.y + dy) * 8 + m.x + dx);
  for (const cell of placed) n.board[cell] = s.color;
  for (const item of s.items ?? [])
    n.objects.push({
      id: item.id,
      kind: item.kind,
      cell: placed[item.offset]!,
    });
  s.used = true;
  const effectBoard = occupied(n),
    clear = clearLines(effectBoard);
  const event: Events = {
    placed,
    cleared: clear.cells,
    lines: clear.lines,
    board: effectBoard,
    collected: [],
    cracked: [],
    unlocked: [],
  };
  const remove = new Set<string>();
  for (const cell of clear.cells) {
    n.board[cell] = 0;
    if (n.ice[cell]! > 0) {
      n.ice[cell]!--;
      event.cracked.push(cell);
      if (!n.ice[cell]) n.collected.ice++;
    }
    const o = n.objects.find((o) => o.cell === cell);
    if (o && !n.ice[cell] && (o.kind !== "lock" || o.open)) {
      n.collected[o.kind === "lock" ? "gem" : o.kind]++;
      remove.add(o.id);
      event.collected.push(o);
    }
  }
  n.objects = n.objects.filter((o) => !remove.has(o.id));
  for (const o of n.objects)
    if (o.kind === "lock" && !o.open && n.collected.key >= o.threshold!) {
      o.open = true;
      event.unlocked.push(o.cell);
    }
  n.moves++;
  n.revision++;
  if (clear.lines) {
    n.streak++;
    n.misses = 0;
  } else if (n.streak && ++n.misses >= 3) {
    n.streak = 0;
    n.misses = 0;
  }
  n.score += scoreBreakdown(
    placed.length,
    clear.lines,
    n.streak,
    false,
    true,
    true,
  ).total;
  if (
    (Object.entries(l.goals) as [GoalKind, number][]).every(
      ([k, v]) => n.collected[k] >= v,
    )
  )
    n.status = "won";
  else if (l.moveLimit !== null && n.moves >= l.moveLimit) {
    n.status = "lost";
    n.reason = "limit";
  } else {
    if (n.tray.every((s) => s.used)) {
      if (n.nextTray >= l.trays.length) {
        n.status = "lost";
        n.reason = "exhausted";
      } else n.tray = structuredClone(l.trays[n.nextTray++]!);
    }
    if (n.status === "playing" && !moves(n).length) {
      n.status = "lost";
      n.reason = "no-move";
    }
  }
  return { state: n, event };
}
export function commitAttempt(c: Campaign, l: Level, a: Attempt): Campaign {
  const first = a.status === "won" && !c.completed.includes(l.id);
  return {
    active: a,
    hint: null,
    completed: first ? [...c.completed, l.id] : c.completed,
    rewards: first ? [...c.rewards, l.reward] : c.rewards,
  };
}
export function replay(l: Level) {
  let a = startAttempt(l, "validation");
  for (const m of l.solution) {
    const r = step(l, a, m);
    if (!r) throw Error(`${l.id}: invalid replay move ${a.moves}`);
    a = r.state;
  }
  if (a.status !== "won") throw Error(`${l.id}: replay does not win`);
  return a;
}
export function validateLevel(l: Level) {
  const ids = new Set<string>(),
    cells = new Set<number>();
  const integer = (n: number, max: number) =>
    Number.isInteger(n) && n >= 0 && n <= max;
  if (
    l.board.length !== 64 ||
    l.ice.length !== 64 ||
    !l.board.every((n) => integer(n, 6)) ||
    !l.ice.every((n) => integer(n, 2))
  )
    throw Error("Invalid layers");
  if (
    !Object.keys(l.goals).length ||
    Object.entries(l.goals).some(
      ([k, v]) =>
        !["gem", "key", "ice"].includes(k) || !Number.isInteger(v) || v! <= 0,
    )
  )
    throw Error("Invalid goals");
  const supply = { gem: 0, key: 0, ice: l.ice.filter(Boolean).length };
  const id = (s: string) => {
    if (!s || ids.has(s)) throw Error("Duplicate ID");
    ids.add(s);
  };
  for (const o of l.objects) {
    id(o.id);
    if (!integer(o.cell, 63) || cells.has(o.cell))
      throw Error("Invalid object cell");
    cells.add(o.cell);
    if (o.kind === "lock") {
      if (
        l.ice[o.cell] ||
        l.board[o.cell] ||
        !Number.isInteger(o.threshold) ||
        o.threshold! < 1 ||
        o.open
      )
        throw Error("Invalid lock");
      supply.gem++;
    } else supply[o.kind]++;
  }
  if (!l.trays.length) throw Error("No trays");
  for (const tray of l.trays) {
    if (tray.length !== 3) throw Error("Invalid tray");
    for (const s of tray) {
      const shape = shapeById(s.shapeId),
        offsets = new Set<number>();
      if (s.used || !integer(s.color, 6) || !s.color)
        throw Error("Invalid piece");
      for (const item of s.items ?? []) {
        id(item.id);
        if (
          !integer(item.offset, shape.cells.length - 1) ||
          offsets.has(item.offset)
        )
          throw Error("Invalid item offset");
        offsets.add(item.offset);
        supply[item.kind]++;
      }
    }
  }
  if (
    Object.entries(l.goals).some(([k, v]) => supply[k as GoalKind] < v!) ||
    l.objects.some((o) => o.kind === "lock" && o.threshold! > supply.key)
  )
    throw Error("Insufficient targets/keys");
  if (
    l.moveLimit !== null &&
    (!Number.isInteger(l.moveLimit) || l.moveLimit < 1)
  )
    throw Error("Invalid move limit");
  replay(l);
}
// Worker ranks every legal first move, then a bounded authored continuation when
// the current position matches its replay. Never advertises global optimality.
export function recommend(l: Level, a: Attempt): Move | null {
  let scripted = startAttempt(l, "probe");
  for (const m of l.solution) {
    if (
      JSON.stringify([
        scripted.board,
        scripted.ice,
        scripted.objects,
        scripted.tray,
        scripted.nextTray,
      ]) === JSON.stringify([a.board, a.ice, a.objects, a.tray, a.nextTray])
    )
      return m;
    const r = step(l, scripted, m);
    if (!r) break;
    scripted = r.state;
  }
  let best: Move | null = null,
    rank = -Infinity;
  for (const m of moves(a)) {
    const r = step(l, a, m)!;
    const n = r.state;
    const value =
      (n.status === "won" ? 1e8 : n.status === "lost" ? -1e8 : 0) +
      r.event.unlocked.length * 10000 +
      (n.collected.key - a.collected.key) * 5000 +
      (n.collected.gem - a.collected.gem) * 1000 +
      r.event.cracked.length * 200 +
      r.event.lines * 20 -
      n.board.filter(Boolean).length;
    if (value > rank) {
      rank = value;
      best = m;
    }
  }
  return best;
}
