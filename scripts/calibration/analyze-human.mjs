/** Read-only analysis of real opt-in recordings. No balance tuning or phone FPS claims. */
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { createServer } from "vite";

const [output, ...inputs] = process.argv.slice(2);
if (!output || !inputs.length)
  throw Error("Usage: node scripts/calibration/analyze-human.mjs OUTPUT.json INPUT.json ...");
const server = await createServer({ server: { middlewareMode: true } });
try {
  const R = await server.ssrLoadModule("/src/core/rules.ts");
  const V = await server.ssrLoadModule("/scripts/calibration/replay.ts");
  const C = await server.ssrLoadModule("/src/platform/play-capture.ts");
  const histogram = (items) => Object.fromEntries(
    [...items.reduce((map, key) => map.set(key, (map.get(key) ?? 0) + 1), new Map())]
      .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))),
  );
  const percentile = (items, p) => items.length
    ? [...items].sort((a, b) => a - b)[Math.min(items.length - 1, Math.floor(items.length * p))]
    : null;
  const timing = (items) => ({ n: items.length, p50Ms: percentile(items, .5), p95Ms: percentile(items, .95), maxMs: items.length ? Math.max(...items) : null });
  const shape = (id) => R.shapeById(id);
  const bag = (tray, family = false) => tray.map((slot) => family ? shape(slot.shapeId).family : slot.shapeId).sort().join(",");
  const placementCount = (board, s) => {
    let n = 0;
    for (let y = 0; y <= 8 - s.height; y++) for (let x = 0; x <= 8 - s.width; x++)
      if (s.cells.every(([dx, dy]) => !board[(y + dy) * 8 + x + dx])) n++;
    return n;
  };
  const legal = (state) => state.tray.reduce((n, slot) => n + (slot.used ? 0 : placementCount(state.board, shape(slot.shapeId))), 0);
  function independentGeometry(m) {
    const board = [...m.before.board], s = shape(m.before.tray[m.event.move.slot].shapeId);
    for (const [dx, dy] of s.cells) {
      const x = m.event.move.x + dx, y = m.event.move.y + dy;
      assert(x >= 0 && x < 8 && y >= 0 && y < 8);
      assert.equal(board[y * 8 + x], 0);
      board[y * 8 + x] = m.before.tray[m.event.move.slot].color;
    }
    const rows = [], columns = [];
    for (let i = 0; i < 8; i++) {
      if (Array.from({ length: 8 }, (_, x) => board[i * 8 + x]).every(Boolean)) rows.push(i);
      if (Array.from({ length: 8 }, (_, y) => board[y * 8 + i]).every(Boolean)) columns.push(i);
    }
    for (let i = 0; i < 64; i++) if (rows.includes(i >> 3) || columns.includes(i % 8)) board[i] = 0;
    assert.deepEqual(board, m.after.board);
    assert.equal(rows.length + columns.length, m.lines);
    assert.equal(!board.some(Boolean), m.allClear);
    assert.equal(legal(m.after) === 0, m.after.status === "over");
  }
  const reports = [];
  for (const input of inputs) {
    const bytes = await fs.readFile(input), record = JSON.parse(bytes), replay = V.replayRecord(record);
    for (const m of replay.moves) independentGeometry(m);
    const gameIds = [...new Set(record.events.filter((e) => e.kind === "checkpoint").map((e) => e.state.gameId))];
    const games = gameIds.map((id, index) => {
      const moves = replay.moves.filter((m) => m.before.gameId === id);
      const checkpoints = record.events.filter((e) => e.kind === "checkpoint" && e.state.gameId === id);
      const initial = checkpoints[0].state;
      const lastMove = moves.at(-1), lastCheckpoint = checkpoints.at(-1);
      const final = lastCheckpoint.state.moves >= (lastMove?.after.moves ?? 0) ? lastCheckpoint.state : lastMove.after;
      const deals = [];
      const seen = new Set();
      const addDeal = (s, activeMs) => {
        if (s.tray.some((slot) => slot.used) || !s.tray.length || seen.has(s.moves)) return;
        seen.add(s.moves);
        const smallNonrectangularPlaceable = R.SHAPES.filter((piece) => piece.cells.length <= 4 && piece.cells.length !== piece.width * piece.height && placementCount(s.board, piece) > 0).map((piece) => piece.id);
        deals.push({ atMove: s.moves, activeMs, rngState: s.rngState, ids: s.tray.map((slot) => slot.shapeId), shapeBag: bag(s.tray), familyBag: bag(s.tray, true), occupied: s.board.filter(Boolean).length, stage: s.goalDirector?.last ?? null, smallNonrectangularPlaceable });
      };
      addDeal(initial, checkpoints[0].activeMs);
      for (const m of moves) addDeal(m.after, m.event.activeMs);
      const ids = deals.flatMap((d) => d.ids), shapes = ids.map(shape);
      const chunks = [0, 1, 2].map((part) => {
        const start = Math.floor(moves.length * part / 3), end = Math.floor(moves.length * (part + 1) / 3), list = moves.slice(start, end);
        return { recordedMoves: list.length ? [start + 1, end] : null, allClears: list.filter((m) => m.allClear).map((m) => m.after.moves), clearMoves: list.filter((m) => m.lines).length, maxOccupied: Math.max(0, ...list.map((m) => m.after.board.filter(Boolean).length)) };
      });
      let longestNoClear = 0, dry = 0;
      for (const m of moves) { dry = m.lines ? 0 : dry + 1; longestNoClear = Math.max(longestNoClear, dry); }
      return {
        game: index + 1, dealer: initial.dealerVersion, recordedMoves: moves.length,
        statusAtRecordEnd: final.status, finalMove: final.moves, finalScore: final.score,
        gameOverAtMoves: moves.filter((m) => m.after.status === "over").map((m) => m.after.moves),
        reviveCheckpoints: checkpoints.filter((e) => e.state.reviveUsed && !initial.reviveUsed).length,
        hintedMoves: moves.filter((m) => m.event.hinted).length,
        allClearAtMoves: moves.filter((m) => m.allClear).map((m) => m.after.moves),
        clearMoves: moves.filter((m) => m.lines).length, totalLines: moves.reduce((n, m) => n + m.lines, 0), longestNoClear,
        maxOccupied: Math.max(initial.board.filter(Boolean).length, ...moves.map((m) => m.after.board.filter(Boolean).length)),
        minimumPositiveLegalPlacements: moves.length ? Math.min(...moves.map((m) => legal(m.before)).filter((n) => n > 0)) : null,
        issuedShapes: ids.length, familyHistogram: histogram(shapes.map((s) => s.family)), areaHistogram: histogram(shapes.map((s) => s.cells.length)),
        filledRectangles: shapes.filter((s) => s.cells.length === s.width * s.height).length,
        squaresAndR6: shapes.filter((s) => ["O2", "O3", "R6"].includes(s.family)).length,
        areaAtLeast6: shapes.filter((s) => s.cells.length >= 6).length,
        smallNonrectangular: shapes.filter((s) => s.cells.length <= 4 && s.cells.length !== s.width * s.height).length,
        repeatedAdjacentShapeBags: deals.filter((d, i) => i && d.shapeBag === deals[i - 1].shapeBag).length,
        repeatedAdjacentFamilyBags: deals.filter((d, i) => i && d.familyBag === deals[i - 1].familyBag).length,
        repeatedAdjacentRngStates: deals.filter((d, i) => i && d.rngState === deals[i - 1].rngState).length,
        shapeBagHistogram: histogram(deals.map((d) => d.shapeBag)), familyBagHistogram: histogram(deals.map((d) => d.familyBag)), chunks, deals,
      };
    });
    const capture = new C.PlayCapture(() => 0), captureTimes = [];
    capture.start(record.events[0].state);
    for (const m of replay.moves) {
      const at = performance.now(); capture.record(m.before, m.event.move, m.after); captureTimes.push(performance.now() - at);
    }
    const first = [], last = [], refill = [], ordinary = [], slow = [];
    // Same recorded actions, twice. This is CPU diagnostics, not new player samples.
    for (let pass = 0; pass < 2; pass++) for (let i = 0; i < replay.moves.length; i++) {
      const m = replay.moves[i], at = performance.now(), result = R.applyMove(m.before, m.event.move, m.before.revision), ms = performance.now() - at;
      assert.equal(C.stateHash(result.state), m.event.after);
      const isRefill = m.before.tray.filter((slot) => !slot.used).length === 1;
      (isRefill ? refill : ordinary).push(ms);
      if (i < replay.moves.length / 3) first.push(ms);
      if (i >= replay.moves.length * 2 / 3) last.push(ms);
      slow.push({ move: m.after.moves, game: gameIds.indexOf(m.before.gameId) + 1, pass, refill: isRefill, ms });
    }
    reports.push({
      file: path.basename(input), sha256: createHash("sha256").update(bytes).digest("hex"), appVersion: record.appVersion,
      bytes: bytes.length, captureLimitBytes: C.PLAY_CAPTURE_LIMIT, events: record.events.length, moves: replay.moves.length,
      activeMs: record.events.at(-1)?.activeMs, wallMs: record.events.at(-1)?.wallMs,
      replay: "PASS: every before/after hash; independent board/lines/all-clear/game-over checks", games,
      cpuOnly: { environment: `${process.version}, ${process.platform}/${process.arch}; no UI/storage/Android FPS or thermal measurement`, capture: timing(captureTimes), captureFirstThird: timing(captureTimes.slice(0, Math.floor(captureTimes.length / 3))), captureLastThird: timing(captureTimes.slice(Math.floor(captureTimes.length * 2 / 3))), rulesFirstThird: timing(first), rulesLastThird: timing(last), refills: timing(refill), ordinaryMoves: timing(ordinary), slowest: slow.sort((a, b) => b.ms - a.ms).slice(0, 8) },
    });
  }
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, JSON.stringify({ source: "Two owner play recordings; one person, unequal exposure; no population or retention inference", reports }, null, 2) + "\n");
  console.log(JSON.stringify(reports.map(({ games, cpuOnly, ...r }) => ({ ...r, games: games.map(({ deals, shapeBagHistogram, familyBagHistogram, ...g }) => g), cpuOnly })), null, 2));
} finally { await server.close(); }
