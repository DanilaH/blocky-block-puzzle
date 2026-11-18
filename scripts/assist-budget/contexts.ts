import { ASSIST_RECIPES } from "../../tests/fixtures/assist-recipes";
import { newGame, applyMove, random, type Move } from "../../src/core/rules";
import { stateHash } from "../../src/platform/play-capture";
import { chooseMixed } from "../director/mixed-players";

/** Build disposable synthetic QA states from public seeds. No private files. */
export function syntheticContexts() {
  return ASSIST_RECIPES.map(r => {
    const id=`baseline-${r.style}-${r.seed}`;
    let g=newGame(r.seed,id,r.policy),player=(r.seed^0x85ebca6b)>>>0;
    let before: {initialSeed:number;policy:typeof r.policy} | {state:typeof g;move:Move} = {initialSeed:r.seed,policy:r.policy};
    while(g.moves<r.moves) {
      const roll=random(player);player=roll.state;
      const move=chooseMixed(g.board,g.tray,r.style,roll.value).move;
      if(!move)throw Error("Synthetic recipe lost its move");
      before={state:g,move};const next=applyMove(g,move,g.revision);
      if(!next)throw Error("Invalid synthetic recipe");g=next.state;
    }
    if(stateHash(g)!==r.hash)throw Error(`Frozen 0.67 context changed: ${r.key}`);
    return {key:r.key,before,expected:g};
  });
}
