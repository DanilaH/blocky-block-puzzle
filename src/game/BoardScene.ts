import Phaser from "phaser";
import {
  fits,
  place,
  shapeById,
  type GameState,
  type Move,
} from "../core/rules";
import { COLORS, TILE_FACES } from "./tiles";
type Impact = {
  placed: number[];
  cleared: number[];
  board: number[];
  started: number;
  lines: number;
  allClear: boolean;
  rows: number[];
  columns: number[];
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
      rows: Array.from({ length: 8 }, (_, y) => y).filter((y) =>
        Array.from({ length: 8 }, (_, x) => y * 8 + x).every((i) =>
          cleared.includes(i),
        ),
      ),
      columns: Array.from({ length: 8 }, (_, x) => x).filter((x) =>
        Array.from({ length: 8 }, (_, y) => y * 8 + x).every((i) =>
          cleared.includes(i),
        ),
      ),
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
    for (const q of TILE_FACES) {
      g.fillStyle(q.color ?? color, q.alpha * alpha);
      g.fillPoints(
        q.points.map(
          ([px, py]) =>
            new Phaser.Math.Vector2(
              x + 32 + (px - 32) * scale,
              y + 32 + (py - 32) * scale,
            ),
        ),
        true,
      );
    }
  }

  private draw() {
    if (!this.ink) return;
    const g = this.ink,
      now = performance.now();
    g.clear();
    this.impacts = this.impacts.filter(
      (e) => now - e.started < (this.calm ? 180 : 600),
    );
    for (let i = 0; i < 64; i++) {
      const x = (i % 8) * 64,
        y = Math.floor(i / 8) * 64;
      g.fillStyle((i + Math.floor(i / 8)) % 2 ? 0x233366 : 0x25366b);
      g.fillRect(x, y, 64, 64);
      g.lineStyle(1, 0x15214b, 0.4);
      g.strokeRect(x, y, 64, 64);
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
            g.fillStyle(COLORS[s.color]!, 0.5);
            g.fillRoundedRect(
              (i % 8) * 64 + 1,
              Math.floor(i / 8) * 64 + 1,
              62,
              62,
              1,
            );
          }
        for (const [dx, dy] of shape.cells) {
          const px = (x + dx) * 64,
            py = (y + dy) * 64;
          if (px < 0 || py < 0 || px >= 512 || py >= 512) continue;
          if (ok) this.tile(px, py, COLORS[s.color]!, 0.5);
          g.lineStyle(
            3,
            ok ? 0xffffff : 0xff6554,
            this.hint && !this.calm ? 0.75 + 0.25 * Math.sin(now / 180) : 1,
          );
          g.strokeRoundedRect(px + 1, py + 1, 62, 62, 1);
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
        const t = age / 600;
        g.lineStyle(7, 0xffffff, Math.max(0, 1 - t) * 0.55);
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
          g.lineStyle(3 * (1 - t), 0xffffff, (1 - t) * 0.65);
          g.strokeRoundedRect(
            (i % 8) * 64 + 4 - t * 7,
            Math.floor(i / 8) * 64 + 4 - t * 7,
            56 + t * 14,
            56 + t * 14,
            1,
          );
        }
      for (const i of e.cleared) {
        const rowHit = e.rows.includes(Math.floor(i / 8)) ? i % 8 : Infinity;
        const colHit = e.columns.includes(i % 8) ? Math.floor(i / 8) : Infinity;
        const delay = this.calm ? 0 : (Math.min(rowHit, colHit) + 0.5) * 32;
        const t = Math.max(0, (age - delay) / (this.calm ? 180 : 300));
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
            0xffffff,
            this.calm
              ? 0
              : Math.max(0, Math.sin((t / 0.45) * Math.PI)) *
                  (e.lines > 1 ? 0.65 : 0.4),
          );
          g.fillRect(x + 1, y + 1, 62, 62);
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
          g.fillStyle(p % 2 ? 0xffffff : COLORS[e.board[i] || 1]!, 1 - t);
          g.fillRoundedRect(px - size / 2, py - size / 2, size, size, 2);
        }
      }
      if (!this.calm && e.lines && age < 330) {
        const head = age * 2;
        for (let trail = 7; trail >= 0; trail--) {
          const at = head - trail * 10;
          g.fillStyle(trail ? 0x97e6ff : 0xffffff, (1 - trail / 8) * 0.9);
          for (const row of e.rows) g.fillRect(at, row * 64 + 28, 14, 8);
          for (const col of e.columns) g.fillRect(col * 64 + 28, at, 8, 14);
        }
      }
    }
  }
}
