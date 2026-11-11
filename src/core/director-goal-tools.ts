import {SHAPES,type Move} from './rules';
import {POP,catalog,occupied,canPlace,transition,proveIds,type WorkBudget,type Operation,type Rows} from './director-search';

const permutations = [
  [0, 1, 2],
  [0, 2, 1],
  [1, 0, 2],
  [1, 2, 0],
  [2, 0, 1],
  [2, 1, 0],
];
const extendedRewardOrders=new Map<number,number[][]>();
export type DirectorNode = {
  rows: Rows;
  path: Operation[];
  lines: number;
  clears: number;
  value: number;
};
export function directorBeam(options:{rows:Rows;meter:WorkBudget;rank:number[];reverse:boolean;allow:(shape:number,depth:number)=>boolean;score:(node:DirectorNode,depth:number)=>number;width?:number;work?:number;depths?:1|2|3;key?:(node:DirectorNode)=>string}){
  const {rows,meter,rank,reverse,allow,score,width=4,work=14000,depths=3,key}=options;
  const maxWork=Math.min(meter.ceiling,meter.used+work);
  let current:DirectorNode[]=[{rows,path:[],lines:0,clears:0,value:0}],final:DirectorNode[]=[];
  for(let depth=0;depth<depths;depth++){
    const perDepth=Math.floor((maxWork-meter.used)/(depths-depth)),depthEnd=meter.used+perDepth,children=new Map<string,DirectorNode>();
    for(let pi=0;pi<current.length;pi++){
      const parent=current[pi]!,parentEnd=meter.used+Math.floor((depthEnd-meter.used)/(current.length-pi)),cap=meter.ceiling;
      meter.ceiling=Math.min(cap,parentEnd);
      outer:for(const id of rank){
        if(!allow(id,depth))continue;
        const ops=catalog()[id]!;
        for(let k=0;k<ops.length;k++){
          const op=ops[reverse?ops.length-1-k:k]!,fits=canPlace(parent.rows,op,meter);
          if(fits===null)break outer;if(!fits)continue;
          const next=transition(parent.rows,op,meter);if(!next)break outer;
          const child:DirectorNode={rows:next.rows,path:[...parent.path,op],lines:parent.lines+next.lines,clears:parent.clears+Number(next.clear),value:0};
          child.value=score(child,depth);const stateKey=key?key(child):child.rows.join(',');
          if((children.get(stateKey)?.value??-Infinity)<child.value)children.set(stateKey,child);
        }
      }
      meter.ceiling=cap;
    }
    const ranked=[...children.values()].sort((a,b)=>b.value-a.value);if(!ranked.length)break;
    current=ranked.slice(0,width);if(depth===depths-1)final=ranked;
  }
  return final;
}

/** Complete tail proof; a missed target is unknown only if the meter exhausted. */
export function proveRewardTail(rows:Rows,ids:number[],meter:WorkBudget,alreadyReward=false){
  let exhausted=false;
  function visit(board:Rows,left:number[],reward:boolean,path:Operation[]):Operation[]|null{
    if(!left.length)return reward?path:null;
    for(let i=0;i<left.length;i++)for(const op of !reward&&left.length===1?lastRewardCandidates(board,left[i]!):catalog()[left[i]!]!){
      const fits=canPlace(board,op,meter);if(fits===null){exhausted=true;return null;}if(!fits)continue;
      const next=transition(board,op,meter);if(!next){exhausted=true;return null;}
      const result=visit(next.rows,left.filter((_,j)=>j!==i),reward||next.clear,[...path,op]);if(result)return result;if(exhausted)return null;
    }
    return null;
  }
  const path=visit(rows,[...ids],alreadyReward,[]);
  return {path,status:path?'found' as const:exhausted?'unknown' as const:'unsolvable' as const};
}
export function boardGeometry(rows: Rows) {
  let edges = 0,
    holes = 0,
    fullness = 0;
  for (let y = 0; y < 8; y++) {
    const row = rows[y]!,
      empty = ~row & 255;
    fullness += POP[row]! ** 2;
    edges += POP[(row ^ (row << 1)) & 255]! + POP[row ^ (rows[y + 1] ?? 0)]!;
    const near =
      ((empty << 1) |
        (empty >> 1) |
        (~(rows[y - 1] ?? 255) & 255) |
        (~(rows[y + 1] ?? 255) & 255)) &
      255;
    holes += POP[empty & ~near]!;
  }
  for (let x = 0; x < 8; x++) {
    let n = 0;
    for (const row of rows) n += Number(!!(row & (1 << x)));
    fullness += n * n;
  }
  return { edges, holes, fullness, occupied: occupied(rows) };
}
let targets: { rows: Rows; area: number }[] | undefined;
function clearTargets() {
  if (targets) return targets;
  targets = [];
  for (let r = 0; r < 256; r++)
    for (let c = 0; c < 256; c++) {
      const n = POP[r]! + POP[c]!;
      if (!n || n > 4) continue;
      const rows = Array.from({ length: 8 }, (_, y) =>
        r & (1 << y) ? 255 : c,
      );
      targets.push({ rows, area: occupied(rows) });
    }
  targets.sort(
    (a, b) =>
      a.area - b.area ||
      (a.rows.join(",") < b.rows.join(",")
        ? -1
        : a.rows.join(",") > b.rows.join(",")
          ? 1
          : 0),
  );
  return targets;
}

