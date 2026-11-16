# ZacOS 9: ARM64 feasibility investigation

Observed 2026-11-16. Upstream: <https://github.com/chromasystemprofessional/Zac-OS-9>.
Pinned source: `205cf6dcf80fd7a600a1fcfed56878eba69d241a` (Debian changelog 1.18.9).
The clone was read only; no patch, issue, PR or release was sent upstream.

## Decision

**PARTIALLY VERIFIED — a native Debian 13 ARM64 desktop build is plausible and worth pursuing. It is not yet a supported or demonstrated Raspberry Pi desktop.** The core is ordinary C/C++ over wlroots, Wayland and Qt; the required principal libraries are available in Debian's ARM64 archive. The current release and CI cover amd64 only. A concrete architecture-specific packaging-test failure has been reproduced, and a small candidate fix passes fixture tests.

**Keep ZacOS as the preferred desktop.** Run the first LIRA proof on conventional Linux now. A desktop build, boot image, compositor rewrite or imitation of ZacOS is not needed to prove headless audio. Desktop startup and instrument audio must remain separate processes/lifecycles.

## Evidence and limits

| Claim | Classification | Evidence / limit |
|---|---|---|
| Upstream targets Debian 13, wlroots 0.18 and Qt 6.8 | VERIFIED (primary source) | `CONTRIBUTING.md:14–16`; `compositor/meson.build:3`; `shell/meson.build:55–56`. C11/C++17 and Meson >=1.0 in root `meson.build:1–6`. |
| Published package is amd64 | VERIFIED | GitHub latest release `v1.18.9` contained `zacos9_1.18.9_amd64.deb` and `SHA256SUMS` when queried. README explicitly requests a 64-bit x86 PC and amd64 `.deb` (`README.md:156,169`). |
| Debian packaging allows other architectures | VERIFIED (source only) | `debian/control`: `Architecture: any`; `gnu-efi [amd64]`; `hardware/meson.build:26` gates the Intel Mac EFI binary to x86_64. This declaration is not evidence of a successful ARM build. |
| Core required libraries exist for ARM64 | VERIFIED (archive metadata) | Debian trixie ARM64 Packages index: wlroots 0.18.2-3, Qt 6.8.2, Wayland 1.23.1, LayerShellQt 6.3.4, libinput 1.28.1 and Mesa 25.0.7. Full observed versions/hash in `experiments/zacos/observed.json`. No package installation or dependency-resolution test was performed for ARM. |
| ARM-specific installed-file baseline fails | VERIFIED (synthetic metadata test) | Original upstream test fails with ARM64 install paths and absent x86-only EFI helper. It expects two `x86_64-linux-gnu` plugin paths and `setos.efi`. Seven fixtures below reproduce and test a proposed correction. This is **not** an ARM build. |
| Pi 5 can run the desktop with vc4/v3d KMS/Mesa | PROPOSED | wlroots' standard backend/renderer/allocator are used; no Pi-specific rendering path was found in reviewed core code. Real KMS, EGL buffer import, cursor planes, HDMI hotplug, GPU load and seat access are untested. |
| Physical trackball works | PROPOSED | Standard libinput pointer attachment in `compositor/src/input.c:494–505`. A USB HID trackball should use that path, but no physical input device was tested. |
| Full ZacOS desktop is running here | BLOCKED for this session's bounded proof | Host is Debian 13 x86_64; Meson, wlroots/Qt/Wayland development dependencies and `/dev/dri` are absent. No compositor was compiled/launched. Provisioning a separate full build environment is a later, feasible task; this is not a claim that ZacOS cannot run headlessly. |
| Current upstream tests pass on ARM | BLOCKED (not executed here) | CI uses an amd64 Ubuntu runner with a Debian 13 container, and labels artifacts amd64. Only two source-level upstream tests were run here. |

Status terms: VERIFIED denotes the explicitly stated evidence type, not wider hardware support; PARTIALLY VERIFIED is a justified path with outstanding tests; PROPOSED is design; BLOCKED describes unavailable validation.

## Architecture, process ownership and launching

ZacOS is a desktop, not a new Linux kernel. `zacos9-wm` is a C wlroots compositor; its menu bar, Finder (“Sniffer”), control strip (“Collar”) and Qt applications are separate processes (`ARCHITECTURE.md`). Standard `xdg-shell`, layer-shell, foreign-toplevel and XWayland are supported; private Wayland protocols handle ZacOS window styling and screenshots.

