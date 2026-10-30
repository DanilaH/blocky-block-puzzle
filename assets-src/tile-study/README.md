# Tile material study — 2026-10-30

Three separate original RGBA atlases generated with built-in image_gen: glossy plastic, enamel and translucent caramel. No competitor extraction. Each master: 3 columns × 2 rows, yellow/red/green/turquoise/blue/purple. Keep pristine masters here. Prompt set in prompts.json.

`node scripts/build-tile-study.mjs` uses vendored mini-games-kit helpers (5450f9db344aacb5acdc103b4199fd8aeb11b10d). Cuts equal atlas cells, preserves alpha, normalizes each to128×128 with2px transparent padding, encodes WebP q90, validates format/alpha/padding. Keeps tiny canonical gutters rather than physical trimming: 2px would save little, identical DOM/Phaser pivots remain direct. Per-theme six-texture budgets: plastic24,256bytes; enamel28,696bytes; caramel37,884bytes. Decoded proxy393,216bytes per active style; originals are not runtime assets.

DEV-only URLs: `/?tileStudy=plastic`, `/?tileStudy=enamel`, `/?tileStudy=caramel`. No query = original0.21. Same color assets used in board, tray and dragged figure. Scene preloads only six selected textures, image pool is bounded256. Tiles have their own layer below hints/clear overlays and VFX. Preview board has shallow frame and rounded inset cells. No rule, save, score or audio changes.

This is a material-selection prototype, not release0.22. Series-specific material evolution still needs adaptation after choosing the base material; do not ship all three study sets as a release. No Android APK issued from this branch.

Release 0.22 selects plastic only (24,256 bytes). Generator now emits only the six selected textures; enamel/caramel masters stay archived here and their runtime files are removed. The material is always active, without DEV parameters. Sky base is muted and background cooled; existing series board transitions and material sheen are retained. Historical study query parameters no longer select alternate assets.
