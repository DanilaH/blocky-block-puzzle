/** Selected release material, shared by Phaser, tray and dragged figure. */
export const TILE_STUDY = "plastic";
export const STUDY_BOARD = { base: 0xcce7f3, well: 0x2775a3, lip: 0xf3fcff, edge: 0x347da6, contact: 0x286b9a };
if (typeof document !== "undefined") {
  document.documentElement.dataset.tileStudy = TILE_STUDY;
  document.documentElement.dataset.boardStudy = "sky";
}
