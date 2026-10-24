/** Shared enamel geometry for board, tray and lifted piece (64 logical pixels). */
export const COLORS = [
  0x302820, 0xffad25, 0xf45b48, 0xa4d844, 0x46c8e0, 0xffda52, 0xee81aa,
];
export const TILE_RECTS = [
  { x: 4, y: 7, w: 56, h: 55, r: 9, color: 0x130e09, alpha: 0.55 },
  { x: 4, y: 3, w: 56, h: 55, r: 9, color: null, alpha: 1 },
  { x: 7, y: 43, w: 50, h: 12, r: 6, color: 0x622400, alpha: 0.24 },
  { x: 7, y: 5, w: 50, h: 20, r: 7, color: 0xffffff, alpha: 0.26 },
  { x: 12, y: 7, w: 25, h: 3, r: 2, color: 0xffffff, alpha: 0.62 },
] as const;
export function tileURL(color: number) {
  const hex = (n: number) => "#" + n.toString(16).padStart(6, "0");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${TILE_RECTS.map((q) => `<rect x="${q.x}" y="${q.y}" width="${q.w}" height="${q.h}" rx="${q.r}" fill="${hex(q.color ?? color)}" opacity="${q.alpha}"/>`).join("")}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
