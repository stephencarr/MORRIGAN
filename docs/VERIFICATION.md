# Verification: 2026-11-16 checkpoint

**The user's first success criterion is met on the available development host:** real LIRA runs in a headless Pure Data process, receives external control messages, and produces an objectively checked audio recording.

Host: Debian 13 x86-64, Python 3.12.14, ordinary `agent` user. No Raspberry Pi, audio device, MIDI controller, display or desktop is involved in the audio test. Pd 0.56-2 is built locally with dummy device backends. This is a software DSP/control proof, not an audio-hardware or low-latency benchmark.

## Reproduced setup and acceptance

Root integration independently executed a fresh setup from the checked-in bootstrap:

```sh
python3 apps/lira/bootstrap.py
MORRIGAN_PD="$PWD/.cache/upstream/pure-data/bin/pd" \
MORRIGAN_LIRA_SOURCE="$PWD/.cache/upstream/LIRA-8" \
python3 -m unittest discover -s tests -v
python3 apps/lira/first_sound.py --output /workspace/artifacts/morrigan-first-sound-final
```

Observed: bootstrap exit **0**; **12 tests passed in 13.600 seconds**, no skips; first-sound CLI exit **0**, `status: VERIFIED`, Pd exit **0**.

The tests include 10 input/measurement/failure tests and two real-Pd tests: the full eight-voice acceptance sequence and forced engine termination. No mock oscillator substitutes for LIRA in the acceptance test. The absolute command paths and measured data are preserved in [evidence/first-sound.json](evidence/first-sound.json); the actual test output is in [evidence/tests.txt](evidence/tests.txt).

## Observed recording

| Measurement | Observed value |
| --- | --- |
| Format | 48,000 Hz, signed 16-bit PCM, two channels |
| Duration | 12.064 seconds |
| Channel relationship | Identical left/right: upstream's mono output duplicated, not an independent stereo field |
| Individual voice RMS | 0.02446–0.07734 of full scale across eight individually triggered voices |
| Settled initial/release/final silence | RMS 0 in the measured windows |
| Whole-file peak, both channels and all transitions | 0.199462890625 of full scale |
| Near-full-scale samples | 0 |
| Tuning test, positive-going zero crossings | About 9.95 → 384.32 crossings/second; causal waveform change, not a precision fundamental-frequency estimate |
| Validated parameter/sensor events sent | 109 |
| Pd received-message log entries | 134, including recording/timing/lifecycle commands |
| WAV SHA-256 | `94f7a19af64c754a1c0fb919043a1aac3429047823486a1dee4cd6ec277618a6` |

All 10 audio acceptance checks passed, including original patch load, no reported Pd errors, each voice sounding and releasing, all voices together, tuning response, whole-file clipping rejection and duplicate-channel verification.

The recording, raw Pd log, control stream and generated runtime copy are retained at `/workspace/artifacts/morrigan-first-sound-final/`. The full bootstrap log is `/workspace/artifacts/morrigan-bootstrap.log`. These generated files are not committed or published as a build. Recordings have deliberate silence between voice tests. Exact hashes and durations can vary because message arrival and upstream initialization are not sample-identical between runs.

## Reliability review and corrections

The independent reviewer found that the original verifier checked clipping only in settled measurement windows and did not require a clean Pd exit. Both were fixed before this checkpoint:

- Clipping now checks every sample of both channels, including attacks/transitions; a full-scale first sample in the right channel fails acceptance.
- An engine terminated during the run cannot be reported as success; shutdown is bounded and nonzero process exit is rejected.
- Pd version probing has a timeout. Network startup and cleanup are bounded. Existing output directories and changed source revisions are refused.
- Control tests reject malformed/extra fields, unsupported versions, injection-like selectors, out-of-range/discrete/nonfinite/huge values and bad ports; connection failure is observable.

An independent executable security probe inspected sockets owned by actual Pd: only IPv4 loopback was listening, with no wildcard or IPv6 listener. Sending a raw global-message-style `; pd quit;` string did not execute as a Pd global command. The adapter's receiver uses ordinary outlet routing. **This is not authentication:** another local process can still reach the experimental control port. Production IPC and hardware permissions remain later work.

