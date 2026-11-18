# Original reward emblems — 0.42

Generated 2026-11-04 with the built-in OpenAI image generator; no competitor artwork used. PNG masters preserve RGBA. `all-clear.png`: golden four-point diamond with turquoise blocks; `series.png`: gold lightning over a turquoise disc. These are decorative, text-free accents, not controls or sources of score.

Rebuild: `node scripts/build-rewards.mjs`. Pipeline uses vendored mini-games-kit `prepareImageAsset`, `validatePreparedImage`, `trimTransparentWebp`, `inspectRuntimeImageBudget`; upstream checked at `5450f9db344aacb5acdc103b4199fd8aeb11b10d` on 2026-11-04. 320 logical canvas, 12 px preparation padding, alpha-preserving WebP quality 88, 4 px trim gutter. Canonical trim metadata retained in manifest. Runtime fits the entire trimmed image into a 104 px square (64 px on short screens); these are independently centered emblems, not interchangeable animation frames.

WebP: 45,394 bytes total; estimated decoded RGBA: 722,304 bytes. AVIF comparisons: 11,544 and 14,145 bytes versus WebP 18,848 and 26,546. WebP chosen for consistent existing Android WebView path; AVIF comparison is size-only, not a perceptual-equivalence claim. Only WebP ships; masters and build metadata are outside public. `npm run assets:check` verifies dimensions, trim frame, alpha edges and budgets. Both images preload/decode at startup; an unavailable image simply omits decoration, never blocks a reward.

All-clear emblem appears on complete board clear; series emblem only when a finished series reaches 10. They yield to the next drag and do not introduce new scoring or extra haptics.
