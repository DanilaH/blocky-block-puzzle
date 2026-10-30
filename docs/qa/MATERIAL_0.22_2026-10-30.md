# Material 0.22

Selected glossy plastic is active in production, shared by board/tray/drag. Six 128px alpha WebP textures: 24,256 encoded bytes, 393,216 RGBA proxy bytes. Transparent gutters 2px. Unused enamel/caramel runtime assets removed; pristine source atlases retained.

Base: muted sky board #cce7f3, translucent darker wells, milk-blue background #edf6fa and cool ink. Rim blends with the current board theme; existing continuous series transitions are restored. Material sheen overlays on board and subtle tray brightness follow series, with smooth interpolation. Theme boundaries/rules/saves/audio unchanged.

Preload gate test now covers tiles as well as VFX. Asset checks reject missing/extra files, invalid alpha, cut edges and budget growth. Production ignores historical study selection query parameters.

Validation: build, 86 unit and asset checks passed. Initial browser run: 78/84; six failures included timing under concurrent recording and HMR invalidation, plus repeated DOM texture requests with cache disabled. DOM now reuses decoded startup textures. All six failed scenarios passed in an isolated rerun. Clean CI regression and signed APK verification pending. Captures in material-0.22 are actual Chromium frames on prepared positions, not physical Android playtests. Physical FPS, touch feel and sound/haptics remain unverified.
