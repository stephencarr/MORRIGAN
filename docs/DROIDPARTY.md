# PdDroidParty investigation

Reviewed 2026-11-16. **Recommendation: retain MORRIGAN Mobile's small native Android/libpd app for the first Pixel 9 instrument. PdDroidParty is a credible, actively maintained alternative and a useful reference for a future patch-based app platform; it is not a drop-in scope widget.** No upstream code was copied or modified during this investigation.

## Sources and reproducibility

- Project: <https://droidparty.net/>
- Source: <https://github.com/chr15m/PdDroidParty>
- Inspected source commit: `f32debc2edc5a3d8c6ff2c8841ac080fbeade681` (2026-11-16).
- Read-only research checkout: `/workspace/morrigan-upstream/PdDroidParty`.
- UI documentation: <https://droidparty.net/documentation>
- Standalone packaging: <https://droidparty.net/pure-data-to-android-app>
- Website download inspected: <https://droidparty.net/builds/PdDroidParty-debug-351.apk>, listed as 2021-04-19.
- Download SHA-256: `c18e2ef5679ea0caaae01a4c00e06433fd58c2d85f45b25912b31410666ffd0d`.

The live website and checked-out source differ. The fetched website warns that patches made with Pd >0.50 may not work; the source's newly updated `docs/index.html` says Pd 0.57. Current `build.gradle` selects `io.github.libpd.android:pd-core:1.4.4-SNAPSHOT`. Do not apply the website warning to the current source without checking the resolved runtime. The exact snapshot artifact/transitive Pd revision was not resolved in this bounded review.

## Verified from primary source

| Area | Observed implementation | Implication for MORRIGAN |
| --- | --- | --- |
| Current activity | Source and pd-core dependency updated on 2026-11-16; MIDI source changed in October 2026 | The project is not abandoned merely because the website APK is older |
| Build | AGP 8.13.1, Gradle 8.13, NDK 29.0.14206865; compile SDK 34, target SDK 36, min SDK 28 | Modern toolchain, but exact source build and merged manifest still require validation |
| Native ABIs | `jni/Application.mk`: armeabi-v7a, arm64-v8a, x86, x86_64 | Source explicitly supports ARM64; Pixel 9 compatibility is plausible, not device-tested |
| Audio | Android `PdService`, `PdBase.openPatch`, asynchronous patch load and service audio startup | Existing Pd engine integration; GUI need not process each audio block |
| MIDI | `Midi.java` uses Android `MidiManager`, `MidiToPdAdapter` and `PdToMidiAdapter` | System-recognized USB MIDI devices can feed Pd and receive feedback; this is not limited to network MIDI |
| Device selection | UI chooser; first available device output feeds Pd; first available input receives Pd MIDI | One selected device with one port in each direction; controller-specific mappings still need a patch/adapter |
| Hotplug | Device callback handles addition/removal; selected-device removal closes it | Basic disconnect handling exists; no automatic reconnect or held-voice panic in this class |
| Interface | Parser emulates top-level buttons, toggles, sliders, radios, labels, touch surfaces and other named widgets | Eight test buttons and small custom control UI are feasible |
| Visual style | SVG widget/background theming, optional supplied TTF font | An original amber/classic-computer appearance is feasible without Macintosh ROMs/assets |
| Scope | `PdDroidPatchView.buildUI()` has no array/graph/scope case; no Pd array reading in the Java view implementation | An ordinary Pd graph-on-parent oscilloscope is not automatically rendered. A custom scope widget or a different explicit data-to-view path is still needed |
| Bundled application | `pack-patch` creates `res/raw/patch.zip`; `PatchSelector` recognizes and unpacks this baked patch; `convert-app-name` exists | Can distribute a dedicated instrument APK, not only open patches in the general browser |

A patch project uses `droidparty_main.pd`. A wrapper can instantiate the existing LIRA engine and connect suitable MIDI/control symbols to it. Pd buttons or touch abstractions can send trigger/release events; the engine need not be rewritten. A real scope must display samples from the actual engine rather than decorative animation.

## Published APK inspection

