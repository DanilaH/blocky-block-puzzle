import { performanceCapture } from "../platform/performance";
import { RasterInk, SpriteInk, prepareEnergyBorder } from "./sprite-ink";
import { cacheTileURL } from "./tiles";
import {
  STUDY_BOARD,
  TILE_MATERIALS,
  tileMaterialForTheme,
  tileTransitionDuration,
} from "./tile-study-config";
import { TILE_STUDY, TileStudySprites } from "./tile-study";
import { VfxSprites, VFX_KINDS } from "./vfx";
import { THEMES, themeTile } from "./themes";
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
  private bed?: Phaser.GameObjects.Graphics | RasterInk;
  private bedColor = -1;
  private bedKey = "";
  private wells: Phaser.GameObjects.Image[] = [];
  private dirty = true;
  private ink!: Phaser.GameObjects.Graphics | SpriteInk;
  private state: GameState | null = null;
  private ghost: Move | null = null;
  private previewEcho: { cells: number[]; color: number; at: number } | null =
    null;
  private readonly previewLineCounts = new Uint8Array(16);
  private valid = true;
  private hint = false;
  private pending: number[] = [];
  private impacts: Impact[] = [];
  calm = false;
  compactEffects = false;
  private diagnostic = { cachedBorder: false, hideInk: false, hideVfx: false };
  private diagnosticSample: {
    draws: number;
    inkPeak: number;
    vfxPeak: number;
  } | null = null;
  beginDiagnosticSample() {
    this.diagnosticSample = { draws: 0, inkPeak: 0, vfxPeak: 0 };
  }
  diagnosticSnapshot() {
    return {
      draws: 0,
      inkPeak: 0,
      vfxPeak: 0,
      ...this.diagnosticSample,
      theme: this.theme,
      compactEffects: this.compactEffects,
      activeImpacts: this.impacts.length,
    };
  }
  /** Transient presentation-only controls for the separate preview benchmark. */
  setDiagnosticProfile(profile: Partial<typeof this.diagnostic> = {}) {
    this.diagnostic = {
      cachedBorder: false,
      hideInk: false,
      hideVfx: false,
      ...profile,
    };
    this.ink?.setVisible(!this.diagnostic.hideInk);
    if (this.ink instanceof SpriteInk)
      this.ink.setDiagnosticDisabled(this.diagnostic.hideInk);
    this.vfx?.setDiagnosticDisabled(this.diagnostic.hideVfx);
    this.dirty = true;
  }
  private theme = 0;
  private themeAt = 0;
  private shade = THEMES[0].board as number;
  private fromShade = THEMES[0].board as number;
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
    this.study?.setPalette(this.presentation === "classic" ? index : 0);
    this.shade = THEMES[index]!.board;
    this.accent = color;
    this.themeAt = performance.now();
    if (this.presentation === "classic" && this.game?.canvas) {
      const board = this.game.canvas.parentElement!;
      board.style.transition = this.compactEffects
        ? "none"
        : `background-color ${tileTransitionDuration(this.calm, index)}ms linear`;
      board.style.backgroundColor =
        "#" + this.shade.toString(16).padStart(6, "0");
    }
    this.study?.setMaterial(
      tileMaterialForTheme(index),
      this.themeAt,
      tileTransitionDuration(this.calm, index, this.compactEffects),
    );
    this.sheen =
      index === 0
        ? 0
        : index === 5
          ? 0.8
          : index === 4
            ? 0.65
            : 0.35 + index * 0.035;
    this.dirty = true;
  }
  private mix() {
    return Math.min(
      1,
      (performance.now() - this.themeAt) /
        tileTransitionDuration(this.calm, this.theme, this.compactEffects),
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
    return this.calm || this.compactEffects
      ? 0
      : this.celebration.level(performance.now());
  }
  constructor(private presentation: "classic" | "enamel" = "enamel") {
    super("board");
    this.diagnostic.cachedBorder = presentation === "classic";
    this.shade = this.fromShade =
      presentation === "classic" ? THEMES[0].board : 0xcce7f3;
  }
  preload() {
    if (TILE_STUDY)
      for (const material of TILE_MATERIALS)
        for (
          let color = 1;
          color <= (this.presentation === "classic" ? 12 : 6);
          color++
        )
          this.load.image(
            `study-${material}-${color}`,
            `assets/${this.presentation === "classic" ? (color > 6 ? "theme-tiles" : "classic-tiles") : "tile-study"}/${material}-${color}.webp`,
          );
    for (const kind of VFX_KINDS)
      this.load.image(`vfx-${kind}`, `assets/vfx/${kind}.webp`);
  }
  syncResolution() {
    if (!this.cameras?.main) return;
    const side = this.scale.width;
    this.cameras.main
      .setViewport(0, 0, side, side)
      .setZoom(side / 512)
      .centerOn(256, 256);
    this.dirty = true;
  }
  create() {
    this.syncResolution();
    if (this.presentation === "classic") {
      const board = this.game.canvas.parentElement!;
      board.dataset.staticBoard = "true";
      this.events.once("shutdown", () => {
        delete board.dataset.staticBoard;
        board.style.removeProperty("background-color");
        board.style.removeProperty("transition");
      });
      board.style.backgroundColor =
        "#" + this.shade.toString(16).padStart(6, "0");
    }
    this.vfx = new VfxSprites(this);
    this.events.once("shutdown", () => this.vfx?.destroy());
    const textured = this.game.renderer.type === Phaser.WEBGL && !!TILE_STUDY;
    this.ink = textured
      ? new SpriteInk(this, 1, this.presentation === "classic")
      : this.add.graphics().setDepth(1);
    if (textured && this.presentation === "classic") prepareEnergyBorder(this);
    this.events.once("shutdown", () => {
      this.ink.destroy();
      this.bed?.destroy();
    });
    if (TILE_STUDY) {
      // One 64px grayscale well shared by all cells; tint follows the theme.
      // Avoid replaying 1,792 rounded gradient layers on every WebGL frame.
      if (
        this.presentation !== "classic" &&
        !this.textures.exists("enamel-well")
      ) {
        const texture = this.textures.createCanvas("enamel-well", 64, 64)!;
        const ctx = texture.context;
        const gradient = ctx.createLinearGradient(0, 3, 0, 63);
        gradient.addColorStop(0, "#e7e7e7");
        gradient.addColorStop(0.8, "#f1f1f1");
        ctx.fillStyle = gradient;
        ctx.beginPath();
        {
          ctx.moveTo(10, 3);
          ctx.lineTo(54, 3);
          ctx.quadraticCurveTo(62, 3, 62, 11);
          ctx.lineTo(62, 55);
          ctx.quadraticCurveTo(62, 63, 54, 63);
          ctx.lineTo(10, 63);
          ctx.quadraticCurveTo(2, 63, 2, 55);
          ctx.lineTo(2, 11);
          ctx.quadraticCurveTo(2, 3, 10, 3);
          ctx.closePath();
        }
        ctx.fill();
        texture.refresh();
      }
      this.wells = Array.from(
        { length: this.presentation === "classic" ? 0 : 64 },
        (_, i) =>
          this.add
            .image((i % 8) * 64, Math.floor(i / 8) * 64, "enamel-well")
            .setOrigin(0)
            .setDepth(0),
      );
      // Classic never paints contact decoration. Keep an empty graphics object
      // instead of uploading a transparent 512x512 texture on every placement.
      this.bed =
        textured && this.presentation !== "classic"
          ? new RasterInk(this, 0.25)
          : this.add.graphics().setDepth(0.25);
      this.bedKey = "";
      this.bedColor = -1;

      this.study = new TileStudySprites(this);
      this.study.setPalette(this.presentation === "classic" ? this.theme : 0);
      this.study.setMaterial(
        tileMaterialForTheme(this.theme),
        performance.now(),
        0,
      );
      this.events.once("shutdown", () => this.study?.destroy());
    }
    // DOM tray/drag reuse decoded startup textures: no requests during moves,
    // including WebViews with disabled/evicted HTTP cache.
    for (const material of TILE_MATERIALS)
      for (
        let color = 1;
        color <= (this.presentation === "classic" ? 12 : 6);
        color++
      )
        cacheTileURL(
          COLORS[color]!,
          this.textures.getBase64(`study-${material}-${color}`),
          material,
        );
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
    this.dirty = true;
  }
  preview(move: Move | null, valid = true, hint = false) {
    if (
      this.ghost?.slot === move?.slot &&
      this.ghost?.x === move?.x &&
      this.ghost?.y === move?.y &&
      this.valid === valid &&
      this.hint === hint
    )
      return;
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
    this.dirty = true;
  }
  pendingPlacement(cells: number[]) {
    this.pending = cells;
    this.dirty = true;
  }
  impact(
    placed: number[],
    cleared: number[],
    board: number[],
    lines: number,
    allClear = false,
  ) {
    if (lines && !this.calm && !this.compactEffects)
      this.celebration.add(lines, performance.now());
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
    this.impacts = this.impacts.slice(this.compactEffects ? -2 : -4);
  }
  stopEffects() {
    this.pending = [];
    this.praiseHit = null;
    this.previewEcho = null;
    this.celebration.reset();
    this.hint = false;
    this.impacts = [];
    // Pause can stop the loop immediately; clear cosmetic objects synchronously.
    this.draw();
  }
  update() {
    if (
      this.dirty ||
      this.themeAt > 0 ||
      this.study?.transitioning ||
      this.praiseHit ||
      (this.defeatAt > 0 && performance.now() - this.defeatAt < 900) ||
      this.previewEcho ||
      this.intensity > 0 ||
      this.impacts.length ||
      (this.hint && this.ghost && !this.calm)
    )
      performanceCapture.measure("boardDraw", () => this.draw());
  }
  private tile(x: number, y: number, color: number, alpha = 1, scale = 1) {
    const g = this.ink;
    if (this.study) this.study.tile(x, y, color, alpha, scale);
    else
      for (const q of TILE_FACES) {
        g.fillStyle(q.color ?? color, q.alpha * alpha);
        (g as Phaser.GameObjects.Graphics).fillPoints(
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
    const level = this.presentation === "classic" ? 0 : this.materialLevel();
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
    this.dirty = false;
    const g = this.ink,
      now = performance.now();
    g.clear();
    // The inset bed is static between placements/theme frames. Avoid rebuilding
    // 64 rounded wells for every particle/score animation frame.
    const bedColor = this.currentColor(this.fromShade, this.shade);
    const bedKey = this.state?.board.join(",") ?? "empty";
    const repaintBed = bedKey !== this.bedKey;
    if (repaintBed) {
      this.bed?.clear();
      this.bedKey = bedKey;
    }
    if (this.bedColor !== bedColor) {
      this.bedColor = bedColor;
      if (this.presentation !== "classic")
        this.cameras.main.setBackgroundColor(bedColor);
      this.wells.forEach((well) => well.setTint(bedColor));
    }
    this.study?.begin();
    this.vfx?.begin();
    if (this.praiseHit && now - this.praiseHit.at > 750) this.praiseHit = null;
    this.impacts = this.impacts.filter(
      (e) =>
        now - e.started <
        (this.compactEffects
          ? 240
          : this.calm
            ? 180
            : e.allClear
              ? 1500
              : 1250),
    );
    for (let i = 0; i < 64; i++) {
      const x = (i % 8) * 64,
        y = Math.floor(i / 8) * 64;
      if (this.bed) {
        if (repaintBed && this.presentation !== "classic") {
          const bg = this.bed;
          bg.lineStyle(1, STUDY_BOARD.lip, 0.5);
          bg.lineBetween(x + 10, y + 62, x + 54, y + 62);
          bg.lineStyle(1, STUDY_BOARD.lip, 0.65);
          bg.strokeRoundedRect(x + 2, y + 3, 60, 59, 8);
          bg.lineStyle(1, 0x000000, 0.1);
          bg.lineBetween(x + 10, y + 3, x + 54, y + 3);
          if (this.state?.board[i]) {
            bg.fillStyle(STUDY_BOARD.contact, 0.17);
            bg.fillRoundedRect(x + 5, y + 8, 55, 54, 8);
          }
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
        let hit: Impact | undefined;
        let neighbor = 0;
        for (let j = this.impacts.length - 1; j >= 0; j--) {
          const impact = this.impacts[j]!;
          if (!hit && impact.placed.includes(i)) hit = impact;
          const t = (now - impact.started) / 300;
          if (
            !this.calm &&
            t < 1 &&
            impact.placed.some(
              (p) =>
                Math.abs((p % 8) - (i % 8)) +
                  Math.abs(Math.floor(p / 8) - Math.floor(i / 8)) ===
                1,
            )
          )
            neighbor = Math.max(neighbor, Math.sin(t * Math.PI) * 0.025);
        }
        const scale = hit && !this.calm ? contactScale(now - hit.started) : 1;
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
        if (ok) {
          this.previewLineCounts.fill(0);
          for (const i of place(this.state.board, shape, x, y).cells) {
            this.previewLineCounts[i >> 3]!++;
            this.previewLineCounts[8 + (i % 8)]!++;
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
          // One continuous outline makes a complete row/column readable as a unit.
          // Counts reuse a fixed buffer and the existing placement preview result.
          g.lineStyle(3, 0xffffff, 0.9);
          for (let line = 0; line < 8; line++) {
            if (this.previewLineCounts[line] === 8)
              g.strokeRoundedRect(2, line * 64 + 2, 508, 60, 3);
            if (this.previewLineCounts[8 + line] === 8)
              g.strokeRoundedRect(line * 64 + 2, 2, 60, 508, 3);
          }
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
      if (g instanceof SpriteInk && this.diagnostic.cachedBorder)
        g.energyBorder(energy);
      else
        for (let ring = 0; ring < 4; ring++) {
          g.lineStyle(2 + ring * 4, 0xffd67b, energy * (0.24 - ring * 0.05));
          g.strokeRoundedRect(3, 3, 506, 506, 8);
        }
    }
    const fx = this.vfx!;
    const accent = this.currentColor(this.fromAccent, this.accent);
    for (const e of this.impacts) {
      const age = now - e.started;
      if (this.compactEffects) {
        const t = Math.min(1, age / (this.calm ? 140 : 240));
        for (const i of e.cleared) {
          if (this.state?.board[i]) continue;
          const x = (i % 8) * 64,
            y = Math.floor(i / 8) * 64;
          this.tile(x, y, COLORS[e.board[i] || 1]!, 1 - t, 1 - t * 0.65);
          if (!this.calm) {
            g.fillStyle(0xffffff, 0.25 * Math.sin(t * Math.PI));
            g.fillRoundedRect(x + 5, y + 5, 54, 54, 4);
          }
        }
        if (!this.calm && age < 130) {
          for (const i of e.placed) {
            if (!this.state?.board[i]) continue;
            g.lineStyle(2, 0xffffff, 0.45 * (1 - age / 130));
            g.strokeRoundedRect(
              (i % 8) * 64 + 4,
              Math.floor(i / 8) * 64 + 4,
              56,
              56,
              4,
            );
          }
        }
        continue;
      }
      if (!this.calm && e.lines >= 2 && age < 700) {
        const cross = e.rows.length > 0 && e.columns.length > 0;
        if (cross) {
          const cx = e.columns[0]! * 64 + 32,
            cy = e.rows[0]! * 64 + 32;
          // A short intake precedes one central impact and four outgoing arms.
          // Same six sprite slots as the old uniform expansion.
          if (age < 180) {
            const t = age / 180;
            fx.stamp(
              "ring",
              cx,
              cy,
              240 - t * 180,
              240 - t * 180,
              0.3 + t * 0.6,
              accent,
            );
            fx.stamp(
              "flash",
              cx,
              cy,
              40 + t * 70,
              40 + t * 70,
              t * 0.7,
              0xffffff,
            );
          } else {
            const t = Math.min(1, (age - 180) / 470);
            fx.stamp(
              "flash",
              cx,
              cy,
              180 + t * 150,
              180 + t * 150,
              (1 - t) ** 2,
              0xffffff,
            );
            fx.stamp(
              "ring",
              cx,
              cy,
              60 + t * 450,
              60 + t * 450,
              (1 - t) * 0.8,
              accent,
            );
            for (const sign of [-1, 1]) {
              fx.stamp(
                "flash",
                cx + sign * t * 420,
                cy,
                90 * (1 - t),
                30 * (1 - t),
                1 - t,
              );
              fx.stamp(
                "flash",
                cx,
                cy + sign * t * 420,
                30 * (1 - t),
                90 * (1 - t),
                1 - t,
              );
            }
          }
        } else if (e.lines >= 4) {
          const t = age / 700;
          g.lineStyle(12 * (1 - t) + 2, 0xffffff, (1 - t) * 0.9);
          const inset = 6 + (1 - t) * 45;
          g.strokeRoundedRect(
            inset,
            inset,
            512 - 2 * inset,
            512 - 2 * inset,
            8,
          );
        } else {
          const lanes = e.rows.length ? e.rows : e.columns;
          for (let i = 0; i < lanes.length; i++) {
            const t = (age - i * (e.lines === 3 ? 120 : 160)) / 420;
            if (t < 0 || t > 1) continue;
            const at = lanes[i]! * 64 + 32;
            const reverse = e.lines === 2 && i === 1;
            const front = (reverse ? 1 - t : t) * 512;
            const thickness = e.lines === 3 ? 32 : 18;
            const tail = Math.min(512, 80 + t * 180);
            g.fillStyle(0xffffff, Math.sin(t * Math.PI) * 0.75);
            const origin = reverse ? front : Math.max(0, front - tail);
            const length = reverse
              ? Math.min(tail, 512 - front)
              : Math.min(tail, front);
            if (e.rows.length)
              g.fillRect(origin, at - thickness / 2, length, thickness);
            else g.fillRect(at - thickness / 2, origin, thickness, length);
            fx.stamp(
              "flash",
              e.rows.length ? front : at,
              e.rows.length ? at : front,
              e.rows.length ? 40 : thickness * 2.4,
              e.rows.length ? thickness * 2.4 : 40,
              Math.sin(t * Math.PI),
              0xffffff,
            );
          }
        }
      }
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
      if (!this.calm && age < 420) {
        const t = age / 420;
        for (const i of e.placed.slice(0, 8)) {
          const cx = (i % 8) * 64 + 32,
            cy = Math.floor(i / 8) * 64 + 32;
          g.fillStyle(COLORS[e.board[i] || 1]!, (1 - t) ** 2);
          for (let k = 0; k < 4; k++) {
            const angle = (k * Math.PI) / 2 + 0.7;
            const distance = 26 + t * 25;
            g.fillRect(
              cx + Math.cos(angle) * distance,
              cy + Math.sin(angle) * distance - t * 14,
              4 * (1 - t) + 1,
              4 * (1 - t) + 1,
            );
          }
        }
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
          g.fillStyle(0xffffff, 0.32 * (1 - fade) ** 2);
          if (e.rows.includes(Math.floor(i / 8))) g.fillRect(x, y + 25, 64, 14);
          if (e.columns.includes(i % 8)) g.fillRect(x + 25, y, 14, 64);
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
    if (repaintBed && this.bed instanceof RasterInk) this.bed.flush();
    fx.end();
    if (this.diagnostic.hideVfx) fx.clear();
    this.study?.end();
    if (this.diagnosticSample) {
      this.diagnosticSample.draws++;
      this.diagnosticSample.inkPeak = Math.max(
        this.diagnosticSample.inkPeak,
        this.ink instanceof SpriteInk
          ? this.ink.diagnosticCount()
          : this.diagnostic.hideInk
            ? 0
            : 1,
      );
      this.diagnosticSample.vfxPeak = Math.max(
        this.diagnosticSample.vfxPeak,
        this.vfx?.diagnosticCount() ?? 0,
      );
    }
    if (this.mix() >= 1) this.themeAt = 0;
  }
}
