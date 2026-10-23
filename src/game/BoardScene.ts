import Phaser from "phaser";
import {
  fits,
  place,
  shapeById,
  type GameState,
  type Move,
} from "../core/rules";
export const COLORS = [
  0x1b2737, 0x7694ff, 0xf1b96a, 0x6acfb2, 0xd68ecf, 0x6cbce4, 0xf18d7d,
];
export class BoardScene extends Phaser.Scene {
  private ink!: Phaser.GameObjects.Graphics;
  private state: GameState | null = null;
  private ghost: Move | null = null;
  private valid = true;
  private effect: { cells: number[]; started: number; color: number } | null =
    null;
  calm = false;
  constructor() {
    super("board");
  }
  create() {
    this.ink = this.add.graphics();
    this.draw();
  }
  setState(state: GameState) {
    this.state = state;
    this.ghost = null;
    this.draw();
  }
  preview(move: Move | null, valid = true) {
    this.ghost = move;
    this.valid = valid;
    this.draw();
  }
  flash(cells: number[], color: number) {
    this.effect = { cells, started: performance.now(), color };
  }
  update() {
    if (this.effect) this.draw();
  }
  private tile(x: number, y: number, size: number, color: number, alpha = 1) {
    const g = this.ink,
      gap = 3,
      r = 5;
    g.fillStyle(0x060b13, alpha * 0.65);
    g.fillRoundedRect(x + gap, y + gap + 3, size - 2 * gap, size - 2 * gap, r);
    g.fillStyle(color, alpha);
    g.fillRoundedRect(x + gap, y + gap, size - 2 * gap, size - 2 * gap - 2, r);
    g.fillStyle(0xffffff, alpha * 0.16);
    g.fillRoundedRect(x + gap + 3, y + gap + 2, size - 2 * gap - 6, 3, 1);
  }
  private draw() {
    if (!this.ink) return;
    const g = this.ink;
    g.clear();
    const size = 64;
    for (let i = 0; i < 64; i++) {
      const x = (i % 8) * size,
        y = Math.floor(i / 8) * size;
      g.fillStyle(COLORS[0]!);
      g.fillRoundedRect(x + 3, y + 3, size - 6, size - 6, 6);
      const color = this.state?.board[i];
      if (color) this.tile(x, y, size, COLORS[color]!);
    }
    if (this.state && this.ghost) {
      const s = this.state.tray[this.ghost.slot];
      if (s) {
        const shape = shapeById(s.shapeId),
          { x, y } = this.ghost;
        const ok = this.valid && fits(this.state.board, shape, x, y);
        if (ok) {
          for (const i of place(this.state.board, shape, x, y).cells) {
            g.fillStyle(0xe2ffe9, 0.2);
            g.fillRoundedRect(
              (i % 8) * size + 3,
              Math.floor(i / 8) * size + 3,
              size - 6,
              size - 6,
              5,
            );
          }
        }
        for (const [dx, dy] of shape.cells) {
          const px = (x + dx) * size,
            py = (y + dy) * size;
          if (px < 0 || py < 0 || px >= 512 || py >= 512) continue;
          g.lineStyle(3, ok ? 0xc7f7de : 0xf18d7d, 0.95);
          g.strokeRoundedRect(px + 4, py + 4, size - 8, size - 8, 5);
          if (ok) this.tile(px, py, size, COLORS[s.color]!, 0.35);
          else {
            g.lineBetween(px + 20, py + 20, px + 44, py + 44);
            g.lineBetween(px + 44, py + 20, px + 20, py + 44);
          }
        }
      }
    }
    if (this.effect) {
      const t = (performance.now() - this.effect.started) / 260;
      if (t >= 1) this.effect = null;
      else
        for (const i of this.effect.cells) {
          const x = (i % 8) * size + 32,
            y = Math.floor(i / 8) * size + 32;
          g.fillStyle(this.effect.color, (1 - t) * 0.8);
          g.fillRoundedRect(x - 27, y - 27, 54, 54, 5);
          if (!this.calm) {
            g.lineStyle(2, this.effect.color, (1 - t) * 0.6);
            g.strokeCircle(x, y, 14 + t * 25);
          }
        }
    }
  }
}