Executed `aapt dump badging /tmp/PdDroidParty-debug-351.apk` and parsed every native ELF program header from the ZIP using Python `zipfile`/`struct`, without executing the APK:

```text
package cx.mccormick.pddroidparty
versionCode 351; versionName 7d3231ae
min SDK 17; target SDK 29; compile SDK 29
ABIs: arm64-v8a, armeabi-v7a, x86, x86_64
all 12 ARM64 libraries: PT_LOAD p_align = 65536 for both LOAD segments
other ABIs' libraries: PT_LOAD p_align = 4096
ARM64 libraries are compressed ZIP entries (deflate)
```

**PARTIALLY VERIFIED:** the published APK includes ARM64 and its ARM64 ELF segment alignments are compatible with the 16 KB alignment requirement. This is not proof of runtime behavior on a 16 KB device: code assumptions, extraction/loading, platform permissions and the actual sound path remain untested. Compressed native libraries are extracted, so uncompressed-library ZIP alignment is not the applicable check for this APK. It would be incorrect to reject it as 32-bit-only or ARM64 4-KB-aligned.

The current source uses NDK 29 and extracted native libraries (`useLegacyPackaging = true`), but also consumes a prebuilt pd-core snapshot. Inspect every resolved native library before claiming current-source 16 KB compatibility; a modern app NDK does not repair a prebuilt dependency automatically.

## Concrete integration work still required

1. Build the pinned current source with a pinned pd-core artifact. Replace the mutable SNAPSHOT selection with reproducible dependency metadata for any derivative.
2. Check the merged manifest and service startup on current Android. The app manifest declares `mediaPlayback|microphone`, while the two corresponding specific foreground-service permissions are commented out. A dependency may supply declarations; this review did not resolve the dependency or prove startup failure/success.
3. Review MIDI lifecycle. `finish()` nulls the manager without unregistering the anonymous callback; the source comment says it cannot be unregistered, but retaining the callback reference would permit the standard API. Add reconnect policy and release held voices on removal for a dedicated instrument.
4. Implement the actual audio scope and a minimal LIRA wrapper. SVG theming alone does not provide a scope. Test trigger release/cancel behavior, controller mapping and feedback.
5. Audit the broader patch browser, networking/file features and dependencies before shipping them unnecessarily in a fixed instrument app.
6. Run Pixel 9 audio/USB/hub and screen-off tests. Neither this source nor the downloaded APK was run on a Pixel in this investigation.

The website's online app-builder service is described as “Coming in 2021”; availability was not established and no paid service was used. The DIY scripts are present in current source, although the website references `README.txt` and the repository uses `README.md`. These instructions need validation rather than being treated as a turnkey build guarantee.

## Licensing and reuse boundary

**VERIFIED:** repository `LICENSE.txt` contains GPLv3; README identifies PdDroidParty as GPLv3 and libpd/Pure Data as BSD. Copying or deriving from the Android host/widget implementation requires compliance with its GPL terms, including corresponding source and notices when distributing covered binaries. Merely using the same underlying libpd library does not mean MORRIGAN contains PdDroidParty code. Check individual dependencies and artwork separately before bundling; this review did not audit every bundled graphic, font, JAR or external.

Reusable ideas without a host replacement: a small `droidparty_main.pd` integration wrapper for users who already have PdDroidParty, named send/receive controls, patch-local original SVG skins, and device-to-Pd/Pd-to-device mapping conventions. Importing its widget implementation is a deliberate GPL-covered code reuse decision, not required for the present native Canvas UI.

## Decision and limits

**PROPOSED:** keep the existing MORRIGAN Mobile host for now. It already targets the narrow requirement: original LIRA, USB MIDI, eight voice-test controls and a measured audio scope. Switching hosts would introduce new integration and regression work while still requiring custom scope rendering. Revisit PdDroidParty when user-authored Pd interface projects become a product requirement, or offer a separately tested wrapper patch as an additional integration.

**BLOCKED / not executed in this review:** current upstream build, LIRA-in-PdDroidParty render, Android service/runtime test, hardware latency, USB controller behavior and physical Pixel 9 verification. Source inspection establishes available mechanisms; it does not establish those runtime results.
