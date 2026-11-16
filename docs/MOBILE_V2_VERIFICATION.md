# Mobile 0.2: original LIRA sound and complete panel

Evidence date: 2026-11-16. This update fixes the first app's dry calibration preset becoming its startup sound and exposes all 47 original LIRA parameters. The scope now occupies 48 dp above the compact module panel; continuous controls open precise native sliders, and switches show the original options. The eight audition pads remain momentary. Controller changes update the panel, and edits persist locally.

## Audio acceptance

**VERIFIED on Linux x86-64:** production MORRIGAN core versus an independent direct-libpd host of the pristine original patch, with the same source-derived settings, 48 kHz rate and timed control events:

- Factory sequence: 552,000 frames / 11.5 seconds; **1,104,000 samples identical**, maximum and RMS difference zero.
- All 47 parameters exercised: 950,400 frames / 19.8 seconds; **1,900,800 samples identical**, maximum and RMS difference zero.
- No safety-ceiling hits or nonfinite replacements in either comparison.
- Dedicated cross-modulation comparison: 408,000 frames / 8.5 seconds; all **816,000 samples identical** to the original-engine reference. MOD moves 0 → 48 → 96 → 0 with sources routed between voice pairs; a separate MOD=0 control run establishes that the sound change follows the parameter changes.
- Previous dry preset differs substantially: RMS difference from the restored preset 0.0406182537. It had removed the original distortion, delay, modulation and varied tuning.
- Separate native regression passes eight voices, releases, tuning, negative cases, ownership and restart. Peak 0.234861925, no limiting/invalid samples. Calibration settings now belong explicitly to this test.

[Comparison method and commands](MOBILE_AUDIO_COMPARISON.md), [recorded comparison](evidence/mobile-v2/audio-comparison.json), [native regression](evidence/mobile-v2/native-render.log).

The native factory master is reduced from 127 to 64. The app preserves the user's master value (initially 63.5), and LIRA reset never raises it. Factory delay tails and distortion remain intentional parts of LIRA's sound. The output ceiling at ±0.95 can affect extreme settings; the new LIMIT counter exposes that intervention. XRUN separately reports AudioTrack underruns.

This comparison verifies the adapter/defaults against direct libpd, not a different Pd runtime, physical Lyra instrument or Pixel speaker recording.

## Control and interface acceptance

The Java catalog is checked against actual `gui.link` indices, values in the pinned `parameters.txt`, and widget ranges in `_LIRA-8.pd`: all 47 match. `vibrato` is correctly binary. Seventeen existing MIDI parser/mapper tests also pass.

**10 host tests passed, zero failures/skips**: five panel interaction/layout tests, four service-state tests and one native rasterization check. Recorded XML results are in `docs/evidence/mobile-v2/`.

Host Android-widget tests use Robolectric 4.18 native graphics mode and Android API 35, with the full-hierarchy multitouch test on API 34 because the test framework's API 35 MotionEvent splitting corrupts coordinates/timestamps. The production app has no workaround for that host-test defect. They cover all 47 parameter callbacks, real SeekBar gestures, MIDI-driven value updates, primary actions, pad down/up/cancel and multitouch, controller-held pad highlighting, stopped-state editing, invalid values, master-preserving reset and persisted state after service recreation. Portrait and landscape bounds/reachability are checked and rendered as PNGs. These are host-rendered Android widgets, not phone screenshots; their scope fixture is a documented 512-sample slice of the actual reference recording.

The complete panel fits the tested 393 × 820 dp portrait viewport. All parameter rows have at least 44 dp height; eight adjacent tune/pad columns are necessarily narrower on this phone-width layout. Precision dialogs provide larger controls. Landscape/short windows scroll. Actual Pixel touch and accessibility use still require a device test.

## Reproduction and build

**VERIFIED build:** `assembleDebug`, `assembleDebugAndroidTest` and `lintDebug` succeeded. Lint reports 0 errors and 3 warnings (backup declaration, playback wake-lock timeout, and English-only number formatting). Both packaged native ABIs pass 16 KB ELF/ZIP alignment checks, and original patch/preset hashes and licences pass inspection. The debug signing certificate matches 0.1, permitting an in-place upgrade.

APK: `MORRIGAN-Mobile-0.2.0-debug.apk`, 3129455 bytes; SHA-256 `a58d25e4eb22ce4ece6bb075ca34b235e876caff5119e2131cb62c46cccb3436`. The corresponding source archive is `MORRIGAN-Mobile-0.2.0-source.tar.gz`. Both are session artifacts under `/workspace/artifacts/`; they are not public releases.

See [mobile/README.md](../mobile/README.md) for setup and commands. New checks:

```sh
python3 mobile/tests/controls/run_tests.py
python3 mobile/tests/audio_compare/compare.py --output /tmp/lira-comparison-new
python3 mobile/tests/native/run_test.py --output /tmp/lira-native-new.wav
cd mobile
./gradlew :app:testDebugUnitTest :app:assembleDebug :app:assembleDebugAndroidTest :app:lintDebug
```

Audio test output paths must be new. The runners use isolated patch copies because upstream LIRA automatically saves preset changes. APK inspection now verifies both the original patch **and factory preset** hashes, in addition to licences and 16 KB ELF/ZIP alignment.

The Android instrumentation suite now checks the restored factory sound, then explicitly selects dry calibration settings for exact release/silence checks. It compiles with the app but has not executed on a device. The previous cloud emulator framework failure remains documented in [the 0.1 report](MOBILE_VERIFICATION.md); the host UI tests do not replace JNI/AudioTrack/USB hardware acceptance.

## Listening and Pixel check

1. Install the 0.2 debug APK over the earlier app. Press LIRA RESET, set VOL to 64 for the reference level, and use a conservative Android media volume.
2. Listen to `reference.wav` and `morrigan.wav` through the **same output device**. They contain identical audio for the tested sequence. Compare `old-dry.wav` with `restored-factory.wav` to hear the preset correction; these intentionally retain their different levels rather than normalizing them.
3. Listen to `cross-modulation-reference.wav` and `cross-modulation-morrigan.wav` for a separate, matching cross-modulation example. The original supplied preset has pair MOD amounts at zero; raise MOD with SOURCE routed to another pair to hear those interactions.
4. Start the app and trigger voices with the pads/controller. Verify original effects/controls change the sound and their values update. Tap the audio status to inspect XRUN and LIMIT if glitches/distortion remain. Neither counter detects every possible downstream output problem.
5. Compare phone speakers with headphones/USB audio where available. If the reference file also sounds wrong on the same route, investigate that playback route or the desired patch settings. If only the live app glitches, retain route, Android version, parameter values and counter readings for runtime diagnosis.

No physical Pixel, USB MIDI/hub, Android low-latency scheduling, screen-off reliability, page-size runtime mode or thermal validation is claimed. No operating system replacement or public release was performed.
