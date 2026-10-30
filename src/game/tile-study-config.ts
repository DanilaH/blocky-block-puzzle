const requested =
  import.meta.env.DEV && typeof location !== "undefined"
    ? new URLSearchParams(location.search).get("tileStudy")
    : null;
export const TILE_STUDY = ["plastic", "enamel", "caramel"].includes(
  requested ?? "",
)
  ? requested!
  : null;
if (TILE_STUDY) document.documentElement.dataset.tileStudy = TILE_STUDY;

// DEV-only palette comparison; material selection remains independent.
export const BOARD_STUDY = TILE_STUDY && new URLSearchParams(location.search).get("boardStudy") === "sky" ? "sky" : "cream";
export const STUDY_BOARD = BOARD_STUDY === "sky"
  ? { base: 0xc4ecff, well: 0xa4d8f4, lip: 0xf1fcff, edge: 0x4194c2, contact: 0x286b9a }
  : { base: 0xffebbe, well: 0xf3d699, lip: 0xfffcf0, edge: 0xc79540, contact: 0xa96c25 };
if (TILE_STUDY) document.documentElement.dataset.boardStudy = BOARD_STUDY;
