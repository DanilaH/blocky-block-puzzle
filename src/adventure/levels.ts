import {
  type Level,
  type Piece,
  type ObjectCell,
  type GoalKind,
  validateLevel,
} from "./core";
import type { Move } from "../core/rules";
const piece = (shapeId: string, color = 1): Piece => ({
  shapeId,
  color,
  used: false,
});
function make(
  index: number,
  title: string,
  lesson: string,
  rows: [number, number[]][],
  objects: ObjectCell[],
  iceCells: [number, number][],
  shapes: string[],
  solution: Move[],
  goals: Partial<Record<GoalKind, number>>,
): Level {
  const board = Array<number>(64).fill(0),
    ice = Array<number>(64).fill(0);
  for (const [y, gaps] of rows)
    for (let x = 0; x < 8; x++)
      if (!gaps.includes(x)) board[y * 8 + x] = (y % 4) + 1;
  for (const o of objects) if (o.kind === "lock") board[o.cell] = 0;
  for (const [cell, hp] of iceCells) ice[cell] = hp;
  const trays: Piece[][] = [];
  for (let i = 0; i < shapes.length; i += 3)
    trays.push(
      Array.from({ length: 3 }, (_, j) =>
        piece(shapes[i + j] ?? "S1-0", ((i + j) % 4) + 1),
      ),
    );
  return {
    id: `cove-${index}`,
    version: 1,
    rulesVersion: "adventure-v1",
    chapterId: "cove",
    title,
    lesson,
    board,
    ice,
    objects,
    trays,
    goals,
    moveLimit: null,
    reward: `cove/picture/${index}/v1`,
    solution,
  };
}
const gem = (cell: number): ObjectCell => ({
  cell,
  id: `gem-${cell}`,
  kind: "gem",
});
const key = (cell: number): ObjectCell => ({
  cell,
  id: `key-${cell}`,
  kind: "key",
});
const lock = (cell: number, threshold = 1): ObjectCell => ({
  cell,
  id: `lock-${cell}`,
  kind: "lock",
  threshold,
  open: false,
});
const m = (slot: number, x: number, y: number): Move => ({ slot, x, y });
export const LEVELS: Level[] = [
  make(
    1,
    "Коралловый берег",
    "Заполни линию с кристаллами — они отправятся в цель.",
    [
      [2, [3, 4]],
      [4, [5, 6, 7]],
      [6, [0, 1]],
    ],
    [gem(17), gem(22), gem(33), gem(50)],
    [],
    ["I2-0", "I3-0", "I2-0"],
    [m(0, 3, 2), m(1, 5, 4), m(2, 0, 6)],
    { gem: 4 },
  ),
  make(
    2,
    "Хрустальная вода",
    "Лёд с двумя слоями нужно очистить дважды. Пустую клетку можно заполнить снова.",
    [
      [3, [3, 4]],
      [5, [5, 6, 7]],
    ],
    [gem(26), gem(41)],
    [
      [26, 2],
      [27, 1],
      [41, 1],
    ],
    ["I2-0", "I4-0", "I4-0", "I3-0", "I2-0", "S1-0"],
    [m(0, 3, 3), m(1, 0, 3), m(2, 4, 3), m(0, 5, 5)],
    { gem: 2, ice: 3 },
  ),
  make(
    3,
    "Секрет бухты",
    "Собери ключ. Затем заполни линию с открытым сундуком.",
    [
      [2, [6, 7]],
      [5, [3, 4, 5]],
    ],
    [key(17), lock(42)],
    [],
    ["I2-0", "I3-0", "L3-0"],
    [m(0, 6, 2), m(1, 3, 5)],
    { key: 1, gem: 1 },
  ),
  make(
    4,
    "Ключ подо льдом",
    "Сначала расколи лёд над ключом. Сундук откроется, но сокровище нужно забрать линией.",
    [
      [1, [3, 4]],
      [4, [5, 6, 7]],
      [6, [0, 1]],
    ],
    [key(10), lock(33), gem(53)],
    [
      [10, 2],
      [53, 1],
    ],
    ["I2-0", "I4-0", "I4-0", "I3-0", "I2-0", "L3-2"],
    [m(0, 3, 1), m(1, 0, 1), m(2, 4, 1), m(0, 5, 4), m(1, 0, 6)],
    { key: 1, gem: 2, ice: 2 },
  ),
  make(
    5,
    "Свет маяка",
    "Два ключа откроют оба сундука. Собери все кристаллы и зажги маяк!",
    [
      [1, [5, 6, 7]],
      [3, [0, 1]],
      [5, [4, 5]],
      [6, [4, 5]],
    ],
    [key(9), key(27), lock(41, 2), lock(49, 2), gem(13), gem(29)],
    [
      [9, 2],
      [27, 1],
      [29, 1],
    ],
    ["I3-0", "I4-0", "I4-0", "I2-0", "O2-0", "L3-0"],
    [m(0, 5, 1), m(1, 0, 1), m(2, 4, 1), m(0, 0, 3), m(1, 4, 5)],
    { key: 2, gem: 4, ice: 3 },
  ),
];
export function levelFor(id: string, version = 1) {
  const l = LEVELS.find((l) => l.id === id && l.version === version);
  if (!l) throw Error("Unsupported campaign level");
  return l;
}
export function validateLevels() {
  for (const l of LEVELS) validateLevel(l);
}
