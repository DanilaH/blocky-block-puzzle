# Tile material study — 2026-10-30

Three separate original RGBA atlases generated with built-in image_gen: glossy plastic, enamel and translucent caramel. No competitor extraction. Each master: 3 columns × 2 rows, yellow/red/green/turquoise/blue/purple. Keep pristine masters here. Prompt set in prompts.json.

`node scripts/build-tile-study.mjs` uses vendored mini-games-kit helpers (5450f9db344aacb5acdc103b4199fd8aeb11b10d). Cuts equal atlas cells, preserves alpha, normalizes each to128×128 with4px transparent padding, encodes WebP q90, validates format/alpha/padding. Keeps tiny canonical gutters rather than physical trimming: 4px would save little, identical DOM/Phaser pivots remain direct. Per-theme six-texture budgets: plastic24,136bytes; enamel27,856bytes; caramel36,068bytes. Decoded proxy393,216bytes per active style; originals are not runtime assets.

DEV-only URLs: `/?tileStudy=plastic`, `/?tileStudy=enamel`, `/?tileStudy=caramel`. No query = original0.21. Same color assets used in board, tray and dragged figure. Scene preloads only six selected textures, image pool is bounded256. Tiles have their own layer below hints/clear overlays and VFX. Preview board has shallow frame and rounded inset cells. No rule, save, score or audio changes.

This is a material-selection prototype, not release0.22. Series-specific material evolution still needs adaptation after choosing the base material; do not ship all three study sets as a release. No Android APK issued from this branch.
