import { TILE_STUDY, TileStudySprites } from "./tile-study";
import { VfxSprites, VFX_KINDS } from "./vfx";
import { THEMES } from "./themes";
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
  onTexturesReady = () => {};
  private vfx?: VfxSprites;
  private study?: TileStudySprites;
  private bed?: Phaser.GameObjects.Graphics;
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
  private theme = 0;
  private themeAt = 0;
  private shade = 0x35363b;
  private fromShade = 0x35363b;
  private accent = 0xefaa39;
  private fromAccent = 0xefaa39;
  private sheen = 0;
  private fromSheen = 0;
  private defeatAt = 0;
  private defeatSoft = false;
  private praiseHit: { cells: number[]; at: number; strong: boolean } | null =
    null;
  setTheme(index: number, accent: string) {
    const color = parseInt(accent.slice(1), 16);
    if (index === this.theme && color === this.accent) return;
    this.fromShade = this.currentColor(this.fromShade, this.shade);
    this.fromAccent = this.currentColor(this.fromAccent, this.accent);
    this.fromSheen = this.materialLevel();
    this.theme = index;
    this.shade = THEMES[index]!.board;
    this.accent = color;
    this.themeAt = performance.now();
    this.sheen =
      index === 0
        ? 0
        : index === 5
          ? 0.8
          : index === 4
            ? 0.65
            : 0.35 + index * 0.035;
    this.draw();
  }
  private mix() {
    return Math.min(
      1,
      (performance.now() - this.themeAt) /
        (this.calm ? 250 : this.theme === 0 ? 1800 : 1000),
    );
  }
  private currentColor(a: number, b: number) {
    const t = this.mix();
    return (
      (((((a >> 16) & 255) * (1 - t) + ((b >> 16) & 255) * t) | 0) << 16) |
      (((((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t) | 0) << 8) |
      (((a & 255) * (1 - t) + (b & 255) * t) | 0)
    );
  }
  private materialLevel() {
    return this.fromSheen + (this.sheen - this.fromSheen) * this.mix();
  }
  praise(cells: number[], strong: boolean) {
    if (!this.calm) this.praiseHit = { cells, at: performance.now(), strong };
  }
  defeat(soft: boolean) {
    if (!this.calm) {
      this.defeatAt = performance.now();
      this.defeatSoft = soft;
    }
  }

  private celebration = new Celebration();
  get intensity() {
    return this.calm ? 0 : this.celebration.level(performance.now());
  }
  constructor() {
    super("board");
  }
  preload() {
    if (TILE_STUDY)
      for (let color = 1; color <= 6; color++)
        this.load.image(
          `study-${color}`,
          `assets/tile-study/${TILE_STUDY}-${color}.webp`,
        );
    for (const kind of VFX_KINDS)
      this.load.image(`vfx-${kind}`, `assets/vfx/${kind}.webp`);
  }
  create() {
    this.vfx = new VfxSprites(this);
    this.events.once("shutdown", () => this.vfx?.destroy());
    this.ink = this.add.graphics();
    if (TILE_STUDY) {
      this.bed = this.add.graphics().setDepth(0);
      this.ink.setDepth(1);
      this.study = new TileStudySprites(this);
      this.events.once("shutdown", () => this.study?.destroy());
    }
    this.onTexturesReady();
    this.draw();
  }
  setState(state: GameState) {
    if (this.state?.gameId !== state.gameId) {
      this.impacts = [];
      this.celebration.reset();
    }
    if (this.state?.status === "over" && state.status === "playing") {
      this.defeatAt = 0;
      if (!this.calm)
        this.praiseHit = {
          cells: state.board.map((v, i) => (v ? i : -1)).filter((i) => i >= 0),
          at: performance.now(),
          strong: true,
        };
    }
    if (this.state?.gameId !== state.gameId) this.defeatAt = 0;
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
    this.praiseHit = null;
    this.previewEcho = null;
    this.celebration.reset();
    this.hint = false;
    this.impacts = [];
    this.draw();
  }
  update() {
    if (
      this.mix() < 1 ||
      this.praiseHit ||
      (this.defeatAt > 0 && performance.now() - this.defeatAt < 900) ||
      this.previewEcho ||
      this.intensity > 0 ||
      this.impacts.length ||
      (this.hint && this.ghost && !this.calm)
    )
      this.draw();
  }
  private tile(x: number, y: number, color: number, alpha = 1, scale = 1) {
    if (this.study) {
      this.study.tile(x, y, color, alpha, scale);
      return;
    }
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
    const level = this.materialLevel();
    if (level > 0) {
      g.lineStyle(
        1 + level * 2,
        this.currentColor(this.fromAccent, this.accent),
        alpha * level * 0.75,
      );
      g.strokeRoundedRect(x + 4, y + 4, 56, 55, 5);
      g.fillStyle(0xffffff, alpha * level * 0.14);
      g.fillTriangle(x + 7, y + 7, x + 55, y + 7, x + 7, y + 43);
    }
  }

  private draw() {
    if (!this.ink) return;
    const g = this.ink,
      now = performance.now();
    g.clear();
    this.bed?.clear();
    this.study?.begin();
    this.vfx?.begin();
    if (this.praiseHit && now - this.praiseHit.at > 750) this.praiseHit = null;
    this.impacts = this.impacts.filter(
      (e) => now - e.started < (this.calm ? 180 : e.allClear ? 1500 : 1250),
    );
    for (let i = 0; i < 64; i++) {
      const x = (i % 8) * 64,
        y = Math.floor(i / 8) * 64;
      if (this.bed) {
        const bg = this.bed;
        bg.fillStyle(0xd5cfc3, 1);
        bg.fillRect(x, y, 64, 64);
        bg.fillStyle(0x8e877b, 0.23);
        bg.fillRoundedRect(x + 2, y + 3, 60, 60, 8);
        bg.lineStyle(1, 0xfffcf4, 0.48);
        bg.strokeRoundedRect(x + 2, y + 3, 60, 59, 8);
        bg.lineStyle(1, 0x766c5d, 0.15);
        bg.lineBetween(x + 10, y + 3, x + 54, y + 3);
        if (this.state?.board[i]) {
          bg.fillStyle(0x64594a, 0.20);
          bg.fillRoundedRect(x + 5, y + 8, 55, 54, 8);
        }
      } else {
        g.fillStyle(
          this.currentColor(this.fromShade, this.shade),
          (i + Math.floor(i / 8)) % 2 ? 1 : 0.94,
        );
        g.fillRect(x, y, 64, 64);
        g.lineStyle(1.5, 0x98a5b5, 0.16);
        g.strokeRect(x, y, 64, 64);
      }
      const color = this.state?.board[i];
      if (color) {
        const hit = [...this.impacts]
          .reverse()
          .find((e) => e.placed.includes(i));
        const scale = hit && !this.calm ? contactScale(now - hit.started) : 1;
        const neighbor = this.calm
          ? 0
          : Math.max(
              0,
              ...this.impacts.map((e) => {
                const t = (now - e.started) / 300;
                if (t >= 1) return 0;
                return e.placed.some(
                  (p) =>
                    Math.abs((p % 8) - (i % 8)) +
                      Math.abs(Math.floor(p / 8) - Math.floor(i / 8)) ===
                    1,
                )
                  ? Math.sin(t * Math.PI) * 0.025
                  : 0;
              }),
            );
        const loss = this.defeatAt
          ? Math.min(1, Math.max(0, (now - this.defeatAt - i * 4) / 500))
          : 0;
        this.tile(
          x,
          y + loss * 2,
          COLORS[color]!,
          1 - loss * (this.defeatSoft ? 0.12 : 0.35),
          scale * (1 - loss * 0.035 + neighbor),
        );
        if (this.praiseHit && this.praiseHit.cells.includes(i)) {
          const t = (now - this.praiseHit.at) / 700;
          if (t < 1) {
            g.lineStyle(5, 0xffffff, Math.sin(t * Math.PI) * 0.9);
            g.strokeRoundedRect(x + 5, y + 5, 54, 54, 6);
          }
        }
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
    const fx = this.vfx!;
    const accent = this.currentColor(this.fromAccent, this.accent);
    for (const e of this.impacts) {
      const age = now - e.started;
      // Celebrate the empty board after the last clear, never over a new move.
      if (
        e.allClear &&
        !this.calm &&
        age >= 400 &&
        age < 1000 &&
        !this.state?.board.some(Boolean)
      ) {
        const t = (age - 400) / 600;
        g.fillStyle(0xffeb8a, Math.sin(t * Math.PI) * 0.12);
        g.fillRect(0, 0, 512, 512);
        fx.stamp(
          "ring",
          256,
          256,
          130 + t * 620,
          130 + t * 620,
          (1 - t) * 0.8,
          accent,
          t * 0.15,
        );
        if (t < 0.55)
          fx.stamp(
            "flash",
            256,
            256,
            150 + t * 150,
            150 + t * 150,
            (1 - t / 0.55) * 0.8,
          );
        g.lineStyle(3 + 3 * (1 - t), 0xffe2a0, Math.sin(t * Math.PI) * 0.85);
        g.strokeRoundedRect(
          5 + t * 6,
          5 + t * 6,
          502 - t * 12,
          502 - t * 12,
          12,
        );
      }
      if (!this.calm && age < 240)
        for (const i of e.placed) {
          const t = age / 240;
          fx.stamp(
            "flash",
            (i % 8) * 64 + 48,
            Math.floor(i / 8) * 64 + 12,
            28 + t * 42,
            28 + t * 42,
            (1 - t) ** 1.5,
            0xffffff,
            -0.3,
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
        // Cell-local soft light preserves new placements placed during the tail.
        if (elapsed > 80 && elapsed < 1050) {
          const fade = (elapsed - 80) / 970;
          const alpha = 0.85 * (1 - fade) ** 1.6;
          if (e.rows.includes(Math.floor(i / 8)))
            fx.stamp("streak", x + 32, y + 32, 108, 250 - fade * 160, alpha);
          if (e.columns.includes(i % 8))
            fx.stamp(
              "streak",
              x + 32,
              y + 32,
              108,
              250 - fade * 160,
              alpha,
              0xffffff,
              Math.PI / 2,
            );
        }
        if (elapsed >= 70 && elapsed < 280) {
          const f = (elapsed - 70) / 210;
          fx.stamp(
            "flash",
            x + 32,
            y + 32,
            68 + f * 55,
            68 + f * 55,
            (1 - f) * 0.8,
            0xffffff,
            i * 0.7,
          );
        }
        if (elapsed < 110 || elapsed > 1150) continue;
        const flight = (elapsed - 110) / 1040;
        const travel = 1 - (1 - flight) ** 2;
        const horizontal = e.rows.includes(Math.floor(i / 8));
        for (let p = 0; p < 3; p++) {
          const sign = (p + i) % 2 ? 1 : -1;
          const along = sign * travel * (30 + p * 27);
          const across = (p - 1) * travel * (56 + (i % 3) * 15);
          const px = x + 32 + (horizontal ? along : across);
          const py =
            y +
            32 +
            (horizontal ? across : along) -
            travel * 65 +
            flight * flight * 95;
          const size = (21 + p * 6) * (1 - flight * 0.55);
          fx.stamp(
            "chip",
            px,
            py,
            size,
            size * (0.7 + Math.abs(Math.cos(flight * 8 + i)) * 0.3),
            Math.min(1, (1 - flight) * 2.5),
            COLORS[e.board[i] || 1]!,
            i * 0.8 + sign * flight * (3 + p),
            false,
          );
          if (p === 1 && e.energy > 0.35)
            fx.stamp(
              "flash",
              px,
              py - 8,
              25 * (1 - flight),
              25 * (1 - flight),
              Math.sin(Math.PI * flight) * 0.8,
              accent,
              flight,
            );
        }
      }
      if (!this.calm && e.lines && age >= 40 && age < 360) {
        const distance = ((age - 40) / 28) * 64;
        const opacity = Math.min(1, (360 - age) / 100);
        for (const sign of [-1, 1]) {
          for (const row of e.rows) {
            const at = e.origins.rows[row]! * 64 + 32 + sign * distance;
            if (at >= 0 && at <= 512) {
              fx.stamp(
                "streak",
                at,
                row * 64 + 32,
                170,
                240,
                opacity * 0.7,
                accent,
              );
              fx.stamp("flash", at, row * 64 + 32, 80, 80, opacity);
            }
          }
          for (const col of e.columns) {
            const at = e.origins.columns[col]! * 64 + 32 + sign * distance;
            if (at >= 0 && at <= 512) {
              fx.stamp(
                "streak",
                col * 64 + 32,
                at,
                170,
                240,
                opacity * 0.7,
                accent,
                Math.PI / 2,
              );
              fx.stamp("flash", col * 64 + 32, at, 80, 80, opacity);
            }
          }
        }
      }
    }
    fx.end();
    this.study?.end();
  }
}