let covering: Operation[][] | undefined;
function goalCovering() {
  if (covering) return covering;
  covering = Array.from({ length: 64 }, () => []);
  for (const ops of catalog())
    for (const op of ops)
      for (let y = 0; y < 8; y++) {
        for (let bits = op.rows[y]!; bits; bits &= bits - 1) {
          const x = 31 - Math.clz32(bits & -bits);
          covering[y * 8 + x]!.push(op);
        }
      }
  return covering;
}
const lastPieceIndex = new Map<number, Operation[]>();
function coverCell(shape: number, cell: number) {
  const key = shape * 64 + cell;
  let ops = lastPieceIndex.get(key);
  if (!ops) {
    ops = goalCovering()[cell]!.filter((o) => o.shape === shape);
    lastPieceIndex.set(key, ops);
  }
  return ops;
}
function lastRewardCandidates(rows: Rows, shape: number) {
  const y = rows.findIndex((r) => r !== 0);
  if (y < 0) return [];
  const x = 31 - Math.clz32(rows[y]! & -rows[y]!),
    rowHole = ~rows[y]! & 255;
  const columnHole = rows.findIndex((r) => !(r & (1 << x)));
  if (!rowHole || columnHole < 0) return catalog()[shape]!;
  const holeX = 31 - Math.clz32(rowHole & -rowHole);
  // To erase this occupied cell, the last piece must complete its row or
  // column. Each has an empty cell that the piece must cover. This index is
  // exhaustive (<=18 origins), unlike a heuristic target-class cutoff.
  return [
    ...new Set([
      ...coverCell(shape, y * 8 + holeX),
      ...coverCell(shape, columnHole * 8 + x),
    ]),
  ];
}
/** A target-class miss is unknown. The route is replayed, including early clears. */
export function finishGoal(rows: Rows, meter: WorkBudget, rank: number[], allowed?:ReadonlySet<number>):Operation[]|null {
  const count = occupied(rows),
    priority = new Map(rank.map((id, i) => [id, i]));
  const byCell = goalCovering().map((ops) =>
    (allowed?ops.filter(o=>allowed.has(o.shape)):[...ops]).sort((a, b) => priority.get(a.shape)! - priority.get(b.shape)!),
  );
  let answer: Operation[] | null = null,
    exhausted = false;
  function visit(missing: Rows, path: Operation[]): boolean {
    const left = occupied(missing),
      remaining = 3 - path.length;
    if (!left) {
      if (remaining) return false;
      for (const order of permutations) {
        let board = rows;
        const route: Operation[] = [];
        let valid = true;
        for (const i of order) {
          const op = path[i]!,
            fits = canPlace(board, op, meter);
          if (fits === null) {
            exhausted = true;
            return false;
          }
          if (!fits) {
            valid = false;
            break;
          }
          const next = transition(board, op, meter);
          if (!next) {
            exhausted = true;
            return false;
          }
          board = next.rows;
          route.push(op);
        }
        if (valid && occupied(board) === 0) {
          answer = route;
          return true;
        }
      }
      return false;
    }
    if (!remaining || left < remaining || left > remaining * 9) return false;
    const y = missing.findIndex((r) => r !== 0),
      x = 31 - Math.clz32(missing[y]! & -missing[y]!);
    for (const op of byCell[y * 8 + x]!) {
      if (!meter.spend()) {
        exhausted = true;
        return false;
      }
      const size = SHAPES[op.shape]!.cells.length;
      if (
        size > left - (remaining - 1) ||
        left - size > (remaining - 1) * 9 ||
        op.rows.some((r, y) => (r & missing[y]!) !== r)
      )
        continue;
      if (
        visit(
          missing.map((r, y) => r & ~op.rows[y]!),
          [...path, op],
        )
      )
        return true;
      if (exhausted) return false;
    }
    return false;
  }
  for (const target of clearTargets()) {
    if (!meter.spend()) break;
    const deficit = target.area - count;
    if (
      deficit < 3 ||
      deficit > 27 ||
      rows.some((r, y) => (r & target.rows[y]!) !== r)
    )
      continue;
    if (
      visit(
        target.rows.map((r, y) => r & ~rows[y]!),
        [],
      )
    )
      return answer;
    if (exhausted) break;
  }
  return null;
}

