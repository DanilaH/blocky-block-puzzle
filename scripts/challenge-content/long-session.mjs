/** Serial desktop core/capture check. No renderer, phone FPS or SDK claims. */
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { createServer } from "vite";
const server = await createServer({
  server: { middlewareMode: true, hmr: false, watch: null },
});
try {
  const R = await server.ssrLoadModule("/src/core/rules.ts"),
    P = await server.ssrLoadModule("/scripts/director/mixed-players.ts");
  const C = await server.ssrLoadModule("/src/platform/play-capture.ts"),
    F = await server.ssrLoadModule("/src/core/profile.ts");
  const V = await server.ssrLoadModule("/scripts/calibration/replay.ts");
  const results = [];
  for (const policy of process.argv.includes("--verified")
    ? ["director-challenge-v2"]
    : ["director-v2", "director-challenge-v1"])
    for (const recording of [false, true]) {
      let seed = 8106001,
        player = seed ^ 0x85ebca6b,
        now = 0,
        g = R.newGame(seed, "long-0", policy),
        profile = F.createProfile(g),
        lastCaptured = g;
      const capture = new C.PlayCapture(() => now),
        rows = [],
        generation = [],
        serialize = [];
      let games = 1;
      if (recording) {
        capture.start(g);
        capture.setActive(true);
      }
      for (let n = 1; n <= 1800; n++) {
        const roll = R.random(player);
        player = roll.state;
        const m = P.chooseMixed(g.board, g.tray, "three", roll.value).move;
        assert(m);
        now += 3200;
        const before = g,
          refill = g.tray.filter((s) => !s.used).length === 1,
          begin = performance.now();
        const r = R.applyMove(g, m, g.revision, capture.enabled, {
          activeMs:
            (g.challengeV2State ?? g.challengeState)
              ? (g.challengeV2State ?? g.challengeState).activeMs + 3200
              : now,
        });
        assert(r);
        g = r.state;
        if (refill) generation.push(performance.now() - begin);
        if (recording) {
          capture.record(before, m, g, r.decision);
          if (capture.enabled) lastCaptured = g;
        }
        const at = performance.now();
        profile = {
          ...profile,
          revision: profile.revision + 1,
          game: g,
          best: Math.max(profile.best, g.score),
        };
        const bytes = Buffer.byteLength(JSON.stringify(profile));
        serialize.push(performance.now() - at);
        assert(F.validProfile(profile));
        if (n % 300 === 0) {
          global.gc?.();
          rows.push({
            accepted: n,
            gameMoves: g.moves,
            profileBytes: bytes,
            contentBytes: JSON.stringify(
              g.challengeV2State ?? g.challengeState ?? null,
            ).length,
            recordBytes: recording
              ? Buffer.byteLength(JSON.stringify(capture.snapshot()))
              : 0,
            heapBytes: process.memoryUsage().heapUsed,
            clockRing:
              (g.challengeV2State ?? g.challengeState)?.recentTrayMs.length ??
              0,
          });
        }
        if (g.status === "over") {
          const previous = profile;
          g = R.newGame(++seed, `long-${games++}`, policy);
          profile = { ...profile, revision: profile.revision + 1, game: g };
          if (recording) {
            capture.committed(previous, profile);
            if (capture.enabled) lastCaptured = g;
          }
        }
      }
      let captured = 0,
        status = "off";
      if (recording) {
        const record = capture.snapshot();
        captured = capture.count;
        status = capture.status;
        assert(
          Buffer.byteLength(JSON.stringify(record)) <=
            C.PLAY_CAPTURE_LIMIT + 512,
        );
        assert.equal(
          C.stateHash(V.replayRecord(record).final),
          C.stateHash(lastCaptured),
        );
        assert.equal(
          status,
          "limit",
          "Long capture must exercise the real cap",
        );
        assert(captured < 1800);
      }
      const p95 = (a) =>
        [...a].sort((a, b) => a - b)[Math.ceil(a.length * 0.95) - 1] ?? 0;
      const row = {
        policy,
        recording,
        accepted: 1800,
        games,
        captured,
        status,
        finalHash: C.stateHash(g),
        p95GenerationMs: p95(generation),
        p95SerializeMs: p95(serialize),
        rows,
      };
      if (recording)
        assert.equal(
          row.finalHash,
          results.find((r) => r.policy === policy && !r.recording).finalHash,
          "Capture must not change the game",
        );
      results.push(row);
      console.log(JSON.stringify(row));
    }
  await fs.writeFile(
    process.argv.includes("--verified")
      ? "artifacts/challenge-balance/long-session.json"
      : "artifacts/challenge-content/long-session.json",
    JSON.stringify(
      {
        provenance:
          "Synthetic only; serial desktop Node core/capture, no renderer or SDK",
        results,
      },
      null,
      2,
    ) + "\n",
  );
} finally {
  await server.close();
}
