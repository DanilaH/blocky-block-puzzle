/** Own glossy resin tiles. Shared geometry keeps tray, drag and board identical. */
export const COLORS = [
  0x122638, 0xffbd35, 0xf36a57, 0x91ce47, 0x40c7cd, 0x648be9, 0xb586e6,
];
export const TILE_FACES = [
  // Low dark foot, rounded octagonal silhouette and a thick lower edge.
  {
    points: [
      [7, 4],
      [57, 4],
      [63, 10],
      [63, 57],
      [57, 63],
      [7, 63],
      [1, 57],
      [1, 10],
    ],
    color: 0x081523,
    alpha: 0.65,
  },
  {
    points: [
      [7, 1],
      [57, 1],
      [62, 6],
      [62, 54],
      [56, 60],
      [8, 60],
      [2, 54],
      [2, 6],
    ],
    color: null,
    alpha: 1,
  },
  {
    points: [
      [2, 40],
      [10, 47],
      [54, 47],
      [62, 40],
      [62, 54],
      [56, 60],
      [8, 60],
      [2, 54],
    ],
    color: 0x102336,
    alpha: 0.32,
  },
  {
    points: [
      [7, 1],
      [57, 1],
      [62, 6],
      [54, 12],
      [10, 12],
      [2, 6],
    ],
    color: 0xffffff,
    alpha: 0.5,
  },
  {
    points: [
      [2, 7],
      [10, 13],
      [10, 46],
      [5, 52],
      [2, 49],
    ],
    color: 0xffffff,
    alpha: 0.19,
  },
  {
    points: [
      [62, 7],
      [54, 13],
      [54, 46],
      [59, 52],
      [62, 49],
    ],
    color: 0x102336,
    alpha: 0.18,
  },
  // Quiet face; broad top reflection and a smaller sharp glint.
  {
    points: [
      [12, 10],
      [52, 10],
      [56, 14],
      [56, 43],
      [52, 48],
      [12, 48],
      [8, 43],
      [8, 14],
    ],
    color: null,
    alpha: 1,
  },
  {
    points: [
      [12, 10],
      [52, 10],
      [56, 14],
      [56, 24],
      [8, 33],
      [8, 14],
    ],
    color: 0xffffff,
    alpha: 0.12,
  },
  {
    points: [
      [12, 10],
      [50, 10],
      [50, 12],
      [12, 12],
      [10, 14],
      [10, 23],
      [8, 23],
      [8, 14],
    ],
    color: 0xffffff,
    alpha: 0.48,
  },
  {
    points: [
      [12, 49],
      [52, 49],
      [55, 47],
      [55, 50],
      [52, 53],
      [12, 53],
      [9, 50],
      [9, 47],
    ],
    color: 0xffffff,
    alpha: 0.14,
  },
] as const;
const urls = new Map<number, string>();
export function tileURL(color: number) {
  const cached = urls.get(color);
  if (cached) return cached;
  const hex = (n: number) => "#" + n.toString(16).padStart(6, "0");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${TILE_FACES.map((q) => `<polygon points="${q.points.map((p) => p.join(",")).join(" ")}" fill="${hex(q.color ?? color)}" opacity="${q.alpha}"/>`).join("")}</svg>`;
  const url = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  urls.set(color, url);
  return url;
}