/** v4: an exact cover may pay off in ONE or TWO moves, with the rest of the
 * tray filled afterwards. A bounded miss never certifies impossibility. */
export function shortReward(rows:Rows,meter:WorkBudget,rank:number[],maxPieces=3,minPieces=1):Operation[]|null {
  if(!Number.isInteger(maxPieces)||maxPieces<1||maxPieces>6||!Number.isInteger(minPieces)||minPieces<1||minPieces>maxPieces)throw Error('Invalid reward horizon');
  if(!occupied(rows))return null;
  const priority=new Map(rank.map((id,i)=>[id,i]));
  const covering=goalCovering().map(ops=>[...ops].sort((a,b)=>priority.get(a.shape)!-priority.get(b.shape)!));
  function orders(n:number):number[][] {
    if(n===1)return [[0]];if(n===2)return [[0,1],[1,0]];if(n===3)return permutations;
    const cached=extendedRewardOrders.get(n);if(cached)return cached;
    const result:number[][]=[];
    const visit=(prefix:number[],left:number[])=>{if(!left.length){result.push(prefix);return;}for(const i of left)visit([...prefix,i],left.filter(j=>j!==i));};
    visit([],Array.from({length:n},(_,i)=>i));extendedRewardOrders.set(n,result);return result;
  }
  const envelopes=new Map<string,{rows:Rows;area:number}>();
  // Minimal line envelopes in both orientations; unlike finishGoal this is
  // deliberately an incomplete class, so a miss remains unknown. Indexing it
  // avoids scanning thousands of unrelated four-line targets per endpoint.
  for(let transposed=0;transposed<2;transposed++)for(let selected=0;selected<256;selected++){
    if(!meter.spend())return null;
    let other=0;
    for(let y=0;y<8;y++)for(let x=0;x<8;x++)if(rows[y]!&(1<<x)){
      const a=transposed?x:y,b=transposed?y:x;if(!(selected&(1<<a)))other|=1<<b;
    }
    const r=transposed?other:selected,c=transposed?selected:other;
    const target=Array.from({length:8},(_,y)=>r&(1<<y)?255:c),area=occupied(target);
    if(area>occupied(rows)&&area-occupied(rows)<=maxPieces*9)envelopes.set(target.join(),{rows:target,area});
  }
  const targets=[...envelopes.values()].sort((a,b)=>a.area-b.area);
  let answer:Operation[]|null=null,exhausted=false;
  function visit(missing:Rows,path:Operation[],pieces:number):boolean {
    const left=occupied(missing),remaining=pieces-path.length;
    if(!left){
      if(remaining)return false;
      for(const order of orders(pieces)){
        let b=rows;const route:Operation[]=[];let valid=true;
        for(const i of order){
          const op=path[i]!,fits=canPlace(b,op,meter);
          if(fits===null){exhausted=true;return false;}if(!fits){valid=false;break;}
          const next=transition(b,op,meter);if(!next){exhausted=true;return false;}b=next.rows;route.push(op);
        }
        if(valid&&!occupied(b)){answer=route;return true;}
      }
      return false;
    }
    if(!remaining||left<remaining||left>remaining*9)return false;
    const y=missing.findIndex(r=>r!==0),x=31-Math.clz32(missing[y]!&-missing[y]!);
    for(const op of covering[y*8+x]!){
      if(!meter.spend()){exhausted=true;return false;}
      const size=SHAPES[op.shape]!.cells.length;
      if(size>left-(remaining-1)||left-size>(remaining-1)*9||op.rows.some((r,y)=>(r&missing[y]!)!==r))continue;
      if(visit(missing.map((r,y)=>r&~op.rows[y]!),[...path,op],pieces))return true;
      if(exhausted)return false;
    }
    return false;
  }
  // Try the shortest class first; a target requiring three exact placements
  // cannot consume the allowance before an obvious one-piece completion.
  for(let pieces=minPieces;pieces<=maxPieces;pieces++)for(const target of targets){
    if(!meter.spend())return null;
    const deficit=target.area-occupied(rows);
    if(deficit<pieces||deficit>pieces*9||rows.some((r,y)=>(r&target.rows[y]!)!==r))continue;
    if(visit(target.rows.map((r,y)=>r&~rows[y]!),[],pieces))return answer;
    if(exhausted)return null;
  }
  return null;
}

