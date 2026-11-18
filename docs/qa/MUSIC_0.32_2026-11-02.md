# Music D — preview 0.32

Source commit: df220ac8588a6bf6e24778feeb2b6e82a89f2211.

## Implemented

- Owner-selected Cozy Puzzle In-Game 1 by MintoDog. CC0 provenance and source SHA256 are bundled in public/audio/CREDITS.txt.
- Complete 256-beat / 118 BPM loop, stereo 24 kHz Vorbis, 1,054,759 encoded bytes. Sample-aligned loopEnd excludes decoder padding; a 2 ms endpoint bridge removes the lossy-codec sample step without adding silence (measured seam delta 0). No HTML-media restart or music event on each placement.
- One cached AudioBuffer (24,993,792 decoded bytes in Chromium) and at most one live music source. A pending decode cannot start music after pause/focus loss. Music loading failure leaves gameplay/SFX available; no retry/decode per move.
- Separate persisted music and SFX levels, music default 35%. Existing sound=false with absent music setting stays silent. Changing SFX toggle preserves the separately resolved music level.
- Fade-in, smooth music level changes and event-based ducking: ordinary rewards 0.63 gain, all-clear 0.4, 35 ms attack; delayed smooth return. Safety stops on focus loss, pause, background and ads are immediate, not delayed fades.
- Pause/resume preserves position; already-unlocked audio resumes after lifecycle/focus permits it. SFX tails are cleared, not replayed. Initial playback still requires activation.
- Long reward tones are quantized to C-major pentatonic while music is enabled. Register still grows with the saved series, including a non-clear move inside a series. This is a diatonic constraint based on source pitch-energy inspection, not a proof of harmonic compatibility with every backing chord.

## Evidence

- 111 unit tests passed locally, including concurrent music starts, shared decode, late decode after stop, cached resume offset, muted/suspended starts and failed-load behavior.
- 8 related browser tests passed locally: existing audio-focus + gameplay and two new music scenarios. New scenarios verify real bundled decode/loop, memory budget, paused position, focus stop, independent volumes, persistence and a 320 px layout.
- scripts/check-music.mjs: music and SFX at maximum levels, 30 rapid rewards, 10 stop/resume cycles. Sample peak 0.44271 (<1), at most 18 SFX voices, stopped context suspended. Evidence in music-0.32/audio-check.json. This is a Chromium stress sample, not an exhaustive true-peak/mastering test.
- Settings screenshots reviewed at 390×844, 320×480 and 640×360 after the compact-layout fix. Production build and asset checks passed.

- Same-origin upgrade from the delivered 0.31 APK web payload to current production dist preserved the complete profile (game/RNG, records, settings, hint credits, reward intents/receipts); legacy sound=false yields music volume 0 and effects volume 100 with the effects toggle off, no page errors. Not a native installer test. Evidence: music-0.32/upgrade-031-032.json.

## Remaining acceptance

- Phone speaker/headphone listening, fatigue over 20 minutes, subjective seam and harmonic compatibility.
- Physical Android memory/performance, external music/audio focus and real ad SDK interruption/return. Browser checks are not a substitute.
- A full decoded buffer deliberately costs about 24 MiB to obtain a scheduled loop; no measured phone FPS or total process-memory claim.
- Production ad IDs, privacy/store work and other release gates from 0.31 remain unchanged.

## Compact-layout regression
The first full CI passed 106/107 browser scenarios and caught pause links below the viewport at 640×360. Pause links now share the fixed action area; short-screen settings are compact, and checkbox CSS excludes range inputs. Both the landscape regression and the 320×480 all-settings-visible check pass locally. An additional 13 related music, settings, failure-recovery, pause and feel scenarios passed after the layout fix.

## Final CI
Run 41449028972 on df220ac8588a6bf6e24778feeb2b6e82a89f2211: 111 unit and all 107 browser scenarios passed. Android build passed. APK: 0.32.0-preview / code 32, 11,084,685 bytes; signature verified and same certificate as 0.31. All 30 production files match a clean local build, including music and credits. SHA256 4273c9c1d3a5e926483c08a1ccf99a8b6f1af3b469f5faba7a08baa159fa41e5. Evidence: music-0.32/apk-verification.json.
