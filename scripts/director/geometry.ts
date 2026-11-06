import type { Board } from "../../src/core/rules";
/** Shape-independent empty-space measurements; no dealer or player assumptions. */
export function geometry(board: Board) {
  if (board.length !== 64) throw Error("Expected 8x8 board");
  const visited = new Set<number>(),
    regions: number[] = [];
  for (let i = 0; i < 64; i++)
    if (!board[i] && !visited.has(i)) {
      const queue = [i];
      visited.add(i);
      for (let j = 0; j < queue.length; j++) {
        const p = queue[j]!,
          x = p % 8,
          y = Math.floor(p / 8);
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const nx = x + dx!,
            ny = y + dy!,
            q = ny * 8 + nx;
          if (
            nx >= 0 &&
            nx < 8 &&
            ny >= 0 &&
            ny < 8 &&
            !board[q] &&
            !visited.has(q)
          ) {
            visited.add(q);
            queue.push(q);
          }
        }
      }
      regions.push(queue.length);
    }
  let squares = 0,
    largestRectangle = 0;
  const heights = Array<number>(8).fill(0);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      heights[x] = board[y * 8 + x] ? 0 : heights[x]! + 1;
      if (
        y < 7 &&
        x < 7 &&
        ![y * 8 + x, y * 8 + x + 1, (y + 1) * 8 + x, (y + 1) * 8 + x + 1].some(
          (i) => board[i],
        )
      )
        squares++;
    }
    for (let x = 0; x < 8; x++) {
      let h = 8;
      for (let end = x; end < 8; end++) {
        h = Math.min(h, heights[end]!);
        largestRectangle = Math.max(largestRectangle, h * (end - x + 1));
      }
    }
  }
  return {
    occupied: board.filter(Boolean).length,
    regions: regions.length,
    isolated: regions.filter((n) => n === 1).length,
    largestRegion: Math.max(0, ...regions),
    squares,
    largestRectangle,
  };
}