/** A deliberately small reward class for evaluating many plausible endpoints.
 * Fill the occupied rows or occupied columns in at most three placements.
 * Failure means this class was not found, never that all-clear is impossible.
 * The target, exact cover and replay all share the caller's work meter. */
let exactRewardPieces: Map<string, Operation> | undefined;
export function compactReward(rows: Rows, meter: WorkBudget, rank: number[]): Operation[] | null {
  if (!occupied(rows)) return null;
  let columns = 0;
  for (const r of rows) columns |= r;
  const targets = [rows.map(r => r ? 255 : 0), Array<number>(8).fill(columns)]
    .map(target => target.map((r, y) => r & ~rows[y]!))
    .filter(missing => occupied(missing) > 0 && occupied(missing) <= 27)
    .sort((a, b) => occupied(a) - occupied(b));
  const priority = new Map(rank.map((id, i) => [id, i]));
  const byCell = goalCovering();
  exactRewardPieces ??= new Map(catalog().flat().map(op => [op.rows.join(), op]));
  let answer: Operation[] | null = null, exhausted = false;
  function replay(path: Operation[]) {
    const orders = path.length === 1 ? [[0]] : path.length === 2 ? [[0, 1], [1, 0]] : permutations;
    for (const order of orders) {
      let b = rows, valid = true;
      const route: Operation[] = [];
      for (const i of order) {
        const op = path[i]!, fits = canPlace(b, op, meter);
        if (fits === null) { exhausted = true; return false; }
        if (!fits) { valid = false; break; }
        const next = transition(b, op, meter);
        if (!next) { exhausted = true; return false; }
        b = next.rows; route.push(op);
      }
      if (valid && !occupied(b)) { answer = route; return true; }
    }
    return false;
  }
  function visit(missing: Rows, path: Operation[], pieces: number): boolean {
    const left = occupied(missing), remaining = pieces - path.length;
    if (!left) return remaining === 0 && replay(path);
    if (!remaining || left < remaining || left > remaining * 9) return false;
    if (remaining === 1) {
      if (!meter.spend()) { exhausted = true; return false; }
      const op = exactRewardPieces!.get(missing.join());
      return !!op && replay([...path, op]);
    }
    const y = missing.findIndex(r => r !== 0), x = 31 - Math.clz32(missing[y]! & -missing[y]!);
    const options = byCell[y * 8 + x]!.filter(op => {
      // Charge every candidate considered, including geometric rejections.
      if (!meter.spend()) { exhausted = true; return false; }
      const size = SHAPES[op.shape]!.cells.length;
      return size <= left - remaining + 1 && left - size <= (remaining - 1) * 9 &&
        op.rows.every((r, i) => (r & missing[i]!) === r);
    }).sort((a, b) => priority.get(a.shape)! - priority.get(b.shape)!);
    if (exhausted) return false;
    for (const op of options) {
      if (visit(missing.map((r, i) => r & ~op.rows[i]!), [...path, op], pieces)) return true;
      if (exhausted) return false;
    }
    return false;
  }
  for (let pieces = 1; pieces <= 3; pieces++) for (const missing of targets) {
    if (!meter.spend()) return null;
    if (visit(missing, [], pieces)) return answer;
    if (exhausted) return null;
  }
  return null;
}

export type DecisionCertificate =
  | { kind: "slot-order"; forbiddenOrder: number[] }
  | { kind: "placement" | "reward-choice"; badFirst: Move; goodFirst: Move };