- `compositor/src/main.c:285–299` calls `wlr_backend_autocreate`, `wlr_renderer_autocreate` and `wlr_allocator_autocreate`. Its DRM device selection is configurable via `WLR_DRM_DEVICES`; GPU ordering is not forced unless requested.
- `session/zacos9-session` sets Wayland/XDG/Qt environment, obtains a D-Bus session, starts XDG autostart processing and the compositor, and logs to `~/.local/state/zacos9/session.log`. `session/zacos9.desktop` is a conventional display-manager Wayland-session entry.
- The compositor watches its three shell components, with bounded restart/backoff (`compositor/src/main.c:94–190`). This is useful desktop fault handling, but not a replacement for MORRIGAN's instrument service.
- The Finder uses GIO `.desktop` parsing and launching (`shell/files/appdb.cpp:857–890`); startup uses `g_app_info_launch` too (`shell/files/autostart.cpp:431–436`). A MORRIGAN control application can therefore integrate through a normal `.desktop` entry. There is no reason to fork Finder or the compositor for the first app launcher.
- **Do not make LIRA a child whose survival depends on desktop login or logout.** Start the engine under a dedicated supervisor/service; let the UI connect to it. A fullscreen Instrument Mode UI can be an ordinary client, with a return-to-desktop action. Switching visual modes should not restart the engine or audio backend.
- ZacOS includes desktop sounds: `lib/settings.c:285–287` tries `pw-play`, then `paplay`, then `aplay`. Its Debian runtime dependencies include PipeWire/WirePlumber. These can contend with a directly owned ALSA device. For the first appliance experiment, disable desktop sounds and select one explicit audio owner. Do not install the desktop package and assume it has no audio-policy effect.

The session script and package include privileged system-configuration helpers, account handling and installer features. Do not launch the full session against the developer's real home/session bus merely to test it. Upstream itself requires an isolated temporary home, runtime directory and D-Bus bus for nested/headless tests (`AGENTS.md`, `CONTRIBUTING.md`, `tests/disksetup/stage.py`). MORRIGAN's minimal sound proof does not execute those helpers.

## Concrete ARM work and scope

1. **Small test portability patch, locally demonstrated.** `tests/baseline/installed-files.txt:84–86` hardcodes the amd64 multiarch directory and optional Intel-Mac EFI file. Normalize plugin locations with Meson's configured `libdir`, and include the EFI baseline only if its target is configured. Candidate patch: `experiments/zacos/arm64-installed-files.patch`. Seven metadata fixtures pass, including a missing-compositor negative test. This fixes a known test assumption; it does not prove the remaining build/tests pass.
2. **Native build first.** Build on Debian 13 ARM64 (or a Pi-compatible 64-bit OS with matching Debian 13 package versions), not by installing the amd64 release. Native ARM avoids the additional cross-build problem that `boot/meson.build` runs its newly built `make-splash` executable to generate assets. Cross compilation would need a correct executable wrapper/emulation or a native build-tool target. No change is necessary for a native ARM build.
3. **Avoid the x86 image/installer path.** `scripts/build-iso.sh`, `scripts/release-iso.sh`, `iso/` and VM scripts target amd64 PC media. `system/installer/zacos9-install:756–759` installs GRUB with `x86_64-efi`/`i386-pc`. A Pi deployment should initially preserve an existing Pi-compatible bootloader, kernel, firmware and KMS setup and install the desktop as userspace. Porting the full disk installer is a separate project and is not needed for the instrument.
4. **Review optional hardware helpers/package effects.** Intel/Haswell/ACPI workarounds are not Pi requirements. Prefer an isolated build/install staging tree first, inspect package maintainer scripts and installed services, and do not enable unrelated helpers on the Pi. `debian/zacos9.postinst` can change groups, zram policy, locale setup and system services; it is more than a compositor install.
5. **Add actual ARM validation before claiming support.** Compile/package/test natively, then start an isolated headless compositor using upstream's test harness; finally validate real Pi DRM/HDMI/input. Qt private headers and wlroots unstable API make matching distro versions important. Newer arbitrary wlroots versions are not a drop-in substitute for 0.18.

The identified baseline patch is tens of lines. The native compile and physical graphics tests are still needed to discover further work; no reliable total port-effort estimate is justified yet. An entire PC-to-Pi installer port should not enter the first-sound critical path.

## Reproduce the investigation

No privileged command or desktop launch is required for the probe:

```sh
git clone https://github.com/chromasystemprofessional/Zac-OS-9 /tmp/Zac-OS-9
git -C /tmp/Zac-OS-9 checkout 205cf6dcf80fd7a600a1fcfed56878eba69d241a
python3 experiments/zacos/probe.py /tmp/Zac-OS-9 --output /tmp/zacos-probe
```

The probe requires this exact commit, leaves the upstream checkout unchanged, generates the candidate patch, runs upstream's packaging/privacy source tests, and runs **synthetic** Meson metadata through the real upstream installed-files test and a temporary patched copy. It neither builds ZacOS nor claims to emulate an ARM CPU.

