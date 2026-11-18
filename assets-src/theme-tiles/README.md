# Theme tile palette variants
Derived only from our existing generated Classic atlas (`../classic-tiles/master.png`). No new third-party imagery. The three materials keep their original highlight/edge geometry; six palettes remap luminance offline, preserving alpha. Run `node scripts/build-theme-tiles.mjs`, then `npm run assets:check`.

18 WebP images, 128×128 each. Encoded budget <100000 bytes; decoded RGBA 1179648 bytes. Both game board and DOM tray/drag use the same preloaded images. Originals and generation provenance remain in classic-tiles. Monochrome palette is visual only: logical cell colors, scoring and dealer RNG are unchanged.