/** Certify an actual restriction, never classify an exhausted branch as failure. */
export function decisionCertificate(
  rows: Rows,
  path: Operation[],
  meter: WorkBudget,
): DecisionCertificate | null {
  const ids = path.map((o) => o.shape),
    positiveOrder = [0, 1, 2];
  let witnessed = rows,
    reward = false;
  for (const op of path) {
    const next = transition(witnessed, op, meter);
    if (!next) return null;
    witnessed = next.rows;
    reward ||= next.clear;
  }
  const first = path[0]!,
    good = transition(rows, first, meter);
  if (!good) return null;
  const value = (r: Rows, lines: number) => {
    const g = boardGeometry(r);
    return lines * 200 - g.occupied * 2 - g.edges - g.holes * 20;
  };
  const goodValue = value(good.rows, good.lines),
    options: { op: Operation; slot: number; next: Rows; value: number }[] = [],
    seen = new Set<string>();
  for (let slot = 0; slot < 3; slot++)
    for (const op of catalog()[ids[slot]!]!) {
      const key = op.shape + ":" + op.x + "," + op.y;
      if (seen.has(key)) continue;
      seen.add(key);
      const fits = canPlace(rows, op, meter);
      if (fits === null) break;
      if (!fits || (slot === 0 && op.x === first.x && op.y === first.y))
        continue;
      const next = transition(rows, op, meter);
      if (!next) break;
      if (next.clear) continue;
      const score = value(next.rows, next.lines);
      if (score >= goodValue - 12)
        options.push({ op, slot, next: next.rows, value: score });
    }
  options.sort((a, b) => b.value - a.value);
  function rewardRoute(
    board: Rows,
    left: number[],
  ): "found" | "unknown" | "unsolvable" {
    if (!left.length) return "unsolvable";
    for (let i = 0; i < left.length; i++)
      for (const op of left.length === 1
        ? lastRewardCandidates(board, left[i]!)
        : catalog()[left[i]!]!) {
        const fits = canPlace(board, op, meter);
        if (fits === null) return "unknown";
        if (!fits) continue;
        const next = transition(board, op, meter);
        if (!next) return "unknown";
        if (next.clear) return "found";
        const status = rewardRoute(
          next.rows,
          left.filter((_, j) => i !== j),
        );
        if (status !== "unsolvable") return status;
      }
    return "unsolvable";
  }
  if (reward)
    for (const c of options.slice(0, 5)) {
      const status = rewardRoute(
        c.next,
        ids.filter((_, i) => i !== c.slot),
      );
      if (status === "unsolvable") {
        const survival=proveIds(c.next,ids.filter((_,i)=>i!==c.slot),meter);
        if(survival.status==='unknown')return null;
        return {
          kind: survival.path?'reward-choice':'placement',
          badFirst: { slot: c.slot, x: c.op.x, y: c.op.y },
          goodFirst: { slot: 0, x: first.x, y: first.y },
        };
      }
      if (status === "unknown") return null;
    }
  function fixed(
    board: Rows,
    order: number[],
    depth = 0,
  ): "found" | "unknown" | "unsolvable" {
    if (depth === 3) return "found";
    for (const op of catalog()[ids[order[depth]!]!]!) {
      const fits = canPlace(board, op, meter);
      if (fits === null) return "unknown";
      if (!fits) continue;
      const next = transition(board, op, meter);
      if (!next) return "unknown";
      const status = fixed(next.rows, order, depth + 1);
      if (status !== "unsolvable") return status;
    }
    return "unsolvable";
  }
  // Start with the reverse witnessed order; an easy success need not consume
  // the whole diagnostic allowance before looking for a bad placement.
  const old = meter.ceiling;
  meter.ceiling = Math.min(old, meter.used + 1600);
  for (const order of [permutations[5]!, permutations[2]!, permutations[3]!]) {
    if (order.join() === positiveOrder.join()) continue;
    if (fixed(rows, order) === "unsolvable") {
      meter.ceiling = old;
      return { kind: "slot-order", forbiddenOrder: order };
    }
    if (meter.used >= meter.ceiling) break;
  }
  meter.ceiling = old;
  for (const c of options.slice(0, 5)) {
    const result = proveIds(
      c.next,
      ids.filter((_, i) => i !== c.slot),
      meter,
    );
    if (result.status === "unsolvable")
      return {
        kind: "placement",
        badFirst: { slot: c.slot, x: c.op.x, y: c.op.y },
        goodFirst: { slot: 0, x: first.x, y: first.y },
      };
    if (result.status === "unknown") break;
  }
  return null;
}

