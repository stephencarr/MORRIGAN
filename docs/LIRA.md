# LIRA: first-sound proof

## Result and scope

**VERIFIED — 2026-11-16, Debian 13 x86_64 sandbox:** the real standalone LIRA patch loads in Pure Data without a GUI or physical audio device. External loopback control messages trigger each of its eight voices, releasing each voice returns the output to silence, and changing a tuning control changes the recorded waveform. All eight voices also produce sound together. The runner writes a WAV, engine log, event stream and machine-readable acceptance report.

This resolves the first software acceptance criterion. It is **not** Raspberry Pi validation, DAC latency measurement, an audio-device reliability benchmark, a MIDI hardware test, or a production boot service.

## Pinned inputs and runtime

- [LIRA-8](https://github.com/MikeMorenoDSP/LIRA-8/tree/6a6b6cbc3359a20d7741c9270c7690ab6b21c92a): `6a6b6cbc3359a20d7741c9270c7690ab6b21c92a`.
- [Pure Data 0.56-2](https://github.com/pure-data/pure-data/tree/b1ff370c87b579f80130a9cafbf27cd890e90882): `b1ff370c87b579f80130a9cafbf27cd890e90882`.
- Python standard library, Git, C compiler, GNU Make, libc development headers. No Python package install or root privileges are needed for the proof.
- Pd is built with dummy audio/MIDI backends. This avoids ALSA/JACK development dependencies and any claim that the sandbox validates those backends. The legacy GNU makefile unconditionally selects OSS MIDI; the bootstrap explicitly selects upstream `s_midi_dummy.c` instead, without patching Pd source.

```sh
python3 apps/lira/bootstrap.py --directory .cache/upstream --jobs 2
python3 apps/lira/first_sound.py --output artifacts/first-sound
```

The output directory must be new. Re-running into an existing directory fails instead of replacing evidence. To use an existing clean checkout and Pd executable:

```sh
python3 apps/lira/first_sound.py \
  --pd /workspace/morrigan-upstream/pure-data/bin/pd \
  --source /workspace/morrigan-upstream/LIRA-8 \
  --output artifacts/first-sound-second-run
```

The process exits nonzero if an acceptance check fails. A successful report has `status: VERIFIED` and all `audio.checks` true. Read `report.json`, `pd.log`, `events.jsonl` and listen to `output.wav`. WAVs and generated upstream runtime copies are local artifacts, not source files in this repository.

## What is actually reused

The upstream `LIRA-8_Pd_Standalone/_LIRA-8.pd` has four paired `lira.voice` abstractions, their oscillators, voice modulation, envelopes, dual delay, distortion and master volume. All required abstractions are included in the source tree; no third-party compiled Pd externals were required in the observed load. Precompiled Camomile plugins are not used.

The standalone patch's final output is **mono duplicated to both DAC channels**, not a true stereo pair. The proof keeps this behavior and explicitly verifies that the WAV's two channels match. It captures at the original DAC input, after the existing mix/effects/volume path. It does not recreate or replace the synthesis graph.

The adapter copies the standalone directory into a run-local runtime directory, copies its license, replaces only its final DAC sink with `writesf~ 2`, and appends control and timing instrumentation to the outer canvas. No upstream checkout is modified. Generation rejects an unexpected pinned patch structure instead of guessing at connection indices.

Upstream's GUI objects and internal preset helpers remain loaded but no GUI process is started. The original preset is read during initialization. A conservative, fully specified test preset is then sent over the same control transport used for the voice tests. Upstream preset auto-writes land only in the generated runtime copy.

## Control boundary

`apps/lira/adapter.py` defines 55 allowed controls: 47 upstream preset parameters and eight touch/gate sensors. Parameter names come from `gui.link` declarations and the patch's receiver symbols. They are addressed through their instance-local `$0-r-<name>` receivers, allowing the existing GUI/control logic to forward values to DSP receivers.

An absolute event is a JSON object with exactly:

```json
{"version": 1, "device": "morrigan.virtual.first-sound", "control": "sensor-1", "value": 1}
```

- `sensor-1` through `sensor-8`: integer 0/1 release/press.
- `tune-1` through `tune-8`: 0..127.
- `fast-12`, `fast-34`, `fast-56`, `fast-78`, and other binary switches: 0/1.
- `source-12` etc. and `del-mod`: 0/1/2.
- Other potentiometer controls use the original 0..127 domain.

Unsupported versions, malformed identities, unknown controls, extra fields, strings, nonfinite numbers, huge integers, out-of-range values and fractional switch states are rejected before opening a socket. Receiver names cannot inject arbitrary Pd messages through this adapter.

The Pd receiver binds **127.0.0.1 only**, on a temporary high TCP port, and uses the ordinary outlet form of `netreceive`, followed by an explicit selector route. It never enables Pd's legacy global-message receiver. This is a local developer transport, not authentication or application sandboxing: another process on the same host that knows the port can still send messages. Do not expose the port to the network.

The proof's engine log records received messages. Timing marks come from Pd's logical clock; analysis windows are not inferred from Python wall-clock scheduling. The public `send_event` helper and CLI can target a running proof's reported port:

```sh
python3 apps/lira/adapter.py --port PORT --control sensor-1 --value 1
```

The acceptance runner owns the process lifetime and closes the engine on completion or exception, with terminate/kill fallbacks. The proof itself is a scripted virtual controller. Device discovery, persistent mappings, relative encoders, LEDs, hot-plug recovery and a long-running interactive simulator remain future work; this small event model does not pretend to implement them yet.

## Acceptance checks and evidence

The first durable test recorded approximately 12 seconds at 48 kHz, 16-bit PCM, two channels. In the observed per-voice runs, individual RMS levels were above 0.005 full scale. Initial silence, each released voice and final silence were below 0.0001 RMS. A tuning change from 24 to 96 yielded a substantial increase in positive-going zero crossings; that is a causal waveform-change test, not a precision pitch or tuning claim.

The test also verifies all-eight simultaneous sound and checks the **entire captured waveform** for peak below 0.95 full scale and no near-full-scale samples. This is evidence of unclipped output under this conservative test preset, not a guarantee for arbitrary combinations of feedback, drive and master gain.

```sh
python3 -m unittest discover -s tests -p 'test_lira*.py' -v
MORRIGAN_PD="$PWD/.cache/upstream/pure-data/bin/pd" \
MORRIGAN_LIRA_SOURCE="$PWD/.cache/upstream/LIRA-8" \
python3 -m unittest discover -s tests -p 'test_lira*.py' -v
```

The first command runs ten boundary/measurement tests and explicitly skips two real-engine tests. The second also executes the real-engine acceptance test and a forced-crash test that confirms a killed engine cannot be reported as success. Skipped hardware/engine tests must never be reported as passes.

Observed initial artifacts in this session: `/workspace/artifacts/morrigan-first-sound-02/`; later integrated verification may use a separate directory. The JSON report includes pins, host architecture, Pd version, exact command, controls and measurement outputs. File hashes are provenance, not expected deterministic hashes: live event scheduling and upstream initialization can change exact samples between runs.

## Remaining investigations

- **PROPOSED:** run a full ALSA-enabled Pd build on Pi 5, select a stable USB DAC identity, measure latency, underruns, CPU and restart behavior.
- **PARTIALLY VERIFIED:** vanilla Pd source and abstractions have no observed architecture-specific dependencies. ARM64 execution remains untested here.
- **UNVERIFIED:** physical MIDI input. The upstream patch has `notein` and `clone -s 1 notemap 8`; this proof injects validated control messages, not MIDI notes.
- **PROPOSED:** explicit service startup muting and audio-device recovery before claiming a bootable instrument.
- **PROPOSED:** full application lifecycle and controller feedback. The first-sound runner is deliberately smaller.

## Attribution and redistribution

LIRA is copyrighted by Miguel Moreno. Its root `License.txt` grants BSD-style three-clause redistribution terms, including copyright/license/disclaimer retention and author non-endorsement. Pure Data has its own license and per-file notices. See `LICENSES.md` for the wider audit. The bootstrap fetches source separately; the runtime copy carries LIRA's license. No Macintosh assets or precompiled proprietary plugins are used. MORRIGAN is not endorsed by SOMA or the upstream authors.