## ZacOS evidence

Root independently ran:

```sh
python3 experiments/zacos/probe.py /workspace/morrigan-upstream/Zac-OS-9 \
  --output /workspace/artifacts/morrigan-zacos-root
git -C /workspace/morrigan-upstream/Zac-OS-9 apply --check \
  /workspace/MORRIGAN-OS/experiments/zacos/arm64-installed-files.patch
```

Both commands returned **0**. Seven synthetic Meson-metadata fixtures met their expected outcomes, including reproducing the original ARM64 failure, candidate success on ARM64, amd64 with/without EFI, non-multiarch layouts and a missing-compositor negative case. Two upstream source checks (packaging and privacy) passed. The original checkout remains unchanged.

The agent separately found all 19 selected dependency packages in Debian's ARM64 archive metadata. Versions, metadata hash and observed outputs are in [../experiments/zacos/observed.json](../experiments/zacos/observed.json). This is **not an ARM64 build**, dependency-installation closure check, compositor startup test or Pi graphics validation. [ZACOS.md](ZACOS.md) contains the exact source findings and next test procedure.

## Milestone status

| Milestone | Status at this checkpoint |
| --- | --- |
| 000 — technical reconnaissance | Complete as a bounded investigation: product, architecture, licences, feasibility, risks, decisions, roadmap and tested source probe. Hardware conclusions remain explicitly partial. |
| 001 — first sound | Complete for this host: reproducible real-engine headless/control/audio proof, eight voices, failure tests and recorded evidence. |
| 002 — bootable service | Not implemented; bounded test-process cleanup is not service recovery or boot validation. |
| 003 — virtual controls | Partial: versioned absolute event boundary and scripted eight-voice controller. Discovery, relative controls, feedback, persistent maps and disconnect recovery are not implemented. |
| 004 / 005 — app environment / Instrument Mode | Not implemented; intentionally kept behind the sound/control acceptance gate. |
| 006 — ZacOS | Investigation and candidate packaging patch only. No desktop build or integration completed. |
| 007 — external controller | Not implemented or physically tested. |
| 008 — Clatter | Source investigation only; no new runtime integration or performance benchmark. |
| 009 — Pi deployment | Not implemented or authorized for a physical device. |

## Agent work and integration

| Workstream | Output | Root review/integration |
| --- | --- | --- |
| Audio / Pure Data | `apps/lira/`, `tests/test_lira*.py`, `docs/LIRA.md` | Inspected adapter/runner/bootstrap/tests, reproduced a fresh build and real audio, required whole-file clipping and clean-exit acceptance |
| ZacOS / Linux | `docs/ZACOS.md`, `experiments/zacos/` | Inspected source-derived candidate patch and report; reran seven fixtures/two checks and patch applicability |
| Licensing / Clatter, then reliability review | `docs/LICENSES.md`, `docs/CLATTER.md`; bounded audio review | Corrected an early missed mixed-case LIRA licence filename; confirmed actual grant; incorporated concrete verifier corrections |
| Main agent | Canonical handoff, product/architecture/decision/risk/roadmap/feasibility records, README, recorded evidence and branch checkpoint | Owned acceptance criteria, independent integration verification and final scope/status |

Agents had distinct write scopes; no upstream source was modified or pushed. No background work is scheduled after this session.

## Next steps and user involvement

Next software step: a long-running LIRA process with explicit readiness, startup mute, controller-disconnect release, clean shutdown and bounded restart tests. In parallel, provision a clean ARM64 build environment for ZacOS before attempting Pi graphics integration.

No credentials, paid services or routine design decisions are needed for those software tasks. Actual hardware validation will require access to a Pi 5, the selected audio interface/display and the user's LCXL Mk2 or another USB MIDI controller. The device must be explicitly authorized for configuration; this session did not flash, deploy to or alter one.

Before declaring an instrument build ready, measure real output latency and underruns, sustained eight-voice load/thermal behavior, boot/recovery/shutdown, controller reconnect and uninterrupted audio across desktop/display failures.
