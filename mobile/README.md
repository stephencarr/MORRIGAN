# MORRIGAN Mobile — stock Android prototype

A compact, offline instrument app for **Pixel 9 running stock Android**. It embeds real LIRA/libpd, accepts class-compliant USB MIDI through Android's MIDI framework, and displays the generated audio in an original amber, classic-computer-inspired oscilloscope window.

It is an ordinary app. No bootloader unlock, root, custom ROM, Macintosh emulator/ROM, desktop environment, browser, microphone access or network service is involved. Source code and hardware validation limits are documented below.

## Install and play

Install the supplied `MORRIGAN-Mobile-debug.apk` on the phone. Android may ask you to allow installation from the browser/file manager used to open it. This is a debug-signed development build, not a Play Store release.

1. Open **MORRIGAN Mobile** and tap **Start**. Allow notifications if you want playback controls/status in Android's notification area.
2. Hold one of the eight pads at the bottom of the LIRA panel. These are momentary voice triggers; the small scope above the panel displays the real generated audio.
3. All **47 original LIRA parameters** are available on the panel, grouped like the upstream instrument: hyper-LFO, delay, distortion, group pitch/hold, four voice pairs and eight individual tunings. Tap a continuous value to open its larger precision slider; switches/selectors show their actual state. The panel scrolls when the viewport or font size cannot accommodate everything.
4. **LIRA reset** restores the upstream musical preset while keeping your current master volume. The original preset includes distortion, delay and feedback: their texture and audible release tails are intentional. **Panic** stops audio immediately; tap Start to resume.
5. Connect the MIDI controller through a USB-C **data/host** adapter or powered hub. Select **NOTES** for a keyboard, or **LCXL** for the Launch Control XL Mk2.
6. For **NOTES**, MIDI note numbers **36–43** trigger voices 1–8 on any channel; **CC20–27** tune those voices and **CC7** controls master volume. These notes select LIRA voices, rather than transposing them like a conventional keyboard synthesizer.
7. For **LCXL**, use **Factory Template 1 / MIDI channel 9**. The first row of eight buttons acts as momentary triggers; the top row of eight knobs tunes the voices. See [the exact MIDI mapping](../docs/MOBILE_MIDI.md). MIDI changes appear on the panel. Other synthesis controls are available on-screen; the controller mapping has not been expanded to all 47 parameters.
8. Parameter edits are retained across Stop/Start and saved locally. Gates and group Hold values are released on stop/panic/start for silent startup. Adjust master volume conservatively, and use Android's system media volume for listening level.

This update fixes the previous app's dry test preset accidentally becoming its musical startup sound. The upstream DSP remains unchanged. The first launch after upgrading uses LIRA's supplied settings, retaining the earlier master volume; later launches restore your edits. [Audio comparison and test procedure](../docs/MOBILE_AUDIO_COMPARISON.md).

USB MIDI is input-only in this version: no MIDI learn, controller LED feedback, sequencer or preset browser is claimed. The eight voices and their synthesis/effect graph come from LIRA. The original mono output is duplicated to both channels.

The app remains available to MIDI while its playback foreground service is running, including when the Activity is backgrounded. Leaving the screen releases on-screen touches. Calls/audio-focus loss, the notification's Stop action and a noisy-output-route change stop playback rather than silently resuming. Android may still stop apps under exceptional resource/permission conditions; test your actual device.

For controller + USB DAC + charging simultaneously, use a compatible powered USB-C data/PD hub. A charge-only cable will not carry MIDI. Pixel 9 speakers are a valid initial output; the exact hub, controller, DAC, charge and route combination still needs physical verification. [Pixel testing instructions](../docs/PIXEL9.md).

## Build from source

Requirements: JDK 17 or 21 with compiler and `jlink`, Python 3.10+, Git, Android SDK platform 35/build-tools 35.0.0, NDK `28.0.13004108`, CMake `3.31.6` and Ninja. The Android Studio SDK manager can install the Android tools; a user-level Python environment can supply CMake/Ninja if your SDK manager does not provide that CMake version.

```sh
# From the repository root; accept the Android SDK licences through your SDK manager.
python3 mobile/tools/prepare_lira.py
cd mobile
# Set sdk.dir in ignored local.properties (or ANDROID_HOME).
# If CMake is outside the SDK, also set cmake.dir to its installation directory.
./gradlew :app:assembleDebug :app:assembleDebugAndroidTest :app:lintDebug
```

