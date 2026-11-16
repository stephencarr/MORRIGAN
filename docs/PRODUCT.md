# Product and first acceptance gate

Canonical product requirements: [HANDOFF.md](HANDOFF.md).

The user's first success criterion, 2026-11-16:

> Run LIRA headlessly, send a control message, and produce a verifiable audio output.

Resolve ZacOS on ARM64 independently. A conventional Linux environment is a valid development host while the desktop port is investigated. Do not let desktop development block the sound proof.

## Execution order for this checkpoint

1. Inspect pinned upstream LIRA, ZacOS and Clatter sources and licensing.
2. Run the real standalone LIRA engine in a real Pure Data process without a GUI.
3. Inject an external control event; capture and analyse audio, including an inactive baseline and all eight voices where feasible.
4. Validate control rejection, failures, reproducibility and clean process exit.
5. Integrate findings, evidence, commands and the smallest next steps into this branch.

## Acceptance criteria

- No desktop/compositor/browser is needed to produce the recording.
- The source instrument is LIRA, not a replacement oscillator.
- The control message crosses a real process boundary.
- Captured audio has explicit sample rate, channel count, duration, RMS, peak and clipping checks.
- An off/on or parameter comparison ties a measurable output change to the control input.
- Dependencies and upstream revisions are pinned or explicitly recorded.
- Failures return nonzero exit status and retain diagnostic logs.
- No physical Pi, DAC, controller or latency claims are inferred from an offline test.

## Scope boundaries

Raspberry Pi 5 remains a candidate. ZacOS remains the preferred desktop. The fixed hardware control surface is not electrically or mechanically finalized. Browser Clatter remains a later, bounded application integration. No public builds, releases, deployments, upstream modifications, hardware flashing or elevated application execution are part of this checkpoint.
