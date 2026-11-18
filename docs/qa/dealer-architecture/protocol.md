# D78: architecture diagnosis, frozen before collection (2026-11-12)

Baseline d3cd06aea25be4781795e4c835abd346e4c68bb0. This is diagnosis, not a
replacement acceptance gate for the rejected D74–D77 policies. No new runtime
policy, save migration, default, scoring, ads or presentation change.

Questions: does all-clear-blind evaluation explain lost rewards? Do simple
existing dealers preserve line flow and meaningful consequences? Does removing
the D3/L5 catalogue difference change these comparisons? A negative D77 alone
cannot identify a causal effect of the global phase architecture.

## Comparators and controls

- Native flow-v4 and director-v2, unchanged public newGame/applyMove paths.
- Offline random-proved: weighted random triples, <=32 proposals, <=1500
  geometric checks per proposal and <=24000 total including a 512 reserve.
  Every output has a replayed three-slot witness. Bounded proof failure is
  unknown, not impossible. Explicit triple-singleton reserve is separately
  counted as assistance, never claimed to be pure rejection sampling.
- Full catalogue and common catalogue (D3/L5 excluded) are separate interventions.
  A Vite load hook changes the offline JSON input for *every* policy and player,
  without modifying source. Matching support does not equate their shape weights:
  the native beams rank shapes differently from a weighted random draw.
- Existing clear/space/three/bounded/lapse players unchanged. Two additional
  variants add only +1000 for earned all-clear to the original bounded or
  three-step ranking. They retain old beam/ties; zero-bonus equivalence is tested.
  This is reward-awareness ablation, not a validated human behavior model.
- Every full game uses Festival-v4 scoring; old studies did not assign it in
  newGame, but their players did not read score. Old results/criteria remain intact.

## Matched next-tray probes

48 unique recorded director-v2 states from D77: 12 each at occupancy 0–11,
12–23,24–35,36–64; move>=12. Deterministic SHA ordering within each stratum.
Use recorded incoming RNG, rhythm, previous bag and native goal state, not a
reset director. Full-catalogue director-v2 must exactly reproduce recorded trays.
Both catalogues evaluate the same input board/history, not regenerated states.
This snapshot set is deliberately stratified and originates from director-v2;
it does not estimate production prevalence or eliminate source-policy bias.

Probe each comparator with each style and five fixed roll streams. Record all
actions, line/all-clear events, tray completion and endpoint. Separately assess
the union of the top-five old/aware first moves, and top-three old/aware second
moves, with bounded independent public-rule continuation checks. Unproved
continuations remain unknown; sampled reward access is a lower bound, not a
full-space absence proof. Short D77 reward trays are also re-played at the exact
recorded RNG, with no change to their filler, to test the bot confound directly.

## Fresh full games

Exploration 2141001–2141004 and replication 2161001–2161004; all three policies,
both catalogues, seven fixed styles, cap240:336 games. Player RNG is independent
SHA256(`architecture-player:<seed>`), then xorshift32 once per move; every variant
gets the same roll stream. Same seeds after divergence do not mean same boards.
Games still alive at240 are censored. No forced-death or target-length objective.
No changes to code, players, catalogue, criteria or seeds between splits.

Native paths and independent mask transitions are checked against public
fits/place for every action. The offline random adapter discards the legacy
solvable-v1 automatic refill, replaces tray/RNG/fallback/status from the incoming
pre-refill seed and stores its own policy label; its states are not runtime saves.
Pure-deal timings are explicitly measured separately from this adapter overhead.
Final states/actions/events and all dealer witnesses are retained and replayed.

Report per style/catalogue/split: lines/move, completed and ongoing line-drought
intervals, first line, multi-line/all-clear per move and per game, ended/censored,
occupancy trajectory, large-shape share, family-bag repetitions, fallback, proof
work and pure-dealer timing. Do not pool strategies to hide regressions. Treat
individual moves within one seed as dependent; no player-population inference.

## Decision rule / stop

These are descriptive diagnostic cohorts, not human acceptance or a new route
around D77's failed gates. A game-code candidate requires a specific repeated
failure on fixed inputs, a mechanism separated from the bot/catalogue confounds,
and one minimal change with predeclared guardrails and fresh candidate seeds.
If the only clear fix is measurement or no single mechanism is isolated: HOLD
new generator, retain the improved offline evaluation and recommend a bounded
human comparison of existing flow-v4/director-v2. Do not manufacture v7.

No APK from this diagnosis alone. Human playtest, physical POCO lag and the full
release-sized cohort remain open. Timings are Node observations, not Android FPS.
