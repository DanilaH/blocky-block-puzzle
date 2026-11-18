# D82: prepare a tray through actual bounded choices

Frozen before first run. Engineering scope only; no runtime/APK candidate.
D81 weights, beam and data remain unchanged. No coefficients will be tuned
on its31 fields. This is a different construction object: actual player
outcomes of a whole current tray, not projection of a long witness.

Inputs: all31 previous D80 positions and new director-v2/bounded games with
seeds3171001–3171008, playerSeed from the D78 harness, snapshots before the
refill at moves12/24. Generate at most24 moves/game. If a game ends early,
retain its full trace and record missing snapshots, without replacement.
Full catalogue31 orientations, repeated shapes allowed. Only nonempty stable
snapshots enter recovery episodes; empty snapshots are explicitly separate.

Construction, same at every refill (no phases, history or future target):

1. Enumerate all5456 unordered three-shape multisets. Fixed slot permutation
   [2,0,1] of sorted IDs, without searching slot permutations.
2. Screen each with the unchanged bounded player at five fixed quantiles
   0,.25,.5,.75,.999999, playing the whole tray. Select the top8 distinct bags.
3. Recompute these8 bags through the complete boundedOptions tree: every
   returned action at each of three decisions, any figure order, all dead
   branches retained. At most125 complete leaves, with multiplicities explicit.
4. Both screening and full-tree ranking are lexicographic: no dead branch;
   at least one clearing move on every branch; reward on every branch;
   larger rewarded-leaf fraction; smaller worst effective final cover;
   smaller mean effective cover; larger minimum clearing moves; larger mean
   lines; smaller mean occupied; lexicographic sorted shape IDs. Effective
   cover/occupied are0 after any earned all-clear, even if later slots add cells.
   Minimum cover is a heuristic, not proof of future reward or difficulty.
5. Choose the top full-tree bag. A candidate failing safety/ordinary-line
   conditions is retained and explicitly weak; never relabel it robust.

Tests after construction: five original fixed quantiles for engineering;
ten independent seeded uniform bounded choices for each new position.
Run for at most9 actual placements, rebuild only after the third used slot,
stop at first all-clear or real remaining-tray death. Same inputs/choices
also run frozen D81 receding witness projection: horizons9/6/3, UNKNOWN
stops explicitly, exact short misses separately. This comparator has a
different bag pool/composition: the result does not isolate ranking alone.

Measure reward, at least two successful choices per input, all-choice
coverage, ordinary lines, leading/trailing dry gaps, death, weak preparation,
shape/family distribution, repeat bags and work. The full first-tray tree
is audited independently; full9-step branch robustness is NOT claimed from
sampled episodes. Correlated snapshots/quantiles are not independent humans.

For new first-tray full-tree terminal boards, additionally run unchanged D81
native6 positive-route search. Report found/unknown opportunities separately
from actual player success. This is not a selection signal or validation of
all possible nine-step player branches. A witness is still not accessibility.

Acceptance for this limited bridge: zero dead paths in every chosen first-tray
bounded tree; at least one clearing move on every such path; rewards after
at least two sampled continuations on at least half the nonempty new inputs;
more sampled new-input rewards than D81 receding control, without lower
first-tray clearing frequency. These are engineering thresholds, not release
balance targets. Failures remain failures; no APK follows from success alone.

Verify native player options/tree using public TypeScript boundedOptions and
cell-based independent transitions; rerun native queries and the selection;
replay every actual move and new source game; preserve source hashes and
production files. Compare at least one complete5456-bag screen with independent
JavaScript enumeration, including top8/order. Run existing unit/build checks.

No phone/performance/human-feel claim. Exhaustive native work is deliberately
unbounded relative to production24000 WorkBudget; successful behavior would
still need a cheaper construction, fresh complete games and human A/B.
