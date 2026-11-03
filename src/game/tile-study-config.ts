/** Selected release material, shared by Phaser, tray and dragged figure. */
export const TILE_STUDY = "plastic";
export const STUDY_BOARD = {
  base: 0xcce7f3,
  well: 0x2775a3,
  lip: 0xf3fcff,
  edge: 0x347da6,
  contact: 0x286b9a,
};
if (typeof document !== "undefined") {
  document.documentElement.dataset.tileStudy = TILE_STUDY;
  document.documentElement.dataset.boardStudy = "sky";
}

export const TILE_MATERIALS = ["plastic", "enamel", "chrome"] as const;
export type TileMaterial = (typeof TILE_MATERIALS)[number];
/** Theme indices 2 / 5 correspond to series 6 / 20. Later palettes keep chrome. */
export function tileMaterialForTheme(theme: number): TileMaterial {
  return theme >= 5 ? "chrome" : theme >= 1 ? "enamel" : "plastic";
}
export function tileTransitionDuration(calm: boolean, theme: number) {
  return calm ? 250 : theme === 0 ? 1800 : 1000;
}
