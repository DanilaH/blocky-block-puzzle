import { expect, it } from "vitest";
import { syntheticContexts } from "../scripts/assist-budget/contexts";
const contexts=syntheticContexts();
import { applyMove, newGame, replayDecision, place, shapeById, type GameState, type DealerVersion } from "../src/core/rules";
import type { DecisionTrace } from "../src/core/decision-trace";
import { PlayCapture, stateHash } from "../src/platform/play-capture";
import { createProfile } from "../src/core/profile";
import { replayRecord } from "../scripts/calibration/replay";

it("opted-in trace preserves every frozen 0.67 role/context and exact GameState hash", () => {
  for (const c of contexts) {
    const b = c.before as any;
    let trace: DecisionTrace | undefined;
    const plain = b.initialSeed !== undefined
      ? newGame(b.initialSeed, c.expected.gameId, b.policy as DealerVersion)
      : applyMove(b.state as GameState, b.move, b.state.revision)!.state;
    const traced = b.initialSeed !== undefined
      ? newGame(b.initialSeed, c.expected.gameId, b.policy as DealerVersion, t => {trace=t;})
      : (()=>{const r=applyMove(b.state,b.move,b.state.revision,true)!;trace=r.decision;return r.state;})();
    expect(plain).toEqual(c.expected); expect(traced).toEqual(plain);
    expect(stateHash(traced)).toBe(stateHash(plain)); expect(trace).toBeDefined();
    expect(replayDecision(trace!)).toEqual(trace);
    expect(trace!.finalPieceIds).toEqual(traced.tray.map(s => s.shapeId));
    let board = trace!.input.board;
    const used = new Set<number>();
    for (const m of trace!.validation.witness) {
      expect(used.has(m.slot)).toBe(false);used.add(m.slot);
      board = place(board,shapeById(trace!.finalPieceIds[m.slot]!),m.x,m.y).board;
    }
    expect(used.size).toBe(3);
  }
});

it("failed trace consumer cannot affect a new game, and disabled traces add no move field", () => {
  expect(newGame(7601001,"trace","director-v2",()=>{throw Error("consumer");})).toEqual(newGame(7601001,"trace","director-v2"));
  let trace!:DecisionTrace;const g=newGame(7601001,"trace","director-v2",t=>{trace=t;});
  const r=applyMove(g,trace.validation.witness[0]!,g.revision)!;
  expect("decision" in r).toBe(false);
});

it("trace reflects final composition override and rejects changed reasons/RNG/final IDs", () => {
  let changed:DecisionTrace|undefined;
  for (const c of contexts) {
    const b=c.before as any;if(!b.state)continue;
    const t=applyMove(b.state,b.move,b.state.revision,true)!.decision!;
    if(t.overrides.some(x=>x.reason==="equal-area-proven"))changed=t;
  }
  expect(changed).toBeDefined();expect(changed!.initialPieceIds).not.toEqual(changed!.finalPieceIds);
  for(const mutate of [(t:DecisionTrace)=>{t.source="different";},(t:DecisionTrace)=>{t.seedAfter++;},(t:DecisionTrace)=>{t.finalPieceIds[0]="S1-0";}]) {
    const bad=structuredClone(changed!);mutate(bad);expect(()=>replayDecision(bad)).toThrow("Decision replay mismatch");
  }
});

it("the existing capture publishes decision only with a committed move and replays old/new schemas", () => {
  let trace!:DecisionTrace;let g=newGame(7601002,"capture","director-v2",t=>{trace=t;});
  const capture=new PlayCapture(()=>0);capture.start(g);
  for(const move of trace.validation.witness){const r=applyMove(g,move,g.revision,true)!;capture.record(g,move,r.state,r.decision);g=r.state;}
  const record=capture.snapshot();expect(record.events.some(e=>e.kind==="move"&&e.decision)).toBe(true);
  expect(replayRecord(record).final).toEqual(g);
  const old=structuredClone(record);for(const e of old.events)delete e.decision;
  expect(replayRecord(old).final).toEqual(g);
  const bad=structuredClone(record);const event=bad.events.find(e=>e.decision)!;event.decision!.source="changed";
  expect(()=>replayRecord(bad)).toThrow("Decision replay mismatch");
});

it("new-game checkpoint keeps its exact initial decision and metadata does not become game state", () => {
  const before=createProfile(newGame(1,"before","director-v2"));
  let trace!:DecisionTrace;const game=newGame(7601003,"after","composition-v2",t=>{trace=t;});
  const capture=new PlayCapture(()=>0);capture.start(before.game);
  capture.committed(before,{...before,game},trace);
  const record=capture.snapshot();expect(record.events.at(-1)!.decision).toEqual(trace);
  expect(replayRecord(record).final).toEqual(game);expect("decision" in game).toBe(false);
});
