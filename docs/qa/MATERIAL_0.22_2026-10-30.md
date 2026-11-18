# Material 0.22

Selected glossy plastic is active in production, shared by board/tray/drag. Six 128px alpha WebP textures: 24,256 encoded bytes, 393,216 RGBA proxy bytes. Transparent gutters 2px. Unused enamel/caramel runtime assets removed; pristine source atlases retained.

Base: muted sky board #cce7f3, translucent darker wells, milk-blue background #edf6fa and cool ink. Rim blends with the current board theme; existing continuous series transitions are restored. Material sheen overlays on board and subtle tray brightness follow series, with smooth interpolation. Theme boundaries/rules/saves/audio unchanged.

Preload gate test now covers tiles as well as VFX. Asset checks reject missing/extra files, invalid alpha, cut edges and budget growth. Production ignores historical study selection query parameters.

Validation: build, 86 unit and asset checks passed. Initial browser run: 78/84; six failures included timing under concurrent recording and HMR invalidation, plus repeated DOM texture requests with cache disabled. DOM now reuses decoded startup textures. All six failed scenarios passed in an isolated rerun. Clean CI regression and signed APK verification pending. Captures in material-0.22 are actual Chromium frames on prepared positions, not physical Android playtests. Physical FPS, touch feel and sound/haptics remain unverified.

CI 41083096407: 79/84 browser checks passed; five timing/capture failures blocked Android. Corrected test input timing (sample score from pointerup, rapid moves use coordinates rather than waiting for animation stability; await loaded/visible controls). CI video/WebGL tests now use one worker and 60s scenario timeout, with existing assertions unchanged. Bed graphics are cached between board/theme changes instead of rebuilding 64 rounded wells every frame. Rechecked 13 evolution/reward/VFX/lifecycle scenarios locally; all passed. Full CI repeated below.

## Final delivery

CI 41085251301 passed 86 unit + 84 browser and built Android, but its experimental-branch signing certificate differed from 0.21. That artifact was rejected and not delivered. The exact tested source 020bcea83f8baa11d97e1547f7ad24e476cfda4f was fast-forwarded into feat/classic-preview. PR #1 CI 41087267032 again passed all 170 checks and Android build, restoring the established signing cache.

Delivered blocky-0.22-preview.apk: com.danilah.blocky.dev, versionCode 22, 0.22.0-preview, 9,955,419 bytes. SHA256 d79bc8a21508a0bf8e973b1865bfc89ecc00ee41cceddca313e32b4d44f84eac. Android apksig 8.9.1 verifies the signature; signer certificate SHA256 e96d961e605c768113f398ccca8bf3e93aaed52ddb48c5d0c9b3f259f5fdbe13 matches 0.21. All 16 production files match a clean local build byte-for-byte; no unused study textures or source masters are in the APK. Machine report: material-0.22/apk-verification.json.

Physical installation, FPS and subjective feel are not claimed tested. Existing saves/rules are unchanged. Signing cache scope is a preview limitation; keep using the established PR #1 release path until a durable signing secret replaces cache-based signing.
