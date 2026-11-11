import { SHAPES, fits, place, type Board } from "../../src/core/rules";
import type { Operation } from "../../src/core/director-search";
import type { rewardDirectorDeal } from "../../src/core/reward-director";
import { verifyRewardDeal } from "./verify-reward-deal";

/** Verify the new constructor through public rules, independently of its mask
 * transitions, ranking, endpoint search and choice of candidate. */
export function verifyConstructiveDeal(
  board: Board,
  d: ReturnType<typeof rewardDirectorDeal>,
) {
  const result = verifyRewardDeal(board, d);
  let constructionProofs = 0;
  function replay(route: Operation[]) {
    let b = board,
      earned = false;
    for (const op of route) {
      const shape = SHAPES[op.shape];
      if (!shape || !fits(b, shape, op.x, op.y))
        throw Error("Illegal constructive route");
      b = place(b, shape, op.x, op.y).board;
      earned ||= b.every((c) => !c);
    }
    return { board: b, earned };
  }
  for (const c of d.diagnostic.construction ?? []) {
    if (c.path.length !== 3) throw Error("Incomplete constructed tray");
    if (replay(c.path).earned !== c.earned)
      throw Error("False immediate construction reward");
    const bag = c.path
      .map((o) => o.shape)
      .sort((a, b) => a - b)
      .join();
    for (const proof of c.completions) {
      if (proof.via.length !== 3 || !proof.tail.length || proof.tail.length > 3)
        throw Error("Invalid construction horizon");
      if (
        proof.via
          .map((o) => o.shape)
          .sort((a, b) => a - b)
          .join() !== bag
      )
        throw Error("Construction changes the issued shapes");
      const end = replay([...proof.via, ...proof.tail]);
      if (end.board.some(Boolean)) throw Error("False constructive payoff");
      constructionProofs++;
    }
  }
  return { ...result, constructionProofs };
}
