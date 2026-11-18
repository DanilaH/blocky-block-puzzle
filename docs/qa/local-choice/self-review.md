# C1 limitations identified during frozen control — no source changes

The control continues unchanged. These observations are source review and
interpretation limits, not a new candidate or retrospective criterion change.

1. `meanLines` and `meanReward` divide by sampled *positive final routes*.
   Unsolvable and unknown final branches are recorded but absent from that
   denominator. Thus a high mean is conditional on the completed sample; it
   is neither a lower bound on success of all attractive choices nor a human
   reward probability. Two certified roots can still coexist with omitted
   attractive losses. The independent broad gate remains necessary.
2. The evaluator uses direct lines/all-clear and empty rectangles; the external
   bounded bot uses line/occupancy/edge/hole ranking. They are intentionally
   different. Positive generator certificates cannot be assumed to cover that
   bot's actions, still less a person's. Actual first/second coverage is retained.
3. Ordinary construction still creates a few witnessed bags using beam paths.
   Evaluating arbitrary remaining slots afterwards cannot prove that the pool
   contains every useful bag. Same-pool random is the necessary local ablation.
4. The moves-since-real-clear ramp is an event-memory regulator. The candidate
   has no future goals or phases, but must not be advertised as fully stateless.
5. Large-square/rectangle opportunity, fit/transition budget and sampled breadth
   do not measure visual comprehension, pleasantness or physical phone latency.

None of these limitations authorizes silently changing C1 after seeing holdout
seeds. If C1 fails, preserve it as the one negative experiment; any future design
needs an explicit separate hypothesis, not incremental tuning on this control.
