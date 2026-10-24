import Phaser from "phaser";
import {
  fits,
  place,
  shapeById,
  type GameState,
  type Move,
} from "../core/rules";
import { COLORS, TILE_RECTS } from "./tiles";
type Impact = {
  placed: number[];
  cleared: number[];
  board: number[];
  started: number;
  lines: number;
  allClear: boolean;
};
export class BoardScene extends Phaser.Scene {
  private ink!: Phaser.GameObjects.Graphics;
  private state: GameState | null = null;
  private ghost: Move | null = null;
  private valid = true;
  private hint = false;
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
  preview(move: Move | null, valid = true, hint = false) {
    this.ghost = move;
    this.valid = valid;
    this.hint = hint;
    this.draw();
  }
  impact(
    placed: number[],
    cleared: number[],
    board: number[],
    lines: number,
    allClear = false,
  ) {
    this.impacts.push({
      placed,
      cleared,
      board,
      lines,
      allClear,
      started: performance.now(),
    });
    this.impacts = this.impacts.slice(-2);
  }
  stopEffects() {
    this.hint = false;
    this.impacts = [];
    this.draw();
  }
  update() {
    if (this.impacts.length || (this.hint && this.ghost && !this.calm))
      this.draw();
  }
  private tile(x: number, y: number, color: number, alpha = 1, scale = 1) {
    const g = this.ink;
    for (const q of TILE_RECTS) {
      g.fillStyle(q.color ?? color, q.alpha * alpha);
      g.fillRoundedRect(
        x + 32 + (q.x - 32) * scale,
        y + 32 + (q.y - 32) * scale,
        q.w * scale,
        q.h * scale,
        q.r * scale,
      );
    }
  }
  private draw() {
    if (!this.ink) return;
    const g = this.ink,
      now = performance.now();
    g.clear();
    this.impacts = this.impacts.filter(
      (e) => now - e.started < (this.calm ? 180 : 500),
    );
    for (let i = 0; i < 64; i++) {
      const x = (i % 8) * 64,
        y = Math.floor(i / 8) * 64;
      g.fillStyle(0x211c16);
      g.fillRoundedRect(x + 3, y + 3, 58, 58, 8);
      g.fillStyle((i + Math.floor(i / 8)) % 2 ? 0x393229 : 0x3c352b);
      g.fillRoundedRect(x + 4, y + 6, 56, 54, 7);
      g.lineStyle(1, 0xba8050, 0.13);
      g.lineBetween(x + 12, y + 59, x + 53, y + 59);
      const color = this.state?.board[i];
      if (color) {
        const hit = [...this.impacts]
          .reverse()
          .find((e) => e.placed.includes(i));
        const t = hit ? (now - hit.started) / 140 : 1;
        const scale =
          !this.calm && t < 1
            ? 1 + -Math.sin(t * Math.PI * 2) * 0.13 * (1 - t)
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
          g.lineStyle(
            3,
            ok ? 0xffedab : 0xff6554,
            this.hint && !this.calm ? 0.75 + 0.25 * Math.sin(now / 180) : 1,
          );
          g.strokeRoundedRect(px + 4, py + 4, 56, 56, 8);
          if (!ok) {
            g.lineBetween(px + 20, py + 20, px + 44, py + 44);
            g.lineBetween(px + 44, py + 20, px + 20, py + 44);
          }
        }
      }
    }
    let particlesLeft = 120;
    for (const e of this.impacts) {
      const age = now - e.started;
      if (e.allClear && !this.calm) {
        const t = age / 500;
        g.lineStyle(7, 0xffe09b, Math.max(0, 1 - t) * 0.55);
        g.strokeRoundedRect(
          4 + t * 10,
          4 + t * 10,
          504 - t * 20,
          504 - t * 20,
          12,
        );
      }
      if (!this.calm && !e.lines && age < 140)
        for (const i of e.placed) {
          const t = age / 140;
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
        const delay = this.calm ? 0 : ((i % 8) + Math.floor(i / 8)) * 5;
        const t = Math.max(0, (age - delay) / (this.calm ? 180 : 380));
        const x = (i % 8) * 64,
          y = Math.floor(i / 8) * 64;
        if (t < (this.calm ? 1 : 0.45) && !this.state?.board[i]) {
          this.tile(
            x,
            y,
            COLORS[e.board[i] || 1]!,
            Math.max(0, 1 - t / (this.calm ? 1 : 0.45)),
            1 + (this.calm ? 0 : t * 0.35),
          );
          g.fillStyle(
            0xfff5cc,
            this.calm
              ? 0
              : Math.max(0, Math.sin((t / 0.45) * Math.PI)) *
                  (e.lines > 1 ? 0.65 : 0.4),
          );
          g.fillRoundedRect(x + 4, y + 4, 56, 56, 8);
        }
        if (this.calm || t <= 0.12 || t >= 1) continue;
        for (
          let p = 0;
          p < (e.lines >= 3 ? 4 : e.lines === 2 ? 3 : 2) && particlesLeft > 0;
          p++, particlesLeft--
        ) {
          const angle = i * 2.4 + (p * Math.PI) / 2,
            travel = (t - 0.12) * (35 + p * 15 + e.lines * 6);
          const px = x + 32 + Math.cos(angle) * travel,
            py = y + 32 + Math.sin(angle) * travel + t * t * 45;
          const size = (1 - t) * (p === 0 ? 14 : 9);
          g.fillStyle(p % 2 ? 0xffefae : COLORS[e.board[i] || 1]!, 1 - t);
          g.fillRoundedRect(px - size / 2, py - size / 2, size, size, 2);
        }
        g.lineStyle(2, 0xffdf75, (1 - t) * (e.lines > 1 ? 0.35 : 0.15));
        g.strokeCircle(x + 32, y + 32, 10 + t * 30);
      }
    }
  }
}
