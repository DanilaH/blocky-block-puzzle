# D80 — exact current-tray reward reachability, engineering diagnostic

Baseline: local D79 commit adfeced. C1 remains rejected. No new dealer,
coefficient change, runtime integration, control cohort or APK in this step.

Question: do real late C1/bounded engineering boards admit ANY full clear
within at most three placements from the entire current catalogue? Unlike a
beam miss, an exhaustive negative can distinguish horizon impossibility from
the old target-class/search-budget limitations.

Inputs: every D79 engineering C1/bounded deal with 12 <= move < final moves
(31 boards from four seeds). Do not open D79 holdout for this diagnosis.
Allow any shape/orientation at each placement, repeats, any order, intermediate
line clears. No figure-area restriction. This is more permissive than C1.

Method: enumerate every stable board that one catalogue placement clears to
empty. The final filled board is a union of full rows and columns. Each such
row/column must intersect the new placement, otherwise it was already full in
the stable predecessor. Enumerate subsets of the placement's row/column
support, subtract the placement, reject unstable predecessors. Keep all final
actions. Join this exact one-step reverse index with every legal prefix of
length zero, one and two. No beam, static four-line cutoff, or runtime budget.
Negative results are exhaustive only for this horizon/catalogue/input.

Keep one witness per represented unordered bag (up to 32 stored examples per
board); count these witness bags and the exact shortest reward horizon. For a
reward before the third placement, add legal singletons to complete the tray;
this does not enumerate all possible filler bags. Accessibility is
examined separately on stored witnesses: existing bounded top-five choices
within its original score window, with exact uniform branch probabilities.
This models that bot only, not human noticeability. Never infer breadth from
the constructor's witness alone. Report incomplete-tray failures separately.

Independent checks: cell-based Python rules; exact forward C++ last-move
enumeration on every unique penultimate board; public TypeScript fits/place for all stored
witnesses; tiny-catalogue forward exhaustive oracle (positive and negative,
including intermediate clears). Source/input digests and operation counts.
Any interrupted search is unknown, not impossible. Offline compute cost is
not an Android runtime benchmark. No relaxation of prior acceptance gates.

Decision boundary: if the horizon is impossible on most examples, another
ranker cannot repair those exact boards in one tray. This does not prove a
global director necessary, deny longer local recovery, or show human fun.
If routes exist, assess their accessibility before proposing a new policy.

Implementation note (after first primary result, before verification): the
independent full forward enumeration uses C++, while Python supplies the
separate cell-rule oracle. A direct Python enumeration of billions of leaves
would add avoidable verification time. Horizon, inputs, catalogue and decision
boundary are unchanged. No new candidate or acceptance cohort is introduced.
