/** Own bevelled cube geometry, shared by SVG tray and Phaser board. */
export const COLORS = [
  0x202e64, 0xffb900, 0xf24e43, 0x60ce27, 0x23bee9, 0x477bff, 0xb451e7,
];
export const TILE_FACES = [
  {
    points: [
      [1, 1],
      [63, 1],
      [63, 63],
      [1, 63],
    ],
    color: null,
    alpha: 1,
  },
  {
    points: [
      [1, 1],
      [63, 1],
      [54, 10],
      [10, 10],
    ],
    color: 0xffffff,
    alpha: 0.48,
  },
  {
    points: [
      [1, 1],
      [10, 10],
      [10, 54],
      [1, 63],
    ],
    color: 0xffffff,
    alpha: 0.16,
  },
  {
    points: [
      [63, 1],
      [63, 63],
      [54, 54],
      [54, 10],
    ],
    color: 0x11143b,
    alpha: 0.28,
  },
  {
    points: [
      [1, 63],
      [10, 54],
      [54, 54],
      [63, 63],
    ],
    color: 0x11143b,
    alpha: 0.4,
  },
  {
    points: [
      [10, 10],
      [54, 10],
      [54, 14],
      [10, 14],
    ],
    color: 0xffffff,
    alpha: 0.12,
  },
] as const;
export function tileURL(color: number) {
  const hex = (n: number) => "#" + n.toString(16).padStart(6, "0");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${TILE_FACES.map((q) => `<polygon points="${q.points.map((p) => p.join(",")).join(" ")}" fill="${hex(q.color ?? color)}" opacity="${q.alpha}"/>`).join("")}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
