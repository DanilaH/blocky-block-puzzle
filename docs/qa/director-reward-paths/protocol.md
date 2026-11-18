# D76 — reward paths through plausible intermediate placements

Written before the new control runs. Selected engineering candidate C3 uses
seeds1141001–1141006 only. Five available engineering variants and stdout are
retained separately; those games are not acceptance data.

Frozen development1441001–1441008 and confirmation1461001–1461008, separately.
Five unchanged players clear/three/plausible/bounded/lapse; director-v2 baseline
and director-v5 candidate,360 moves,160 games. Player RNG remains SHA256 of
`mixed-player:<seed>`, little endian uint32, then the existing public RNG.
Players receive only board/tray, never director state, plans or future trays.
Do not change the policy, players or criteria between either control split.

Retain the D74/D75 criteria without weakening:

1. Each style: >=90% broad trios, >=95% before18 moves, <=5% emergency.
   Soft phases certify three first choices and three second choices per first.
   A load retains a complete witness even when broad assessment fails.
2. Bounded: reward by60 in >=4/8 games and after12 in >=2/8 games; median length
   30–180; >=6/8 games finish by360.
3. Three: all-clear per move0.03–0.09 (about11–33 moves).
4. Lapse: >=2/8 games finish by360. Limit hits are censored, not infinite games.
5. Each style: lines/move >=80% baseline, p90 line gap <=baseline+2,
   zero defeats before9 and first line by12 in >=7/8 games.

Construction now restricts intermediate placements to locally attractive
board-only moves. Preparation evaluates all sampled final placements, rather
than a solver's first legal final move: three assessed first x three assessed
second x up to three ranked third moves, deduplicated by final board. At least
three distinct endpoints and >=60% positive reward routes (or reward already
earned) are required to store preparation. This is a bounded heuristic sample,
not a probability of human success. A search miss remains unknown. The compact
reward class fills occupied rows or columns; other targets may be missed.
A pending preparation takes priority over a due load, but real all-clear cancels
it. At most12 endpoints persist. Payoff is revalidated on the actual next board;
matching, replanning, construction, broad offer and earned reward stay separate.

One shared24000-work meter covers construction, assessment, endpoints, payoffs
and fallback. All issued trios retain legal full witnesses. Soft fallback is
certified; otherwise actual=emergency. No timer, ads, record or player strategy
enters the policy. Hash frozen sources before/after control. Keep actions,
events, source/final hashes, diagnostic inputs/outputs and full proofs.
Independently replay public moves/proofs and recompute metrics from events.
Verify all416 historical D73/D74/D75 final-state hashes without migrating saves.

Any failed behavioral criterion keeps v5 outside default/APK. Default remains
preview0.63/director-v2. A negative run is preserved, not retuned on these seeds.
A local browser/Node check does not establish human balance or physical POCO
performance. Phone lag, release-scale1000 seeds/player/policy and human trials
remain separate open requirements.