Output: `mobile/app/build/outputs/apk/debug/app-debug.apk`, containing `arm64-v8a` for Pixel 9 and `x86_64` for emulator testing. The native minimum API is 28; target/compile API is 35. The build fetches exact libpd, Pure Data and LIRA sources into ignored `mobile/.cache`; it does not patch upstream DSP. The Gradle distribution is checksum-pinned. Build tools/dependencies need network access during setup; the installed app does not.

The `preBuild` step verifies the pinned sources and assembles patch assets, licence files, provenance and original-code COPYING/NOTICE. Local SDK paths, caches, generated files, APKs and signing keys are not committed. Keep the matching source and notices with any binary you redistribute. This branch has no public-release or deployment workflow.

## Verification commands

```sh
# Pure Java MIDI parser/mapping tests, no phone needed:
python3 mobile/tests/midi/run_tests.py

# Check all 47 panel controls/defaults against the original Pd GUI/preset:
python3 mobile/tests/controls/run_tests.py

# Android view rendering/interaction tests on the host (Robolectric):
cd mobile && ./gradlew :app:testDebugUnitTest && cd ..

# Real libpd/LIRA native proof on a Linux development host:
cmake -S mobile/app/src/main/cpp -B mobile/.cache/host-build -DCMAKE_BUILD_TYPE=Release
cmake --build mobile/.cache/host-build -j 4
python3 mobile/tests/native/run_test.py --output /tmp/morrigan-mobile.wav
python3 mobile/tests/audio_compare/compare.py --output /tmp/morrigan-comparison

# Packaged ARM64/x86_64 ELF and ZIP alignment, source pins and licence assets:
python3 mobile/tests/verify_apk.py mobile/app/build/outputs/apk/debug/app-debug.apk

# On an emulator or an explicitly connected development phone:
adb install -r mobile/app/build/outputs/apk/debug/app-debug.apk
adb install -r mobile/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
adb shell pm grant org.morrigan.mobile android.permission.POST_NOTIFICATIONS
adb shell am instrument -w org.morrigan.mobile.test/org.morrigan.mobile.SmokeInstrumentation

# The final instrumentation result must explicitly say PASS, not just exit 0.
adb shell run-as org.morrigan.mobile cat files/smoke-result.json
```

The Android smoke suite runs actual JNI/LIRA/AudioTrack, checks scope PCM, eight touch voices/releases, MIDI byte-to-engine integration, mixed touch/MIDI ownership, foreground playback, focus-loss behavior and stop/restart. It does **not** emulate the USB electrical connection or certify Pixel hardware latency. The test starts/stops audio and alters app state; run it on a development device.

## Architecture and known limits

One Android app/process contains the Canvas Activity, MIDI adapter and foreground service. One worker exclusively owns libpd and AudioTrack; the UI reads bounded scope snapshots and MIDI/touch controls update a coalesced parameter queue. Process-wide serialization prevents overlapping native owners during service teardown/recreation. This is a pragmatic stock-app design, not the earlier Linux service/desktop architecture.

Audio uses float stereo AudioTrack with a low-latency request and 256-frame native blocks. The displayed buffer size, **XRUN** (AudioTrack underruns), and **LIMIT** (safety-ceiling samples) are diagnostics, not measured controller-to-sound latency. Tap the status line to see the full details. LIMIT rising means the output ceiling is altering peaks; reduce VOL or feedback. XRUN rising suggests the audio output is not being supplied on time. A final native safety ceiling clips excursions to ±0.95 and replaces nonfinite samples with zero; it is not a mastering limiter. The conservative test preset does not hit that ceiling.

Native ELF and APK ZIP alignment must both be checked for 16 KB page support. Actual Pixel 9 playback, USB MIDI hot-plug/power behavior, Bluetooth/USB routes, page-size modes, latency and long-duration thermal/background reliability require physical testing. See the recorded results in [MOBILE_V2_VERIFICATION.md](../docs/MOBILE_V2_VERIFICATION.md).

Related project review: [PdDroidParty](../docs/DROIDPARTY.md). It uses the same libpd foundation, but its standard widgets do not supply the real audio scope this app needs.

Further details: [native audio](../docs/MOBILE_AUDIO.md), [USB MIDI](../docs/MOBILE_MIDI.md), [scope UI](../docs/MOBILE_UI.md), [Pixel 9](../docs/PIXEL9.md), and [licensing](../docs/LICENSES.md).
