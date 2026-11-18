# VFX 0.21 masters and runtime policy

Generated with built-in image_gen on 2026-10-30 for Blocky; four separate original RGBA PNG masters, not extracted competitor assets. Preserve masters; do not ship them in `public` or APK. Neutral light permits theme tinting; chip receives destroyed-cell color.

Common prompt: `Use case: stylized-concept. Asset type: production 2D casual mobile puzzle VFX sprite. [subject below] High-quality hand-painted game effect, readable at small screen sizes. Genuinely transparent RGBA background, no solid black or colored background, no baked checkerboard, no labels, no typography, no watermark. Single isolated sprite, not a sheet. Avoid realistic smoke or fire, colorful nebulae, wide muddy glow. Keep all pixels away from canvas borders.`

Subjects:
- flash: `One single compact asymmetric impact flash sprite. Brilliant ivory white center, six tapered curved rays, crisp sculpted luminous core, tiny restrained silver glow with smooth alpha falloff. No separate floating debris. White and neutral gray only, so engine can tint it. Shape occupies middle 65% of canvas.`
- streak: `One single horizontal line-clear light streak sprite, aspect of visible shape about 6:1. White hot thin center with silky tapered wisps above and below, sharply tapered ends, subtle silver luminous veil. Neutral white gray only for engine tint. No debris, no stars, no background illumination. Full shape inside canvas middle 80% width with generous transparent border.`
- chip: `One single small chunky irregular rounded enamel fragment from a toy block, tilted in three-quarter view. Pearly neutral white material with clear gray side faces, strong sculpted bevel and crisp specular highlight, readable substantial thickness. No glow, no shadow outside the object, no extra objects. Fragment occupies middle 65% of square canvas. Designed to be tinted saturated colors by game engine.`
- ring: `One single front-facing circular energetic shockwave ring sprite. Thin luminous ivory white rim with irregular flowing small spikes, a subtle translucent silver outer fringe, completely empty transparent center. Restrained glow, clear silhouette. No other particles or objects. Neutral white grayscale only, not gold. Ring diameter 65% of square canvas with large fully transparent border.`

## Rebuild and review

`npm ci && npm run assets:build && npm run assets:check`

Uses unchanged mini-games-kit helpers at `5450f9db344aacb5acdc103b4199fd8aeb11b10d`; see tools/vendor/mini-games-kit/PROVENANCE.md. Always starts from masters, so repeated builds cannot accumulate lossy encodes. Background removal is **preserve**, generated alpha is retained. Canonical canvases 192/512/96/512, WebP q88, transparent trim at alpha1 + 3px gutter, pivot metadata committed with textures. Kit checks reconstructed RGB/alpha error on trim. WebP alpha is lossless.

Display budget: Phaser board itself is 512 physical pixels, scaled by CSS. A 512px ring covers the board; streak uses 502x59 actual pixels; 96px chip is much larger than its typical 10–27px screen size. No full-size generation masters loaded at runtime. Total 92,514 encoded bytes / 316,308 physical pixels / 1,265,232 RGBA bytes (~1.21 MiB). Additional Festival tint cache: seven 64x64 canvases =114,688 RGBA bytes. These proxies exclude driver overhead, framebuffer and other game layers.

`codec-report.json` records a q65 AVIF experiment from WebP (not pristine master). AVIF is smaller but **not shipped**: this small offline APK set uses one WebP path and avoids a second codec / capability branch. No device decode/startup speed claim is made. Revisit if the asset set expands.

All four textures are **session-required**; Phaser preload finishes before app input unlock. No fetch/decode starts on a clear. 220 board image objects maximum, reused; 360 full-screen particles maximum. Calm/pause stop animated effects. Existing procedural Festival shapes remain only a load-failure fallback, not a runtime-loading placeholder. Missing packaged assets are a build/CI failure through assets:check.

Review on both cream and dark backgrounds, at 320px width, including single line, crossed lines, rapid chain, all-clear and a new placement during the old tail. Physical Android FPS and subjective feel remain a device gate.
