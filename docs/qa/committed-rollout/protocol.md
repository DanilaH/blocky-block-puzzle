# D84: commit the forecast continuation provider, frozen before collection

One change to D83 execution. Reuse its candidate pool,9-step forecasts, actors,
guards, scores and RNG handling byte-for-byte. Do not retune C1/v2/D83 or add
another reward constructor. Production/APK0.63 and historical data unchanged.

At a decision select with frozen D83 horizon9. On the next two completed-tray
refills issue unchanged v2, generated from actual board/history/RNG. Then
select again. An all-clear does not reset/cancel this three-tray schedule:
the D83 forecast already continues through rewards with actual v2 updates.
No coordinates, trays or presumed player path are cached for future use.
Players remain free to choose any move. Death stops naturally. The two-refill
counter is explicit offline policy state, not production save compatibility
and not a claim that this is a phase-free or globally necessary architecture.

Technical gate before fresh data: rerun every55 D83 matched hold-first/v2
audit case with this implementation. First choice remains the actual D83
choice. All actions, future trays, outcome and final state must equal held-v2
audit, including3301002/.125 reward at9. This is known-data regression only.
No outcome/threshold changes follow from it.

For every new decision context, fork the selected current tray and execute the
new continuation scheduler for at most9 moves using each frozen forecast
actor. With identical choices all events, issued future trays and final
pre-next-decision state must match the stored D83 forecast. This tests actual
schedule execution, not merely arithmetic score equivalence. Also check full
strong-game decision windows directly against forecast (exclude cap-short
windows; retain deaths). Random bounded play is not expected to match one
fixed quantile path. Consistency is necessary, not behavioral acceptance.

Fresh v2/bounded sources: development3441001–3441004 and
confirmation3461001–3461004. Snapshot at move12; stop at12/death, retain
missing/empty without replacement. These seeds have not been inspected.
Matched: every nonempty input, bounded.125/.375/.625/.875 and three; all
four modes (v2, short3 each refill, D83 replan9 each refill, D84 hold2),
max9 actual moves. Initial state, choice streams and first pool/RNG match.
Do not count technical known regressions in fresh success rates.

Complete-game pilot regardless of matched outcome: first2 seeds of each fresh
split, both bounded and three, all4 modes:32 runs, cap240. D78 playerSeed,
same exogenous roll stream per seed across modes. Cap means censored, not
completed. Duration/strong censoring alone are not defects; no forced losses.

Frozen behavior gates remain D83's, separately per fresh split: bounded matched
reward events >short and >=v2; at least half bounded full games earn all-clear
after move12; actual line rate >=95% v2 separately for bounded/three; strong
full-game all-clear rate0.03–0.10; repeated consecutive bag rate <=v2+.10.
Report hold versus D83 as well; merely beating D83 is insufficient. Include
ordinary/multiline clears, deaths, dry gaps, exposure, shape mix, censored
duration and selection/counter frequency. No changing gates after development.

Verification: public rules/player replay of source, all issued proofs, all
counterfactual/actual actions and held regressions; independent cell rules;
recompute schedule state and decisions; reuse frozen D83 proof machinery
without modifying its source/data. Existing unit/build; production157-file
audit. Full9-step safety for all human choices is not implied by4 actors.

Only if all behavior gates pass, inspect runtime work/cost and deployment
feasibility. The offline two-refill counter has no save migration yet. Phone,
human comparison and release-sized cohorts remain open. No new APK or claim
of human feel from this experiment alone. Ordinary Git only; no Git blob API,
base64 or chunked file transport.
