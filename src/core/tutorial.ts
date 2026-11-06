import { applyMove, newGame, type Move } from "./rules";

export const LESSON_MOVES: readonly Move[] = [
  { slot: 0, x: 3, y: 4 },
  { slot: 1, x: 6, y: 4 },
  { slot: 2, x: 2, y: 2 },
];
export const LESSON_TEXT = [
  "1 / 3 · Перенесите блок в светлый контур",
  "2 / 3 · Заполните строку двумя блоками",
  "3 / 3 · Используйте последнюю фигуру",
  "Новая тройка готова. Теперь играем!",
];
// Separate deterministic practice board: never changes the player's game or best.
export function lessonGame(step: number) {
  let game = newGame(731, "tutorial-v1");
  game.tray = [
    { shapeId: "S1-0", color: 1, used: false },
    { shapeId: "I2-0", color: 4, used: false },
    { shapeId: "S1-0", color: 2, used: false },
  ];
  for (const x of [0, 1, 2, 4, 5]) game.board[32 + x] = 3;
  for (let i = 0; i < Math.min(step, 3); i++)
    game = applyMove(game, LESSON_MOVES[i]!, game.revision)!.state;
  return game;
}
