# MORRIGAN Mobile on a stock Pixel 9

Evidence date: 2026-11-16. The user's clarified target is a normal app on the existing Pixel 9 Android installation. A custom ROM, bootloader unlock, factory reset or replacement kernel is **not required for this version**. No physical Pixel or USB controller has been connected to the development environment.

## Recommended path

Install a native Android app that runs the existing LIRA engine through libpd, accepts USB MIDI through Android's MIDI service, and draws one original Mac-inspired amber oscilloscope screen. The visual treatment is not Macintosh emulation and does not require Apple ROMs, fonts or system software.

The app can keep audio on a worker thread in a foreground service while its Activity draws the scope. Both can live in one app process: this provides ordinary UI-thread separation, **not process isolation**. An app-process crash can stop both. The stock Android audio, USB, power and security stacks remain responsible for the device.

Use ordinary full-screen display and optional Android **screen pinning** for a dedicated instrument feel. Screen pinning is user-exitable; it is not a managed kiosk or a security boundary. Device-owner lock-task mode is a separate provisioning model and is unnecessary for the first playable app.

## What primary sources establish

| Claim | Evidence and status |
| --- | --- |
| Pixel 9 has a suitable Android development target and a USB-C port | **VERIFIED by Google's specifications:** Tensor G4, 12 GB RAM, 1080 × 2424 OLED, USB Type-C 3.2, stereo speakers; it launched with Android 14. These specifications do not establish LIRA performance. [Pixel hardware specifications](https://support.google.com/pixelphone/answer/7158570?hl=en), Pixel 9 section. |
| Android supplies a MIDI service and USB device identification | **VERIFIED by API documentation:** `MidiManager` is available from API 23, requires the MIDI system feature and supports device enumeration/open/hot-plug callbacks. `MidiDeviceInfo.TYPE_USB` identifies USB devices. For MIDI 1.0 on API 33+, enumerate `TRANSPORT_MIDI_BYTE_STREAM`; the legacy enumeration remains available but is deprecated. [MidiManager](https://developer.android.com/reference/android/media/midi/MidiManager), [MidiDeviceInfo](https://developer.android.com/reference/android/media/midi/MidiDeviceInfo). |
| The phone must act as USB host for a controller | **VERIFIED platform behavior:** Android in host mode enumerates attached peripherals and supplies bus power. Cable, hub, peripheral power and class compatibility still require a physical test. [USB host overview](https://developer.android.com/develop/connectivity/usb/host). |
| USB audio can use the ordinary Android playback route | **VERIFIED platform design:** Android detects compatible USB audio peripherals and applies audio-policy routing; stereo uses the first two channels. This does not guarantee a particular DAC, hub, rate or latency. [USB digital audio](https://source.android.com/docs/core/audio/usb). |
| Android 15+ can use 16 KB memory pages, including a Pixel 9 test mode | **VERIFIED documentation:** Pixel 9/9 Pro/9 Pro XL support the developer test option on Android 15 QPR2 or newer. It is incorrect to assume every Pixel 9 always uses 16 KB pages. Native libraries and APK packaging must support both applicable modes. NDK r28+ produces 16 KB-aligned ELF by default; AGP 8.5.1+ and APK alignment checks are recommended. [16 KB page-size guide](https://developer.android.com/guide/practices/page-sizes). |
| Continuous background playback needs a foreground-service lifecycle | **VERIFIED API requirements:** declare `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MEDIA_PLAYBACK` and `android:foregroundServiceType="mediaPlayback"`; start from an eligible user action/visible Activity and show the foreground notification. Target-35+ apps cannot start this service from `BOOT_COMPLETED`. [Foreground service types](https://developer.android.com/develop/background-work/services/fgs/service-types#media). |
| Audio focus matters on a stock phone | **VERIFIED requirements:** target-35+ apps can request focus only while the top app or running a foreground service. Focus denial must be handled. Calls/other apps can take focus; MORRIGAN should stop or mute appropriately. [Audio focus](https://developer.android.com/media/optimize/audio-focus). |
| Pinning and managed kiosk mode differ | **VERIFIED documentation:** screen pinning is user-exitable; true lock task requires allowlisting by a device policy controller. [Pin/unpin](https://support.google.com/android/answer/9455138?hl=en), [lock task](https://developer.android.com/work/dpc/dedicated-devices/lock-task-mode). |

**PARTIALLY VERIFIED:** the code/build and emulator/host results recorded by the mobile implementation can establish compilation, native integration and app behavior in those environments. Only a physical Pixel test can establish USB controller detection, real output behavior and sustained performance on this phone. Do not treat the earlier x86-64 headless WAV proof as Pixel validation.

## Practical connection setup

Start with the simplest route: Pixel 9 → USB-C host/data adapter → one class-compliant MIDI controller, and use the phone's speakers at low volume. The user's Launch Control XL Mk2 is the first controller candidate; select the matching app profile and Factory Template 1. Use the exact note/CC table in [MOBILE_MIDI.md](MOBILE_MIDI.md).

For headphones/line output plus MIDI and charging, use a **powered USB-C data hub with USB Power Delivery passthrough**, a compatible USB audio interface/DAC and the controller. A charge-only cable or a passive connector that does not provide a data/host path will not work. The phone has one USB-C connector; a hub must accommodate the simultaneous roles and peripheral power requirements. Prefer a verified powered hub rather than assuming the phone can supply every attached device.

USB-C shape alone does not establish compatibility. Test this exact combination of phone, Android build, controller, hub, cable, charger and DAC. PD charging while hosting peripherals is a physical interoperability test, not a promise supplied by the Android MIDI API. Avoid Bluetooth output for the initial timing acceptance because its buffering adds another latency source.

The Android MIDI framework handles class-compliant MIDI transport; the application should not need to implement raw USB packet transport. A device may enumerate as USB without exposing a usable MIDI output port. The app must report that condition instead of claiming it is connected. Here, a controller's **output port** is the app's incoming MIDI stream.

## Install and first launch

Use the APK produced by this branch's documented build procedure; do not download an unrelated binary or disable platform protections. An ordinary developer APK can be installed with Android's package installer or, with USB debugging enabled by the user:

```sh
adb devices
adb install -r /path/to/morrigan-mobile-debug.apk
```

The filename above is a placeholder for the actual build output. A debug build is a development artifact, not a signed production distribution. Upgrades must use the same signing identity; do not erase app data merely to work around an unexplained signature mismatch.

Open MORRIGAN from the launcher, start the instrument, keep output modest, and test the on-screen voice controls before attaching MIDI. On Android 13+, allow notifications if prompted so the foreground audio status/stop affordance is visible. A notification permission decision does not grant MIDI access or guarantee foreground-service success. No microphone permission is needed for synthesizing output or plotting the app's own audio samples.

For a dedicated view, enable app pinning in Android Settings if desired and use the app's Pin action or the overview-screen pin command. Follow Android's displayed unpin gesture; retain a working way to leave the app. Normal installation and pinning do not turn the app into the phone's operating system or give it automatic boot playback.

While the phone is the USB host for MIDI/audio, a wired USB ADB connection to the development computer normally cannot use that same port. Use Android's wireless debugging for simultaneous logs, then turn it off when finished. See the platform's [USB audio debugging note](https://source.android.com/docs/core/audio/usb#debug-while-in-host-mode).

## Physical Pixel acceptance checklist — not executed here

Record the phone model, Android build/security patch, page size, app commit/APK hash, controller firmware/template, hub/cables/charger, audio output device, sample rate and buffer configuration. With authorized debugging, useful read-only identity checks include:

```sh
adb shell getprop ro.product.model
adb shell getprop ro.build.version.release
adb shell getprop ro.build.fingerprint
adb shell getprop ro.product.cpu.abilist
adb shell getconf PAGE_SIZE
```

1. **Basic sound:** start without USB devices; verify all eight touch voices, release, Panic, master level and Stop. Confirm the scope follows actual rendered audio and settles after release. A decorative oscillator is not acceptable evidence.
2. **USB MIDI:** attach the controller before app launch, then repeat by attaching after launch. Verify the status identifies a usable USB MIDI device. Trigger each mapped voice and its release; test tuning and master CCs. Repeat notes rapidly; test note-on velocity zero as release and the configured MIDI channel/profile.
3. **Disconnect/reconnect:** unplug while holding one or several voices. Sound must release safely rather than remain stuck. Reconnect repeatedly and confirm there are no duplicate callbacks/triggers. Test more than one controller if the app claims simultaneous-device support.
4. **Audio routing:** test speakers first, then the exact USB DAC/hub. Confirm which device actually plays, both channels, sensible level, and the sample rate after route changes. Unplug/reconnect the DAC during idle and held notes; check for crash, stale playback, excessive level or an unexpectedly loud speaker fallback. Stop before changing routes during initial testing.
5. **UI/lifecycle:** rotate, multitouch, drag off a pad, cancel a gesture, pin/unpin, open another app, lock/unlock the screen and return. Verify the implemented foreground-service/Activity behavior rather than assuming audio persists across all transitions. Notification Stop must release audio and service resources.
6. **Stock-phone interruptions:** simulate audio focus denial/loss with another player or call. Confirm controlled silence and deliberate restart behavior; do not unexpectedly resume a held drone when focus returns.
7. **Performance:** run a defined eight-voice preset for at least 30 minutes, first on battery then charging through the intended hub. Capture actual output externally, underrun counters where exposed, CPU/temperature/throttling and battery behavior. Repeat with modulation/feedback presets after the conservative baseline passes. A low-latency request or smooth scope is not a measured latency result.
8. **Latency:** measure controller-event-to-analog-output timing using a repeatable external method. Record median and tail latency plus the exact audio route. Do not substitute buffer-size arithmetic, emulator timings or reported API latency for end-to-end measurement.
9. **Native compatibility:** on a suitable updated Pixel 9, test both the ordinary configuration and the official 16 KB developer test mode if available. Changing that mode/rebooting is a user-operated device test. Verify APK installation and native engine load in each; do not rely on compatibility warnings/modes as proof of correct packaging.

Before that physical run, confirm every packaged `.so` and the APK itself are aligned using the Android page-size guide; for example `zipalign -c -P 16 -v 4 APK_NAME.apk`. ELF alignment and zip alignment are separate checks.

## Remaining decisions

- **PROPOSED:** stock Android plus a native app is the default mobile product route. Revisit firmware only if measured hardware/API constraints demand it; it would introduce device/vendor/verified-boot maintenance without itself proving better sound.
- **UNVERIFIED:** this specific Pixel's USB host power behavior, controller/DAC/hub compatibility, native device performance, latency, underruns and thermal behavior.
- **User involvement when the APK is ready:** install on the phone, identify its Android version, connect the intended controller/hub/output, and perform the physical checklist. No credentials, factory reset or bootloader operation are needed for this stock-app path.

No hardware was flashed, unlocked, reset or reconfigured during this investigation. No Apple system software or proprietary Macintosh assets are required.
