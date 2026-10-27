import Phaser from "phaser";
import {
  fits,
  place,
  shapeById,
  type GameState,
  type Move,
} from "../core/rules";
import {
  Celebration,
  clearWaveDelay,
  contactScale,
  waveOrigins,
} from "./feedback";
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
  energy: number;
  origins: ReturnType<typeof waveOrigins>;
};
export class BoardScene extends Phaser.Scene {
  private ink!: Phaser.GameObjects.Graphics;
  private state: GameState | null = null;
  private ghost: Move | null = null;
  private previewEcho: { cells: number[]; color: number; at: number } | null =
    null;
  private valid = true;
  private hint = false;
  private pending: number[] = [];
  private impacts: Impact[] = [];
  calm = false;
  private celebration = new Celebration();
  get intensity() {
    return this.calm ? 0 : this.celebration.level(performance.now());
  }
  constructor() {
    super("board");
  }
  create() {
    this.ink = this.add.graphics();
    this.draw();
  }
  setState(state: GameState) {
    if (this.state?.gameId !== state.gameId) {
      this.impacts = [];
      this.celebration.reset();
    }
    this.previewEcho = null;
    this.state = state;
    this.ghost = null;
    this.draw();
  }
  preview(move: Move | null, valid = true, hint = false) {
    if (
      this.ghost &&
      this.state &&
      !this.calm &&
      !this.hint &&
      (!move ||
        this.ghost.x !== move.x ||
        this.ghost.y !== move.y ||
        this.ghost.slot !== move.slot)
    ) {
      const slot = this.state.tray[this.ghost.slot];
      if (
        slot &&
        this.valid &&
        fits(
          this.state.board,
          shapeById(slot.shapeId),
          this.ghost.x,
          this.ghost.y,
        )
      )
        this.previewEcho = {
          cells: place(
            this.state.board,
            shapeById(slot.shapeId),
            this.ghost.x,
            this.ghost.y,
          ).cells,
          color: COLORS[slot.color]!,
          at: performance.now(),
        };
    }
    this.ghost = move;
    this.valid = valid;
    this.hint = hint;
    this.draw();
  }
  pendingPlacement(cells: number[]) {
    this.pending = cells;
    this.draw();
  }
  impact(
    placed: number[],
    cleared: number[],
    board: number[],
    lines: number,
    allClear = false,
  ) {
    if (lines && !this.calm) this.celebration.add(lines, performance.now());
    this.impacts.push({
      energy: this.intensity,
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
      origins: waveOrigins(placed),
      started: performance.now(),
    });
    this.impacts = this.impacts.slice(-4);
  }
  stopEffects() {
    this.pending = [];
    this.previewEcho = null;
    this.celebration.reset();
    this.hint = false;
    this.impacts = [];
    this.draw();
  }
  update() {
    if (
      this.previewEcho ||
      this.intensity > 0 ||
      this.impacts.length ||
      (this.hint && this.ghost && !this.calm)
    )
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
      (e) => now - e.started < (this.calm ? 180 : e.allClear ? 1500 : 1250),
    );
    for (let i = 0; i < 64; i++) {
      const x = (i % 8) * 64,
        y = Math.floor(i / 8) * 64;
      g.fillStyle((i + Math.floor(i / 8)) % 2 ? 0x34353a : 0x38393e);
      g.fillRect(x, y, 64, 64);
      g.lineStyle(1, 0x28292d, 0.35);
      g.strokeRect(x, y, 64, 64);
      const color = this.state?.board[i];
      if (color) {
        const hit = [...this.impacts]
          .reverse()
          .find((e) => e.placed.includes(i));
        const scale = hit && !this.calm ? contactScale(now - hit.started) : 1;
        this.tile(x, y, COLORS[color]!, 1, scale);
      }
    }
    if (this.previewEcho) {
      const alpha = 1 - (now - this.previewEcho.at) / 140;
      if (alpha <= 0 || this.calm) this.previewEcho = null;
      else
        for (const i of this.previewEcho.cells) {
          g.fillStyle(this.previewEcho.color, alpha * 0.55);
          g.fillRect((i % 8) * 64 + 2, Math.floor(i / 8) * 64 + 2, 60, 60);
        }
    }
    if (this.state && this.ghost && !this.pending.length) {
      const s = this.state.tray[this.ghost.slot];
      if (s) {
        const shape = shapeById(s.shapeId),
          { x, y } = this.ghost;
        const ok = this.valid && fits(this.state.board, shape, x, y);
        if (ok)
          for (const i of place(this.state.board, shape, x, y).cells) {
            const px = (i % 8) * 64,
              py = Math.floor(i / 8) * 64;
            this.tile(px, py, COLORS[s.color]!, 1);
            g.lineStyle(12, COLORS[s.color]!, 0.25);
            g.strokeRect(px + 3, py + 3, 58, 58);
            g.lineStyle(3, 0xffffff, 0.95);
            g.strokeRect(px + 3, py + 3, 58, 58);
            g.fillStyle(0xffffff, 0.18);
            g.fillRect(px + 5, py + 5, 54, 54);
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
    for (const i of this.pending) {
      const x = (i % 8) * 64,
        y = Math.floor(i / 8) * 64;
      g.fillStyle(0xd4dbea, 0.1);
      g.fillRect(x + 4, y + 4, 56, 56);
      g.lineStyle(2, 0xd4dbea, 0.8);
      g.strokeRect(x + 5, y + 5, 54, 54);
    }
    const energy = this.intensity;
    if (energy > 0) {
      for (let ring = 0; ring < 4; ring++) {
        g.lineStyle(2 + ring * 4, 0xffd67b, energy * (0.24 - ring * 0.05));
        g.strokeRoundedRect(3, 3, 506, 506, 8);
      }
    }
    let particlesLeft = 160;
    for (const e of this.impacts) {
      const age = now - e.started;
      // Celebrate the empty board after the last clear, never over a new move.
      if (
        e.allClear &&
        !this.calm &&
        age >= 400 &&
        !this.state?.board.some(Boolean)
      ) {
        const t = (age - 400) / 400;
        g.lineStyle(3 + 3 * (1 - t), 0xffe2a0, Math.sin(t * Math.PI) * 0.85);
        g.strokeRoundedRect(
          5 + t * 6,
          5 + t * 6,
          502 - t * 12,
          502 - t * 12,
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
        const delay = this.calm
          ? 0
          : clearWaveDelay(i, e.rows, e.columns, e.origins);
        const t = Math.max(0, (age - delay) / (this.calm ? 180 : 300));
        const x = (i % 8) * 64,
          y = Math.floor(i / 8) * 64;
        // New placements always cover old cosmetic fragments.
        if (this.state?.board[i]) continue;
        if (this.calm) {
          if (t < 1) this.tile(x, y, COLORS[e.board[i] || 1]!, 1 - t);
          continue;
        }
        const elapsed = age - delay;
        const collapse = Math.min(1, Math.max(0, elapsed / 170));
        if (collapse < 1) {
          this.tile(x, y, COLORS[e.board[i] || 1]!, 1, 1 - collapse ** 3);
          g.fillStyle(0xffffff, Math.sin(collapse * Math.PI) * 0.85);
          g.fillRoundedRect(x + 2, y + 3, 60, 58, 4);
        }
        // Broad white afterimage belongs to cleared cells, never a new placement.
        if (elapsed > 90 && elapsed < 900) {
          const fade = (elapsed - 90) / 810;
          g.fillStyle(0xffffff, 0.62 * (1 - fade) ** 2);
          if (e.rows.includes(Math.floor(i / 8)))
            g.fillRect(x, y + 4 + fade * 18, 64, 56 - fade * 36);
          if (e.columns.includes(i % 8))
            g.fillRect(x + 4 + fade * 18, y, 56 - fade * 36, 64);
          g.fillStyle(0xffffff, 0.7 * (1 - fade) ** 2);
          if (e.rows.includes(Math.floor(i / 8))) g.fillRect(x, y + 29, 64, 6);
          if (e.columns.includes(i % 8)) g.fillRect(x + 29, y, 6, 64);
        }
        if (
          elapsed >= 170 &&
          elapsed < 1100 &&
          e.energy > 0.5 &&
          i % 2 === 0 &&
          particlesLeft-- > 0
        ) {
          const f = (elapsed - 170) / 930;
          const sx = x + 32 + Math.sin(i * 4) * f * 55;
          const sy = y + 32 - f * (45 + (i % 5) * 12);
          const r = (4 + e.energy * 6) * Math.sin(Math.PI * f);
          g.fillStyle(0xffe8a2, (1 - f) * 0.8);
          g.fillPoints(
            Array.from(
              { length: 8 },
              (_, n) =>
                new Phaser.Math.Vector2(
                  sx + Math.cos((n * Math.PI) / 4) * (n % 2 ? r * 0.28 : r),
                  sy + Math.sin((n * Math.PI) / 4) * (n % 2 ? r * 0.28 : r),
                ),
            ),
            true,
          );
        }
        if (elapsed < 100 || elapsed > 650) continue;
        const flight = (elapsed - 100) / 550;
        const horizontal = e.rows.includes(Math.floor(i / 8));
        for (let p = 0; p < 2 && particlesLeft > 0; p++, particlesLeft--) {
          const sign = p ? 1 : -1;
          const along = sign * (12 + flight * 48);
          const across = sign * Math.sin(flight * Math.PI) * (9 + (i % 3) * 5);
          const px = x + 32 + (horizontal ? along : across);
          const py = y + 32 + (horizontal ? across : along);
          const size = (p ? 5 : 8) * (1 - flight);
          g.fillStyle(COLORS[e.board[i] || 1]!, (1 - flight) ** 2);
          g.fillRect(px - size / 2, py - size / 2, size, size);
          g.lineStyle(2 * (1 - flight), 0xffffff, 0.8 * (1 - flight));
          g.lineBetween(
            px,
            py,
            px - (horizontal ? sign * 12 : 0),
            py - (horizontal ? 0 : sign * 12),
          );
        }
      }
      if (!this.calm && e.lines && age >= 40 && age < 300) {
        const distance = ((age - 40) / 28) * 64;
        for (let trail = 4; trail >= 0; trail--) {
          const d = distance - trail * 8;
          if (d < 0) continue;
          g.fillStyle(
            trail
              ? e.energy > 0.65
                ? COLORS[(trail % 6) + 1]!
                : COLORS[e.board[e.placed[0]!] || 1]!
              : 0xffffff,
            (1 - trail / 5) * 0.8,
          );
          for (const sign of [-1, 1]) {
            for (const row of e.rows) {
              const at = e.origins.rows[row]! * 64 + 32 + sign * d;
              if (at >= 0 && at <= 512)
                g.fillRect(
                  at - 8,
                  row * 64 + 10 + trail * 3,
                  16,
                  44 - trail * 6,
                );
            }
            for (const col of e.columns) {
              const at = e.origins.columns[col]! * 64 + 32 + sign * d;
              if (at >= 0 && at <= 512)
                g.fillRect(
                  col * 64 + 10 + trail * 3,
                  at - 8,
                  44 - trail * 6,
                  16,
                );
            }
          }
        }
      }
    }
  }
}
