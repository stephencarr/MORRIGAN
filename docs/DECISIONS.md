# Decisions

2026-11-16. These decisions apply to the first-sound checkpoint, not a frozen hardware specification.

| Decision | Reason | Revisit when |
| --- | --- | --- |
| Start from reset commit `da68b3e` on `morrigan-os/first-sound` | Keep the old browser workstation out of the new Linux architecture; preserve its history and the open reset PR | The user chooses how to merge the reset and new branch |
| Prove LIRA headlessly before desktop work | Explicit user acceptance criterion; eliminates GUI and compositor dependencies from the audio proof | The first-sound gate passes |
| Use upstream standalone LIRA in vanilla Pure Data | Reuses the actual engine and its eight voices; avoids ARM plugin-binary assumptions | A measured requirement justifies a different host |
| Use ordinary unprivileged Linux processes and an offline WAV sink for the first test | This Debian x86-64 host has no exposed sound device or Raspberry Pi; inspectable audio is possible without one | Hardware-backed ALSA/PipeWire tests become available |
| Keep a small, explicit, local control adapter | Test control-to-audio causality before designing a general app platform or hardware wire protocol | A second real application or physical controller exposes additional requirements |
| Treat ZacOS as preferred, with a separate ARM64 investigation | Desktop-port uncertainty must not delay sound and control work | A real ARM64 build and Pi graphics test can run |
| Pin fetched upstream source and keep it outside tracked project files | Reproducible experiments without bundling desktop assets, binaries or unknown transitive dependencies | Distribution packaging and licence audit are ready |
| Retain the previous MORRIGAN repository's GPL-3.0-only licence for original project code | Maintains the existing project's open-source terms after the reset; upstream components retain their own licences | Any licensing change is separately considered |
| No releases, deployments, service installation or upstream pushes | User's execution constraints; source commits and the previously requested new branch are sufficient | Explicit authorization and deployment acceptance tests |

The canonical handoff is product input, not proof that a milestone is complete. Evidence and limitations belong in the reports beside the implementation.

## Mobile checkpoint — stock Pixel 9 app

The user's later instructions select an ordinary Android app with a small classic-computer-inspired interface, scope and eight test pads, intended primarily for a USB MIDI controller. They supersede custom-ROM and desktop-separation requirements for this mobile prototype.

- One native Android Activity and playback foreground service in one app/process. A dedicated worker owns libpd and AudioTrack; UI updates never execute DSP. No replacement OS, Mac emulation or ZacOS is needed for this target.
- Embed original standalone LIRA through pinned libpd/Pd sources. Keep the graph unmodified; expose a bounded MIDI/touch adapter.
- Use Android's USB MIDI byte-stream framework with standard note/CC and LCXL Mk2 Factory Template 1 profiles. No MIDI learn or LED feedback in this checkpoint.
- Use original amber Canvas artwork and the system font. The scope displays actual generated PCM, with display-only auto gain.
- Start audio only after the user presses Start. Stop on audio-focus loss or noisy output-route changes; never automatically resume after process death.
- Keep the small host following the [PdDroidParty review](DROIDPARTY.md); adopting its patch UI would still require a scope renderer and lifecycle validation. A compatible wrapper remains a possible later addition.
- Deliver a debug APK and source branch for device testing. Android runtime and hardware acceptance remain open until tests actually execute; native host and static packaging results do not substitute for them.

### Mobile sound and full-panel correction

Version 0.2 restores the original LIRA musical startup settings. The previous dry calibration preset proved engine operation but was an unsuitable musical default. Tests now explicitly choose their calibration settings and compare factory output/47-control sweeps against a separate direct-libpd reference. App-level volume remains conservative and reset preserves the user's current master level.

Expose all 47 original parameters in a compact module panel, with a 48dp real-audio scope, native precision editors and eight momentary pads. The service owns validated, persistent control state; MIDI and touch edits are reflected on-screen. Small or landscape viewports may scroll rather than shrink controls indefinitely. No new synthesis or replacement LIRA engine is introduced.
