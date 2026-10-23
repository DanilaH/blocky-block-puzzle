import Phaser from "phaser";
import {
  fits,
  place,
  shapeById,
  type GameState,
  type Move,
} from "../core/rules";
export const COLORS = [
  0x42291e, 0xffa51f, 0xef4940, 0x91cf38, 0x31bde0, 0xffd449, 0xe969a0,
];
type Impact = {
  placed: number[];
  cleared: number[];
  board: number[];
  started: number;
  lines: number;
};
export class BoardScene extends Phaser.Scene {
  private ink!: Phaser.GameObjects.Graphics;
  private state: GameState | null = null;
  private ghost: Move | null = null;
  private valid = true;
  private impacts: Impact[] = [];
  calm = false;
  constructor() {
    super("board");
  }
  create() {
    this.ink = this.add.graphics();
    this.draw();
  }
  setState(state: GameState) {
    if (this.state?.gameId !== state.gameId) this.impacts = [];
    this.state = state;
    this.ghost = null;
    this.draw();
  }
  preview(move: Move | null, valid = true) {
    this.ghost = move;
    this.valid = valid;
    this.draw();
  }
  impact(placed: number[], cleared: number[], board: number[], lines: number) {
    this.impacts.push({
      placed,
      cleared,
      board,
      lines,
      started: performance.now(),
    });
    this.impacts = this.impacts.slice(-3);
  }
  stopEffects() {
    this.impacts = [];
    this.draw();
  }
  update() {
    if (this.impacts.length) this.draw();
  }
  private tile(x: number, y: number, color: number, alpha = 1, scale = 1) {
    const g = this.ink,
      w = 56 * scale,
      left = x + 32 - w / 2,
      top = y + 30 - w / 2;
    g.fillStyle(0x160c07, alpha * 0.65);
    g.fillRoundedRect(left, top + 6, w, w, 9);
    g.fillStyle(color, alpha);
    g.fillRoundedRect(left, top, w, w, 9);
    g.fillStyle(0x491800, alpha * 0.24);
    g.fillRoundedRect(left + 3, top + w - 12, w - 6, 10, 5);
    g.fillStyle(0xffffff, alpha * 0.32);
    g.fillRoundedRect(left + 4, top + 3, w - 8, w * 0.35, 6);
    g.fillStyle(0xffffff, alpha * 0.48);
    g.fillRoundedRect(left + 9, top + 5, w * 0.42, 3, 2);
    g.lineStyle(1.5, 0xfff1ca, alpha * 0.35);
    g.strokeRoundedRect(left + 1, top + 1, w - 2, w - 2, 8);
  }
  private draw() {
    if (!this.ink) return;
    const g = this.ink,
      now = performance.now();
    g.clear();
    this.impacts = this.impacts.filter(
      (e) => now - e.started < (this.calm ? 200 : 850),
    );
    for (let i = 0; i < 64; i++) {
      const x = (i % 8) * 64,
        y = Math.floor(i / 8) * 64;
      g.fillStyle(0x201109);
      g.fillRoundedRect(x + 3, y + 3, 58, 58, 8);
      g.fillStyle((i + Math.floor(i / 8)) % 2 ? 0x452c20 : 0x4b3022);
      g.fillRoundedRect(x + 4, y + 6, 56, 54, 7);
      g.lineStyle(1, 0xba8050, 0.13);
      g.lineBetween(x + 12, y + 59, x + 53, y + 59);
      const color = this.state?.board[i];
      if (color) {
        const hit = [...this.impacts]
          .reverse()
          .find((e) => e.placed.includes(i));
        const t = hit ? (now - hit.started) / 280 : 1;
        const scale =
          !this.calm && t < 1
            ? 1 + Math.sin(t * Math.PI * 2) * 0.1 * (1 - t)
            : 1;
        this.tile(x, y, COLORS[color]!, 1, scale);
      }
    }
    if (this.state && this.ghost) {
      const s = this.state.tray[this.ghost.slot];
      if (s) {
        const shape = shapeById(s.shapeId),
          { x, y } = this.ghost;
        const ok = this.valid && fits(this.state.board, shape, x, y);
        if (ok)
          for (const i of place(this.state.board, shape, x, y).cells) {
            g.fillStyle(0xffdb70, 0.45);
            g.fillRoundedRect(
              (i % 8) * 64 + 3,
              Math.floor(i / 8) * 64 + 3,
              58,
              58,
              8,
            );
          }
        for (const [dx, dy] of shape.cells) {
          const px = (x + dx) * 64,
            py = (y + dy) * 64;
          if (px < 0 || py < 0 || px >= 512 || py >= 512) continue;
          if (ok) this.tile(px, py, COLORS[s.color]!, 0.5);
          g.lineStyle(3, ok ? 0xffedab : 0xff6554, 1);
          g.strokeRoundedRect(px + 4, py + 4, 56, 56, 8);
          if (!ok) {
            g.lineBetween(px + 20, py + 20, px + 44, py + 44);
            g.lineBetween(px + 44, py + 20, px + 20, py + 44);
          }
        }
      }
    }
    for (const e of this.impacts) {
      const age = now - e.started;
      if (!this.calm && !e.lines && age < 280)
        for (const i of e.placed) {
          const t = age / 280;
          g.lineStyle(3 * (1 - t), 0xffdb87, (1 - t) * 0.65);
          g.strokeRoundedRect(
            (i % 8) * 64 + 4 - t * 7,
            Math.floor(i / 8) * 64 + 4 - t * 7,
            56 + t * 14,
            56 + t * 14,
            9,
          );
        }
      for (const i of e.cleared) {
        const delay = this.calm ? 0 : ((i % 8) + Math.floor(i / 8)) * 12;
        const t = Math.max(0, (age - delay) / (this.calm ? 200 : 620));
        const x = (i % 8) * 64,
          y = Math.floor(i / 8) * 64;
        if (t < 0.28 && !this.state?.board[i]) {
          this.tile(
            x,
            y,
            COLORS[e.board[i] || 1]!,
            1 - t * 2,
            1 + (this.calm ? 0 : t * 0.35),
          );
          g.fillStyle(0xfff5cc, Math.sin((t / 0.28) * Math.PI) * 0.85);
          g.fillRoundedRect(x + 4, y + 4, 56, 56, 8);
        }
        if (this.calm || t <= 0.12 || t >= 1) continue;
        for (let p = 0; p < 4; p++) {
          const angle = i * 2.4 + (p * Math.PI) / 2,
            travel = (t - 0.12) * (45 + p * 13);
          const px = x + 32 + Math.cos(angle) * travel,
            py = y + 32 + Math.sin(angle) * travel + t * t * 45;
          const size = (1 - t) * (p === 0 ? 10 : 6);
          g.fillStyle(p % 2 ? 0xffefae : COLORS[e.board[i] || 1]!, 1 - t);
          g.fillRoundedRect(px - size / 2, py - size / 2, size, size, 2);
        }
        g.lineStyle(2, 0xffdf75, (1 - t) * 0.5);
        g.strokeCircle(x + 32, y + 32, 10 + t * 30);
      }
    }
  }
}
