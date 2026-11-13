# D83: actual played rollouts, frozen before collection

One offline candidate. Production/APK0.63 unchanged. No new generator phases,
geometry coefficients, player definitions or release acceptance shortcuts.

Pool: existing director-v2 tray plus all distinct ordered trays in the frozen
D79 localChoiceDeal pool (max5 total). Every current tray retains a full legal
witness. Candidate proposals use the post-v2 RNG as a separate deterministic
proposal seed; the actual game RNG is unchanged by proposal/evaluation work.
The v2 generation cursor is retained even for an alternative; actual recent
bag history is corrected to the issued tray. This is a wrapper over v2, not
evidence that a global director is necessary or absent.

Rollout: each candidate is played with unchanged boundedOptions at fixed
quantiles0,.5,.999999 and with unchanged three-ply player. Each player only
sees current board/tray. Rules.applyMove generates future trays using frozen
director-v2 from actual simulated results, for at most9 placements or until
real death. No free-figure witness counts as a predicted reward. Rollout
future policy is explicitly v2, not recursive use of the new selector.
Actual execution replans with the selector after each complete tray; forecast
and realized rewards are reported separately, with this mismatch disclosed.

Current-tray eligibility: all4 forecast players can use the first three slots;
if a reward happened before a later death, it still does not prove first-tray
completion. Aggregate bounded forecast lines and strong-player lines must
each be >=95% of the base candidate for the same horizon. Keep all failed
forecasts in denominators. If none is eligible choose base, explicitly flagged.

Rank eligible candidates lexicographically: more bounded trajectories earning
at least one real all-clear (cap1 per trajectory); fewer extra strong-player
all-clears beyond1; larger minimum bounded clearing moves; larger total lines;
fewer repeated family bags in actual recent history; original pool index.
No terminal geometry term. Forecast continues after rewards to observe flow.

Controls: v2 unchanged; short selector with exactly same pool, proposal seed,
four players, rank/guards, but horizon3. Candidate horizon9. On identical input
the pool, actual post-issue RNG and original v2 cursor must match for both
selectors. Complete-game pools can diverge because boards/history differ.

Engineering inputs: replay first4 D82 source games through move12, keep only
reached nonempty states, never replace missing/empty positions. These are
known data and not a fresh confirmation. New source games v2/bounded use
development seeds3301001–3301004 and confirmation3321001–3321004, snapshot at12.
Stop source games at12 or death, report missing/empty. Preserve complete state.

Matched-input episodes: each nonempty snapshot, all3 policies, bounded fixed
quantiles.125,.375,.625,.875 (unseen during selection) plus three player;
max9 actual placements, selecting a fresh tray only after completing the old
one. Initial comparison starts at a refill with identical pre-issue state.

Complete-game pilot regardless of matched outcome: first2 seeds of each new
split, both bounded and three players, all3 policies:24 runs, cap240 moves.
Use D78 playerSeed per seed, identical exogenous roll stream across policies.
Cap means censored, not an ended game. No intentional strong-game termination.
No repeats/tuning based on first split.

Behavior gates, evaluated separately for both fresh splits: bounded matched
rewards must exceed short, and >=v2; at least half bounded full games have an
all-clear after move12; line rate per actual move >=95% v2 for each player;
strong full-game all-clear rate0.03–0.10 per move; consecutive identical-bag
rate <=v2+.10. Report deaths, leading/trailing dry gaps, first-tray completion,
large-line rewards, censored durations, shape areas/families and forecast-to-
execution mismatch independently. Known-data wins do not rescue a fresh fail.
These are engineering pilot gates, not human retention or release proof.

Verification: rerun source games, all issued proofs, every actual move and all
counterfactual actions through public rules/unchanged players; independently
replay transitions with cell rules; recompute chosen candidates, guards, scores,
pool/RNG equivalence and split gates. Existing unit/build checks. Audit that
no production/src/Android/lock files changed. Timing counters are recorded;
runtime optimization/phone benchmarking happens only after all behavior gates.
Human flow-v4/v2 A/B, POCO and release-sized cohort remain open.
