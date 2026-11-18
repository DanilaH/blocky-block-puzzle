# Goal cycle v2 — frozen pilot protocol, 2026-11-10

Owner authorized trying the next director: order-sensitive tasks, periodic large pressure, finite human games and meaningful reward beats. D72's14 jointly impossible loads and loss of full-clears are explicit defects. New `director-v2` guarantees a complete route for every tray, including load; it does not force the defeat of a perfect solver. Existing policy versions and installed APK remain separate until acceptance.

Engineering used seeds941001–941006 to debug search, early payoff priority and diagnostics. Those outcomes are not acceptance evidence. This protocol freezes policy and gates before development1041001–1041008 and confirmation1061001–1061008. Three independent players (clear, three, plausible), baseline flow-v4 and candidate director-v2,360 accepted moves:96 games. Player RNG is its own sequential xorshift32 stream, seed XOR0x9e3779b9. Players never read witnesses, diagnostics or future trays. No tuning on either evaluation split.

Policy: prepare optimizes lines/geometry and requests a payoff on the next tray. Payoff recomputes an all-clear route from the actual board; limited target-class failure remains unknown and uses a line/space beam. Load adds a large≥6 and a small≤4, and after eight deals two large figures; all three have a constructive route. Load requires at least3 intervening trays and move≥12, then requests2 payoff attempts. Actual all-clear cancels the pending goal and requests one rest tray; revive retains exactly3 supported refills. No ad, clock, network or mastery input. Full target checks, placements, transitions, proofs and certificates share24000 work units,512 reserved for a certified emergency fallback.

Broadened decision definition is explicit and reported by kind, not retroactively substituted into D72:

- `slot-order`: one complete positive route and an exhaustively disproven different slot order.
- `placement`: a positive complete route and a legal, superficially plausible first placement after which the other two pieces cannot both fit in any order.
- `reward-choice`: a positive full route earning all-clear and a legal, superficially plausible first placement after which no remaining order/placement can earn all-clear during this tray. Losing this reward does not mean losing the game.

Plausibility is a fixed one-step value:200×lines−2×occupied−edges−20×isolated holes, at least the witnessed first move's value minus12. Exhaustion certifies nothing. All certificate claims are verified by a separate solver; initially available figures and reward versus fatal restrictions are disclosed separately.

Preview gates, all mandatory:

1. Every tray and all positive routes replay legally; all negative certificates exhaustively verify; no initial/late joint-impossibility, input mutation or work-limit breach. Serialized resume and invalid/repeated moves are deterministic; exact3 revive refills; old policies match historical final hashes.
2. Per split, at least15% of actually presented post-intro trays (move≥12, excluding an unused final refill) carry a certified decision; load≥10%; emergency≤5%. Report all3 certificate types separately. Load cooldown and actual-goal cancellation must hold.
3. Per split/style, lines/move≥85% baseline and p90 complete inter-line reward intervals≤baseline+3 moves. Initial p90 reward delay≤12; no deaths before9 moves. Initial delay and censored terminal dry tails remain separate.
4. Per split, at least6/8 three games and4/8 clear games earn an all-clear by move30; their all-clears/move must be≥50% baseline. Plausible's all-clear data is disclosed but has no preservation floor.
5. Finite human-style games: at least4/8 clear games and6/8 plausible games end by360 per split. Three has no forced-death gate. All survivors are censored, never called measured infinite games.
6. Pure core generation p95≤60ms in this cloud environment, with separate initial/refill samples retained. No inference about phone FPS or human fun.

Save raw actions/events, every generation input/diagnostic/witness, complete RNG/state hashes and timings. Replay all96 games and independently recompute metrics/gates. The previous D72 dataset must also replay byte-identically under its own versions. Passing permits a separately versioned human preview, not a production release. The release-sized1000-seed/policy/player study and human gate from the spec remain open. Failed gates stay failed; do not promote based on improved aggregates.