Optional archive-availability evidence (the live archive changes; the recorded hash identifies this session's input):

```sh
curl -fL https://deb.debian.org/debian/dists/trixie/main/binary-arm64/Packages.xz \
  -o /tmp/zacos-arm64-Packages.xz
python3 experiments/zacos/probe.py /tmp/Zac-OS-9 \
  --packages /tmp/zacos-arm64-Packages.xz --output /tmp/zacos-probe
```

This fetch checks metadata over HTTPS, not Debian package signatures or installation closure. Use normal signed APT when installing dependencies; do not install packages based only on this probe.

Observed fixture results on Debian 13 x86_64:

| Fixture | Expected upstream/test exit | Observed |
|---|---:|---:|
| Original amd64 + EFI baseline | 0 | 0 |
| Original ARM64, no EFI | 1 (known bug reproduced) | 1 |
| Candidate ARM64, no EFI | 0 | 0 |
| Candidate amd64 + EFI | 0 | 0 |
| Candidate amd64, no EFI | 0 | 0 |
| Candidate non-multiarch `lib` directory | 0 | 0 |
| Candidate ARM64 with missing compositor | 1 (regression still detected) | 1 |

Additional executed upstream tests:

```text
python3 tests/baseline/test_packaging.py .
ok: the 2 static system unit(s) are excluded, and the login window has seatd

python3 tests/privacy/test_no_tracking.py .
ok: no tracking endpoints in 670 shipped source files
ok: the network code uses only the documented hosts: ...
```

`pkg-config --modversion wlroots-0.18 Qt6Core wayland-server` returned missing-package errors here. `dpkg-architecture -aarm64 -qDEB_HOST_MULTIARCH` returned `aarch64-linux-gnu`. These results are recorded as environment checks, not a compiled ARM result.

## Pi validation procedure (not executed)

Use an authorized test Pi with a supported 64-bit kernel/firmware stack and no valuable unbacked-up data. Do not flash or reconfigure a user's device as part of this source-only investigation.

1. Record OS release, kernel, architecture, firmware, Mesa, Qt, wlroots, display and audio device IDs. Require ARM64 and the expected Debian 13 library versions; Raspberry Pi OS compatibility depends on the actual image, not its product name.
2. In a disposable native ARM build environment, install the declared Debian build dependencies; configure a staging prefix, apply/review only the candidate test patch, then build and run the upstream serial test suite. Record every failure/skip. Use `-Dafterdark=disabled` for the initial build: optional emulation is unnecessary and its embedded SoftFloat Release 2b license needs separate review. Do not add proprietary modules or ROMs.
3. Use upstream's isolated headless test harness (private D-Bus, home and runtime directories) to verify compositor startup, ordinary Wayland and Qt clients, and `.desktop` launching. This still does not verify HDMI.
4. On real KMS, verify vc4/v3d driver/render-node selection and EGL operation with the chosen HDMI display. Test software `pixman` only as a diagnostic fallback, recording CPU usage. Check cursor behaviour and pointer clicks with the actual trackball.
5. Run LIRA as the independent audio service. Exercise window creation, full-screen transitions, desktop exit/crash and display disconnect while recording audio continuity/underruns. Choose a stable USB/ALSA device and explicit ownership before enabling other desktop audio clients.
6. Stress the expected resolution and UI workload alongside LIRA; measure CPU, memory, temperature/throttling and XRUNs. Desktop smoothness alone is not sufficient for acceptance.

## Licensing and maturity

Upstream's root `LICENSE`, root `meson.build` and `debian/copyright` declare **GPL-3.0-or-later**. The metadata states fonts, icons, cursors, patterns and sounds are original project works and excludes Apple assets/ROMs/system software. Protocol XML files have MIT/HPND-sell-variant notices; optional After Dark wrapper code is MIT, but its vendored SoftFloat Release 2b contains a custom responsibility/indemnification notice (`emulation/afterdark/crates/ad-m68k/vendor/softfloat/README.txt` and `softfloat.c`). That component is not simply covered by the MIT wrapper; exclude the helper with `-Dafterdark=disabled` until its distribution conditions are resolved. Keep the full copyright file, corresponding source and component notices with any future distribution, and separately audit bundled assets/dependencies. No Apple theme extraction or Classic-ROM workflow is part of MORRIGAN's proof.

The repository contains a substantial compositor, shell, test suite and frequent 1.18.x releases, not just a concept. That is **source-observed maturity**, not a hardware reliability guarantee. Its advertised/CI-tested platform is currently x86-64 Debian. Keep trademark/endorsement claims separate from code licensing.

The candidate patch is derived from ZacOS's GPL-3.0-or-later test code. It is recorded here for review and local investigation only; it has not been applied to the upstream clone or submitted upstream.
