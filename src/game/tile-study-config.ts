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
