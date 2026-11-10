# Two prepared theme backgrounds — 10 November 2026

Original images generated for this project using the built-in image generator. No competitor artwork or external image reference was supplied. These are decorative page backgrounds; board wells, tile materials, text, and hit areas remain separate live geometry. Originally a DEV-only study; preview0.62 uses this same pair in ordinary Classic. These are not eleven finished theme assets.

The generated PNGs were converted with Sharp to opaque sRGB WebP without creative post-editing. Runtime files: `public/backgrounds/porcelain-v1.webp` and `public/backgrounds/polar-night-v1.webp`. Exact dimensions, encoded size, SHA-256 and decoded RGBA estimate are in [budget.json](budget.json). Both together: 19,304 encoded bytes and 12,580,152 estimated decoded RGBA bytes; file size is not texture memory. The original generated images were returned in the conversation; production uses only the prepared WebP derivatives.

Only theme 1 (Porcelain) and theme 5 (Polar Night) use art in this experiment. The other nine retain flat fallback colors. Decode both before enabling the study, reuse the same image objects, and do not tint or regenerate them during transitions. Expanding to all themes requires an explicit residency/eviction budget rather than preloading eleven full-screen images.

## Porcelain prompt

Use case: stylized-concept. Asset type: a production background texture for a mobile block puzzle game, portrait 9:20 composition. Create a restrained, elegant ivory porcelain surface, flat borderless 2D material texture viewed straight on, not a photographed object or room. Dominant off-white #f4f3ee, very faint cool blue-gray glazing near outer edges, subtle satin ceramic character. The central 80 percent and top HUD area must stay almost uniform, quiet, low-contrast, suitable behind dark blue game text. Decoration is subtle and peripheral. No grid, no board, no tiles, no game pieces, no UI, no lettering, no icons, no objects, no borders, no strong pattern, no glitter, no watermark. This image is the background only; functional game geometry is rendered separately.

## Polar Night prompt

Use case: stylized-concept. Asset type: a production background texture for a mobile block puzzle game, portrait 9:20 composition. Create a restrained, elegant abstract polar-night material background, flat borderless 2D surface viewed straight on, not a landscape or room. Dominant muted deep slate navy #233f57, extremely subtle icy blue atmospheric glazes near the far outer edges, polished mineral softness with very low contrast. The central 80 percent and top HUD area must stay quiet and nearly uniform, suitable behind white game text. No bright spotlight, no stars, no glitter, no grid, no board, no tiles, no game pieces, no UI, no lettering, no icons, no objects, no borders, no watermark. This image is the background only; functional game geometry is rendered separately.

## Runtime integration in0.62
The same pair is decoded once with a2-second limit. A failed pair selects the original renderer and cannot activate late. Snapshot buffers are reused only for interrupted transitions and their backing pixels are released at settlement. Scope and encoded/RGBA budget remain two images.
