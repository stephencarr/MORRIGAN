# MORRIGAN Mobile 0.1 verification — 2026-11-16

**Historical checkpoint.** Version 0.2 corrects the startup preset and adds the complete LIRA panel; see [current verification](MOBILE_V2_VERIFICATION.md).

## Outcome

**PARTIALLY VERIFIED:** a debug Android APK has been built for stock Pixel 9 (ARM64), with a real LIRA/libpd engine, Android USB MIDI input, an original amber oscilloscope and eight momentary test pads. It is an installable development artifact, **not yet a device-validated instrument**. No phone was connected, flashed or modified. No public release or deployment was created.

The native control-to-audio path is verified on this Linux host. The Android app and test APK compile; Android runtime acceptance is still blocked by the cloud emulator environment. Compiling a test is not a passing runtime test.

## Evidence

| Check | Observed result | Classification |
| --- | --- | --- |
| Original LIRA patch | Packaged SHA-256 matches pinned upstream `_LIRA-8.pd` exactly | VERIFIED |
| libpd/LIRA host render | 460,800 frames, 48 kHz, 9.6 seconds; every voice non-silent, released voices silent; tuning change affects measured crossings | VERIFIED on Linux x86-64 |
| Host output safety | Peak 0.220499337; 0 clipped/limited samples; 0 invalid samples under the defined conservative preset | VERIFIED for these test conditions |
| Native negative cases | Invalid parameters/frame sizes and incorrect thread ownership rejected; shutdown/reinitialization checked | VERIFIED on Linux x86-64 |
| MIDI parser and mapper | 17 tests passed: fragments, running status, interleaved real-time, malformed input, ownership, panic/disconnect, standard/LCXL maps | VERIFIED pure Java; not USB hardware |
| Android build | `:app:assembleDebug :app:assembleDebugAndroidTest :app:lintDebug`: BUILD SUCCESSFUL, 74 tasks | VERIFIED cross-build |
| Lint | 0 errors, 4 warnings: backup migration declaration, two drawing allocations, foreground-playback wake lock without timeout | VERIFIED; warnings retained |
| APK signing | `apksigner verify --verbose`: valid v2 signature, one signer | VERIFIED debug signature |
| APK alignment | `zipalign -c -P 16 4`: pass; both ABIs have 16,384-byte ELF LOAD alignment and aligned uncompressed ZIP entries | VERIFIED static properties; not a 16 KB device run |
| Packaged notices/provenance | LIRA/libpd/Pd and MORRIGAN licences, NOTICE and exact source revisions present | VERIFIED |
| Android service/UI/JNI integration | Smoke suite compiles, but could not run; app installation blocked by unstable emulator framework | BLOCKED |
| Physical USB MIDI, sound output, controller LEDs | USB input implementation exists; no real device test. LED feedback is outside this prototype | PROPOSED / unverified hardware |
| Pixel latency, thermal reliability, page modes, screen-off playback | No hardware available | BLOCKED |

Recorded output: [native render](evidence/mobile/native-render.log), [MIDI tests](evidence/mobile/midi-tests.log), [APK inspection](evidence/mobile/apk-check.json). The native log's `checks=468074` includes per-sample assertions; it is not 468,074 independent test cases. A zero-crossing estimate demonstrates tuning response and is not an accuracy calibration.

APK SHA-256: `229842ae6ca8a95bcfaddb2856673f6a209d79b8a0ac23acece1330b8e61e653` (3,144,879 bytes). Development artifacts are stored outside Git at `/workspace/artifacts/MORRIGAN-Mobile-debug.apk` and `/workspace/artifacts/MORRIGAN-Mobile-source.tar.gz`. The host recording is `/workspace/artifacts/morrigan-mobile-root.wav`; it demonstrates the native DSP, not Android speaker output.

## Reproduction

See [mobile/README.md](../mobile/README.md) for tool versions, source preparation, native/MIDI tests, APK build and the Android instrumentation command. The same source generates ARM64 and x86-64 libraries. The Android test must report `PASS` and write `smoke-result.json` before Android runtime acceptance can be recorded.

Execution host: Debian 13 x86-64, no `/dev/kvm` or exposed audio device. Build used JDK 21, Gradle 8.13, AGP 8.9.2, Android SDK/build-tools 35, NDK 28.0.13004108 and CMake 3.31.6. User-level toolchain/cache paths are development setup details, not committed machine-specific requirements.

## Emulator failure boundary

An AOSP Android 15/API 35 x86-64 emulator was attempted with software CPU emulation, SwiftShader and a virtual audio sink. Android's Watchdog repeatedly killed `system_server` during startup (`Blocked in handler on main thread ... for 60s`). Package, settings and window services disappeared/restarted. APK installation returned `Failure calling service package: Broken pipe (32)` / `Can't find service: package`.

Extending the test emulator's watchdog timeout did not stabilize the framework. The emulator was stopped after repeated failures. These failures occurred before MORRIGAN could be installed and are not evidence of an app crash. Conversely, they provide no evidence that the app's runtime behavior passes. No UI screenshot or visual acceptance is claimed.

The compiled smoke suite covers real JNI/LIRA/AudioTrack output, all eight voice controls, injected MIDI bytes, touch/MIDI ownership, activity backgrounding, focus-loss stop, panic, restart and startup cancellation. It still needs execution on an accelerated emulator or development phone. Its MIDI injection does not test USB enumeration, cables, hubs or electrical behavior.

## Implementation and specialist results

- Native audio: `mobile/app/src/main/cpp/`, `NativeLira.java`, source preparation and host tests; [MOBILE_AUDIO.md](MOBILE_AUDIO.md).
- USB MIDI: `mobile/app/src/main/java/org/morrigan/mobile/midi/`, 17 unit tests and [MOBILE_MIDI.md](MOBILE_MIDI.md).
- Scope/interface: `ScopeView.java`, touch/accessibility behavior and [MOBILE_UI.md](MOBILE_UI.md).
- Pixel feasibility: [PIXEL9.md](PIXEL9.md), including foreground playback, USB host direction, hub/charging and page-size requirements.
- DroidParty comparison: [DROIDPARTY.md](DROIDPARTY.md), primary-source inspection and published APK analysis. No upstream code copied.
- Integration: Activity, foreground service, AudioTrack worker, focus/route/wake-lock lifecycle, Gradle/manifest packaging, instrumentation, APK checks and documentation. Specialist changes were reviewed; combined Android builds and host tests passed within the boundaries above.

The earlier Linux first-sound proof remains in the repository. This mobile checkpoint does not complete Linux desktop, Raspberry Pi boot or ZacOS milestones.

## Next acceptance gate

1. Install the debug APK on the Pixel 9. Press Start and hold each voice pad. Confirm sound, real scope activity, release and Panic/Stop. Check portrait/landscape, rapid touches and screen edges.
2. Connect the actual controller through a USB data/host adapter or powered hub. Test note/CC mappings and LCXL Factory Template 1/channel 9 as documented. Unplug while a voice is held; it must release. Reconnect and trigger again.
3. Run the instrumentation suite on a development device and retain its explicit result. Check Home/background, screen-off MIDI, focus interruption, headphones/DAC route changes, notification Stop and repeated launches.
4. Test at least a sustained playing session with the actual hub/DAC/charging setup; record underruns, measured latency, heat and battery behavior. Test 16 KB page mode separately if enabled. No measured latency or reliability target has passed yet.

The only user-supplied requirement for this gate is the phone and USB controller/adapter. No credentials, bootloader unlock or OS replacement are needed. Fix any runtime findings before calling the app ready for performance use.
