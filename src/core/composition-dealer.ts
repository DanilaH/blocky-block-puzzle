import { SHAPES, type Board, type Move } from "./rules";
import { goalDirectorDeal, type GoalDirectorState } from "./goal-director";
import type { RhythmState } from "./rhythm";
import { WorkBudget, toRows, catalog, canPlace, transition, type Operation, type Rows } from "./director-search";
import { decisionCertificate } from "./director-goal-tools";

/** Frozen composition-v1: one equal-area slot, one common extra 12k budget.
 * v2's other two pieces, RNG, scoring and phase controller are retained. */
export function compositionDeal(board: Board, seed: number, moves = 0, rhythm?: RhythmState, saved?: GoalDirectorState) {
  const base = goalDirectorDeal(board, seed, moves, rhythm, saved);
  const meter = new WorkBudget(12000); meter.ceiling = meter.limit;
  const finish = (reason: string) => ({...base, composition: {reason, checks:meter.used, limit:meter.limit}});
  const small = (id: string) => ["L3", "T4", "SZ4"].includes(SHAPES.find(s=>s.id===id)!.family);
  if (base.tray.some(s=>small(s.shapeId))) return finish("already-diverse");
  const slots = base.tray.map((s,slot)=>({slot, shape:SHAPES.find(x=>x.id===s.shapeId)!})).filter(x=>[3,4].includes(x.shape.cells.length));
  if (!slots.length) return finish("no-equal-area-slot");
  let originalRows = toRows(board), originalLines = 0, originalClears = 0;
  for (const m of base.witness) {
    const id = SHAPES.findIndex(s=>s.id===base.tray[m.slot]!.shapeId);
    const op = catalog()[id]!.find(o=>o.x===m.x&&o.y===m.y)!;
    const next = transition(originalRows,op,meter)!;
    originalRows=next.rows; originalLines+=next.lines; originalClears+=Number(next.clear);
  }
  const support = ["payoff","relief","recovery"].includes(base.director.last);
  const requiredClears = support ? originalClears : 0;
  const recent = (rhythm?.recentBags ?? []).join(",").split(",");
  const count = (family:string) => recent.filter(f=>f===family).length;
  const alternatives = SHAPES.map((s,id)=>({s,id})).filter(x=>small(x.s.id)).sort((a,b)=>count(a.s.family)-count(b.s.family)||a.id-b.id);
  let unknown = false;
  for (const slot of slots) for (const alt of alternatives) {
    if (alt.s.cells.length !== slot.shape.cells.length) continue;
    const tray = base.tray.map((s,i)=>i===slot.slot?{...s,shapeId:alt.s.id}:s);
    const ids = tray.map(s=>SHAPES.findIndex(p=>p.id===s.shapeId));
    let path:Operation[]|null=null, witness:Move[]=[];
    function visit(rows:Rows,left:number[],ops:Operation[],steps:Move[],lines:number,clears:number):boolean {
      if (!left.length) {
        if (lines < originalLines || clears < requiredClears) return false;
        path=ops; witness=steps; return true;
      }
      for (const i of left) for (const op of catalog()[ids[i]!]!) {
        const fits=canPlace(rows,op,meter);
        if (fits===null) {unknown=true;return false;}
        if (!fits) continue;
        const next=transition(rows,op,meter);
        if (!next) {unknown=true;return false;}
        if (visit(next.rows,left.filter(j=>j!==i),[...ops,op],[...steps,{slot:i,x:op.x,y:op.y}],lines+next.lines,clears+Number(next.clear))) return true;
        if (unknown) return false;
      }
      return false;
    }
    visit(toRows(board),[0,1,2],[],[],0,0);
    if (path) {
      let certificate = base.diagnostic.certificate;
      if (certificate) {
        const next=decisionCertificate(toRows(board),path,meter);
        if (!next || next.kind !== certificate.kind) {
          if (meter.used>=meter.ceiling) return finish("budget");
          continue;
        }
        certificate = next.kind === "slot-order"
          ? {...next,forbiddenOrder:next.forbiddenOrder.map(i=>witness[i]!.slot)}
          : {...next,badFirst:{...next.badFirst,slot:witness[next.badFirst.slot]!.slot},goodFirst:{...next.goodFirst,slot:witness[next.goodFirst.slot]!.slot}};
      }
      return {...base,tray,witness,diagnostic:{...base.diagnostic,certificate},composition:{reason:"equal-area-proven",slot:slot.slot,from:slot.shape.id,to:alt.s.id,checks:meter.used,limit:meter.limit}};
    }
    if (unknown) return finish("budget");
  }
  return finish("no-role-proof");
}
