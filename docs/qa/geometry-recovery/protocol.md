# D81: geometry recovery, engineering probe only

Frozen after an exploratory positive-path run, before player-continuation runs.
Pilot: width96/horizon9 found routes on29/31 D80 inputs. These are the same
engineering positions, not fresh holdout. No coefficient tuning or acceptance
claim follows from this pilot.

Question: can nonempty late C1 boards be cleared through multiple trays with
ordinary line clears, and do those trays remain useful after bounded choices?
No new runtime dealer, global phases, saved target or APK in this experiment.

Inputs: all31 D80 engineering positions, full31-orientation catalogue, repeats
allowed. Native deterministic beam width96, horizon9. Potential is exactly
`-200*minimumRowColumnCover -4*occupied +sum(rowCount²+columnCount²)`;
tie break: more cumulative lines, then lexicographic operation path. Unique
boards retain first encountered route. Exact final-move reverse index; a beam
miss remains UNKNOWN. The search does not establish minimum distance.

1. Save every positive route, all transitions, line events and tray boundaries.
   Complete the fixed9-placement sequence with legal singles after the witnessed
   reward; disclose this reserve. Rebuilt partial trays are padded only to3.
   Tray slots always use permutation[2,0,1] of chronological witness actions.
   Replaying the witness measures existence only.
2. Use unchanged D79 boundedOptions, no access to the route. Five fixed
   quantiles:0,.25,.5,.75,.999999, reused at every choice. Duplicated actions
   stay in denominators and unique action/state counts are reported separately.
3. Paired conditions use the identical initial tray: fixed sequence of witness
   trays versus rebuilding from the actual board at each completed tray.
   Actual horizon is9 placements. Rebuild horizons6/3; no mid-tray changes.
   Unknown builder result is a stopped episode, not an impossible board.
   Initial unknowns remain explicit; never exclude them from overall coverage.
4. At horizon3 the builder uses exhaustive first/two-move prefixes plus the
   exact final-move index. Report this exactness separately from the beam.
5. Report first/second/third-tray lines and rewards, clearing moves, longest
   dry gap (including leading/trailing gaps), deaths, unknown construction,
   root-option diversity, shape distribution and work. Separate all31 input
   coverage from conditional29-input behavior. Five correlated quantiles are
   not independent games or human probabilities.

Validation: independent Python cell rules for every witness and actual move;
public TypeScript fits/place for the same events; replay the unchanged bounded
player; rerun native queries and compare routes/counters; small exhaustive
cell-domain comparison for exact short horizons and positive-path soundness.
Existing unit/build checks and hashes establish production source unchanged.

No human-feel, performance, phone or general-balance claim is possible here.
Even complete success would require a bounded local implementation, fresh
complete-game controls and human observation before an APK change. Failure
must not be renamed as a successful local dealer or repaired with new weights
inside this frozen probe.
