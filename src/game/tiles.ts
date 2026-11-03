import { TILE_STUDY, type TileMaterial } from "./tile-study-config";
/** Own shallow plastic tiles; shared by board, tray and drag. */
export const COLORS = [
  0x303136, 0xffb719, 0xef5140, 0x83c633, 0x19b9ad, 0x4279ed, 0xa160d6,
  0x619de9, 0xeea8c5, 0xbda7e8, 0xedc566, 0xbce3e7, 0xecedf5,
];
export const TILE_FACES = [
  {
    points: [
      [6, 3],
      [58, 3],
      [62, 7],
      [62, 57],
      [58, 61],
      [6, 61],
      [2, 57],
      [2, 7],
    ],
    color: null,
    alpha: 1,
  },
  {
    points: [
      [2, 52],
      [62, 52],
      [62, 57],
      [58, 61],
      [6, 61],
      [2, 57],
    ],
    color: 0x202024,
    alpha: 0.23,
  },
  {
    points: [
      [7, 4],
      [57, 4],
      [60, 7],
      [60, 10],
      [4, 10],
      [4, 7],
    ],
    color: 0xffffff,
    alpha: 0.42,
  },
  {
    points: [
      [7, 11],
      [10, 11],
      [10, 44],
      [7, 44],
    ],
    color: 0xffffff,
    alpha: 0.12,
  },
] as const;
const urls = new Map<string, string>();
export function cacheTileURL(
  color: number,
  url: string,
  material: TileMaterial = "plastic",
) {
  urls.set(`${material}:${color}`, url);
}
export function tileURL(color: number, material: TileMaterial = "plastic") {
  const cached = urls.get(`${material}:${color}`);
  if (cached) return cached;
  if (TILE_STUDY)
    return `/assets/${typeof document !== "undefined" && document.documentElement.dataset.presentation === "classic" ? (COLORS.indexOf(color) > 6 ? "theme-tiles" : "classic-tiles") : "tile-study"}/${material}-${COLORS.indexOf(color)}.webp`;
  const hex = (n: number) => "#" + n.toString(16).padStart(6, "0");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${TILE_FACES.map((q) => `<polygon points="${q.points.map((p) => p.join(",")).join(" ")}" fill="${hex(q.color ?? color)}" opacity="${q.alpha}"/>`).join("")}</svg>`;
  const url = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  urls.set(`${material}:${color}`, url);
  return url;
}
