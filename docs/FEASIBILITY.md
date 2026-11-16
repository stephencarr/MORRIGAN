# Feasibility at the first-sound checkpoint

Evidence date: 2026-11-16. Development host: Debian 13 x86-64, ordinary user, no exposed sound device or Raspberry Pi. Sources are pinned in the component reports; actual run results are in [VERIFICATION.md](VERIFICATION.md).

| Question | Finding | Classification |
| --- | --- | --- |
| Can ZacOS realistically run on ARM64? | Its core uses portable C/C++ and ordinary wlroots/Qt/Wayland interfaces; 19 principal dependencies exist in Debian 13 ARM64 metadata. Reproduced amd64-only assumptions in a packaging test have a small candidate patch. Full native build, Pi graphics and session behavior still need testing. | PARTIALLY VERIFIED; actual ARM64 runtime validation BLOCKED by available hardware/build environment |
| Can standalone LIRA run headlessly? | The real patch runs in vanilla Pure Data without a GUI, accepts control messages from another process and writes measured audio. | VERIFIED on this x86-64 development host |
| What dependencies are required for this proof? | Python standard library, Git, GNU Make/GCC; pinned Pd source; standalone LIRA and its included abstractions. A local dummy-backend Pd build avoids a sound device and external Pd packages. | VERIFIED for the tested proof; real-device audio packages/configuration remain separate |
| What controls are available? | 47 preset parameters plus eight sensor controls through instance-local Pd symbols. The adapter names and bounds these controls. Original MIDI handling and GUI initialization are investigated in LIRA.md. | VERIFIED by source and representative runtime tests; not every parameter is audibly characterized |
| What works without hardware? | Process startup, DSP loading, external control, all eight voices/releases, tuning response, PCM analysis, input validation, process failure handling and source/packaging probes. | VERIFIED to the extent reported in the automated checks |
| Smallest demonstrable system? | One Linux user process drives a separate headless Pd process and produces a WAV, event log and report. No desktop or physical controller is needed. | VERIFIED |
| What remains unverified? | Pi CPU/thermal capacity, DAC stability/latency/XRUNs, real USB MIDI, boot and shutdown, continuous service recovery, desktop graphics/input and audio continuity across display/session failures. | PROPOSED tests; hardware validation BLOCKED until a suitable test device is available |

## Consequences

The central sound experiment can advance independently of ZacOS. Keep Pi 5 as the initial candidate; the current evidence does not justify selecting a different platform or declaring Pi adequate for maximum workloads.

Use the existing standalone LIRA source. Precompiled plugin binaries are unnecessary for the first path. The source's duplicated-mono output satisfies a two-channel capture test, but is not an independent stereo sound field.

Do not install ZacOS's x86 ISO/GRUB installer on a Pi. First build the desktop as userspace on a supported ARM64 Linux base, keeping the Pi kernel/firmware/boot setup intact. The candidate packaging patch is a bounded first correction, not an estimate of the entire port.

Clatter is technically plausible in ARM64 Chromium but is not integrated or benchmarked here. Its AudioWorklet DSP and main-thread sequencing have different failure boundaries. Keep it behind the first real-device LIRA/audio ownership milestone.
