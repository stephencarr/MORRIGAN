# MORRIGAN OS

A Linux instrument environment: sound first, an independent desktop when needed.

This branch starts fresh from the repository reset. It contains a real **headless LIRA/Pure Data audio proof**, a small control adapter, and a separate **ZacOS ARM64 feasibility investigation**. It is not a bootable OS image or a hardware-validated instrument.

## First sound

On Linux, with Python 3.10+, Git, GNU Make and GCC available, run as an ordinary user:

```sh
python3 apps/lira/bootstrap.py
python3 apps/lira/first_sound.py --output artifacts/first-sound
```

The bootstrap fetches exact LIRA/Pd revisions under ignored `.cache/upstream` and builds a local Pd executable. It does not install a service or change system audio settings. This test build uses dummy audio/MIDI backends: it computes the real LIRA DSP and records a WAV, without needing a desktop, DAC or MIDI device.

The proof sends controls to a separate Pd process on loopback, records each of the eight voices and its release, changes tuning, plays all voices together, and checks the result. It writes:

- `output.wav`: 48 kHz, 16-bit, two channels. Upstream LIRA duplicates its mono output to both channels.
- `report.json`: source/runtime identity, measured audio, control trace and acceptance checks.
- `events.jsonl` and `pd.log`: sent controls and actual process diagnostics.
- `runtime/`: a generated local copy with bounded control routing and a recording tap; the fetched original remains unchanged.

Success returns exit code 0 and `status: VERIFIED`. A failure returns nonzero. Use a **fresh output directory** for each run; existing evidence is not overwritten. Recordings are roughly 12 seconds and contain deliberate silences. This is a controlled engineering test, not a demonstration preset or a real-time latency benchmark.

Detailed implementation, parameters and reproducibility: [LIRA](docs/LIRA.md).

## Tests

After bootstrap, run all tests including the real-engine acceptance test:

```sh
MORRIGAN_PD="$PWD/.cache/upstream/pure-data/bin/pd" \
MORRIGAN_LIRA_SOURCE="$PWD/.cache/upstream/LIRA-8" \
python3 -m unittest discover -s tests -v
```

Without those two variables, `python3 -m unittest discover -s tests -v` runs the dependency-free tests and explicitly skips the real-engine test. A skipped test is not first-sound verification.

## ZacOS investigation

[ZacOS findings](docs/ZACOS.md) distinguish inspected source, archive metadata and synthetic packaging tests from an actual ARM64 build. A small candidate patch fixes reproduced architecture assumptions in the installed-file test. No patch was applied or submitted upstream.

```sh
git clone https://github.com/chromasystemprofessional/Zac-OS-9 .cache/Zac-OS-9
git -C .cache/Zac-OS-9 checkout --detach 205cf6dcf80fd7a600a1fcfed56878eba69d241a
python3 experiments/zacos/probe.py .cache/Zac-OS-9 --output artifacts/zacos
```

ZacOS remains the preferred desktop. The LIRA proof runs on conventional Linux independently while the ARM64 port is investigated. No replacement desktop has been created.

## Engineering record

- [Canonical handoff](docs/HANDOFF.md) and [first acceptance criterion](docs/PRODUCT.md)
- [Verification and agent results](docs/VERIFICATION.md)
- [Architecture](docs/ARCHITECTURE.md), [feasibility](docs/FEASIBILITY.md), [decisions](docs/DECISIONS.md)
- [Risks](docs/RISKS.md) and [roadmap](docs/ROADMAP.md)
- [Licences and distribution obligations](docs/LICENSES.md)
- [Later Clatter integration](docs/CLATTER.md)

Original MORRIGAN code retains GPL-3.0-only terms; see [LICENSE](LICENSE). Fetched upstreams retain their own licences. MORRIGAN is not endorsed by SOMA, Erica Synths, Apple or the upstream authors. No builds, OS images, releases or deployments are published by this checkpoint.
