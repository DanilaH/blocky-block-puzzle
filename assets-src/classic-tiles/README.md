# Classic 0.36 tiles

Own generated artwork, built-in image generation, 2026-11-03. Master retained unchanged as `master.png` (1774×887 RGBA). Second generation chosen; first candidate rejected because of colored backdrop. No competitor assets.

Prompt: Edit the six-color reference atlas into 18 tiles, six columns × three rows. Colors yellow, red, lime, turquoise, blue, purple in each row. Row 1 glossy plastic; row 2 deeper enamel, bright thin top edge; row 3 polished finish with stronger top/bottom bevel. Identical straight square geometry, tiny rounded corners, orthographic front. Large quiet face, no diagonal stripe, no symbols/text/perspective. Remove colored glow/backdrop completely, real transparent gutters and hard clean silhouette.

Build: `node scripts/build-classic-tiles.mjs`. Explicit crop rectangles account for generated atlas alignment; existing game-kit prepare/validate pipeline preserves alpha, normalizes 128² canvases with 2 px padding and WebP quality 90. No runtime full atlas or master. Budget 100 KB encoded / 1.2 MB decoded for 18 sprites. Physical trim deliberately omitted to keep identical pivots and cell sizes in Phaser/tray/drag. `npm run assets:check` checks alpha edges and budget. Campaign continues using the prior tile-study set.
