import { applyMove, type GameState } from "../../src/core/rules";
import { createProfile, validProfile } from "../../src/core/profile";
import {
  stateHash,
  type PlayRecord,
  type PlayEvent,
} from "../../src/platform/play-capture";
/** Validate before analysis. No partially accepted report after a broken replay. */
export function replayRecord(input: unknown) {
  const record = input as PlayRecord;
  if (
    !record ||
    record.schema !== "blocky-play-v1" ||
    record.origin !== "manual-capture" ||
    !Array.isArray(record.events) ||
    record.events.length > 12000
  )
    throw Error("Unsupported recording");
  let state: GameState | null = null,
    wall = -1,
    active = -1,
    segment = 0;
  const moves: {
    event: Extract<PlayEvent, { kind: "move" }>;
    before: GameState;
    after: GameState;
    lines: number;
    allClear: boolean;
    activeIntervalMs: number;
    segment: number;
  }[] = [];
  const segments: {
    index: number;
    reason: string;
    initialMoves: number;
    gameId: string;
  }[] = [];
  for (const e of record.events) {
    if (
      !e ||
      !Number.isFinite(e.wallMs) ||
      !Number.isFinite(e.activeMs) ||
      e.wallMs < 0 ||
      e.activeMs < 0 ||
      e.wallMs < wall ||
      e.activeMs < active ||
      e.activeMs > e.wallMs + 1
    )
      throw Error("Invalid recording clock");
    const elapsed = active < 0 ? 0 : e.activeMs - active;
    wall = e.wallMs;
    active = e.activeMs;
    if (e.kind === "checkpoint") {
      // A checkpoint validates a game, not its missing historical profile.
      // Its synthetic best must satisfy the profile's best >= score invariant.
      if (!validProfile({ ...createProfile(e.state), best: e.state?.score }))
        throw Error("Invalid checkpoint");
      state = structuredClone(e.state);
      segment++;
      segments.push({
        index: segment,
        reason: e.reason,
        initialMoves: state.moves,
        gameId: state.gameId,
      });
    } else if (e.kind === "move") {
      if (
        !state ||
        stateHash(state) !== e.before ||
        typeof e.hinted !== "boolean" ||
        !e.move
      )
        throw Error("Broken recording chain");
      const result = applyMove(state, e.move, state.revision);
      if (!result || stateHash(result.state) !== e.after)
        throw Error("Move replay mismatch");
      moves.push({
        event: e,
        before: state,
        after: result.state,
        lines: result.lines,
        allClear: result.allClear,
        activeIntervalMs: elapsed,
        segment,
      });
      state = result.state;
    } else throw Error("Unknown recording event");
  }
  return { record, segments, moves, final: state };
}
