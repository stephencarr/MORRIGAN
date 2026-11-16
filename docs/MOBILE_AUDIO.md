# MORRIGAN Mobile: native LIRA audio

## Implementation and ownership

The Android service owns one audio worker. That worker alone calls `NativeLira.initialize`, `setParameter`, `process` and `shutdown`. MIDI and touch input queue named values to it; Canvas rendering never executes DSP. Native code verifies thread ownership and rejects cross-thread access rather than racing libpd.

`NativeLira` loads `libmorrigan_lira.so`, which statically links libpd. It opens the **unmodified** upstream standalone `_LIRA-8.pd` and uses `libpd_getdollarzero` to address its instance-local `<id>-r-<parameter>` receivers. The original oscillators, envelopes, mixing, effects, GUI-control forwarding objects and `dac~` remain intact. There is no network listener, generated oscillator, browser runtime, copied Macintosh software or external Pd plugin dependency.

The engine has zero audio inputs and two outputs. LIRA's original mono output is duplicated into left/right; this is not a native stereo sound field. Processing happens in 64-frame Pd ticks, accepting 64..4096 frames per JNI call. The Android service chooses the streaming AudioTrack configuration and feeds these actual PCM samples to the scope.

Initialization lets upstream loadbang/preset events settle into discarded buffers, then applies a moderate initial preset with all eight sensors released, volume 64/127 and feedback/distortion/holds off. Output clamps nonfinite samples to zero and finite excursions to ±0.95. This is a last-resort ceiling, not a transparent mastering limiter. The test preset does not hit it. Root audio/MIDI scheduling, hardware buffering and service lifetime are documented separately in the mobile app record.

## Pinned sources and build

| Source | Revision / terms |
| --- | --- |
| LIRA-8 | `6a6b6cbc3359a20d7741c9270c7690ab6b21c92a`; Miguel Moreno, BSD three-clause style |
| libpd 0.16.1 | `ba0dc63262901d658af8bbda5e619a60fa975e78`; BSD three-clause style |
| libpd's Pure Data submodule | `f009fd8d7b537e209e09898d487fdf1bf547da2b`; observed runtime version 0.56.5, BSD three-clause style |

This mobile libpd pin is separate from the earlier standalone-process proof's Pd 0.56-2 pin. Both use the same LIRA revision.

```sh
python3 mobile/tools/prepare_lira.py
```

The script fetches exact source revisions into ignored `mobile/.cache`, rejects changed source checkouts, and copies original standalone assets into `mobile/app/build/generated/liraAssets/lira`. It writes source provenance and full LIRA/libpd/Pd notices into the generated asset tree. It never updates an existing checkout to another revision or patches upstream DSP. Android copies `assets/lira` into the application's private writable storage before opening it because upstream preset helpers use local files.

The CMake entry point is `mobile/app/src/main/cpp/CMakeLists.txt`, minimum CMake 3.25, with `LIBPD_SOURCE_DIR` defaulting to `mobile/.cache/libpd`. It builds libpd static with optional extras/utilities disabled and a small JNI shared library for Android. NDK r28 is used by the app build. **Android API 28 or newer is required:** an API-26 cross-build exposed Pd's use of `glob`/`globfree`, which bionic only supplies from API 28. The JNI shared library explicitly requests 16 KiB ELF maximum-page alignment; actual packaged ELF/APK alignment still must be inspected after each release build.

Original MORRIGAN bridge code follows the repository's GPL-3.0-only terms. Fetched upstreams retain their notices; generated assets include those notices for binary packaging. No association or endorsement by SOMA or upstream authors is implied.

**VERIFIED cross-build:** NDK `28.0.13004108`, Android API 28, CMake 3.31.6 successfully produced both `arm64-v8a` and `x86_64` JNI shared libraries. `llvm-readelf -lW` showed `0x4000` alignment for every LOAD segment in both binaries (16 KiB). ARM64 dynamic dependencies are only Android system `libm.so`, `libdl.so` and `libc.so`; no separately packaged C++ runtime or libpd shared object is needed. This establishes build/link/alignment properties, not execution on a Pixel.

## Host acceptance test

The native acceptance binary links **the same `morrigan_core` and libpd source** as the Android JNI library:

```sh
python3 mobile/tools/prepare_lira.py
cmake -S mobile/app/src/main/cpp -B mobile/.cache/host-build \
  -DCMAKE_BUILD_TYPE=Release
cmake --build mobile/.cache/host-build -j 4
mobile/.cache/host-build/morrigan_native_test \
  mobile/app/build/generated/liraAssets/lira /tmp/morrigan-mobile-native.wav
```

Observed on Debian 13 x86-64, 2026-11-16:

- All eight voices individually audible; every release returned measured output to silence.
- All eight voices together audible.
- Tuning control 24 → 96 changed positive-going zero crossings from approximately 11.97 to 382.98/second. This measures a causal waveform change, not precision fundamental frequency.
- A 9.6-second, 48 kHz, 16-bit, two-channel WAV was produced. Left/right samples matched the upstream mono duplication.
- Whole-run float peak: **0.220499337**; zero limited or nonfinite output samples.
- Invalid selector, nonfinite/range/discrete values, invalid frame size, uninitialized/double-initialized states and wrong-thread processing were rejected.
- Engine shutdown and reinitialization both passed.

Session artifacts: `/workspace/artifacts/morrigan-mobile-native.wav` and `/workspace/artifacts/morrigan-mobile-native.log`. The many sample assertions in the log are not separate user-facing test cases.

## Verification boundary

**VERIFIED:** actual native libpd/LIRA DSP, named control input, generated PCM, process-independent no-GUI source integration, single-thread boundary and restart on this x86-64 host.

**Separate validation required:** Android JNI execution, AudioTrack behavior, Pixel 9 physical USB MIDI, audio device routing, actual sample rate/latency/underruns, foreground-service behavior under Android lifecycle events, long-duration thermal load and background/screen-off operation. A successful host render or ARM64 cross-compile does not establish any of those hardware facts.
