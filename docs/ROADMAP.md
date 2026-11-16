# Roadmap and acceptance gates

The first runnable gate is the user's headless LIRA → control message → verifiable recording test. Completion evidence is recorded in [VERIFICATION.md](VERIFICATION.md), not inferred from this plan.

| Milestone | Acceptance / next bounded step |
| --- | --- |
| 000 — reconnaissance | Pinned source investigations, dependency/licence findings, ARM64 blockers, reproducible source probes; distinguish hardware unknowns |
| 001 — first sound | Real Pd headless; original LIRA graph; external control; quiet baseline and eight audible voices; parameter effect; non-clipping captured output and logs |
| 002 — instrument service | Long-lived engine with explicit readiness, startup mute, shutdown, recoverable failure handling and bounded restart policy; then actual boot/HDMI-disconnected test |
| 003 — simulated controls | Device connection, capabilities, pot/switch/button/touch events, disconnect safety, state feedback and mapping tests; drive LIRA through the same adapter |
| 004 — app environment | One manifest and one installed LIRA app exercising discovery, lifecycle, logs, data directories and single audio ownership; no app store |
| 005 — Instrument Mode | Independent amber scope/status process, pointer navigation and desktop transition without audio loss |
| 006 — ZacOS | ARM64 build first, then Pi KMS/input/session tests and audio continuity across desktop transitions; upstream preferred, compatibility host retained |
| 007 — external MIDI | LCXL Mk2 configurable input, relative/absolute handling, feedback and saved mappings; simulated tests plus explicit physical test procedure |
| 008 — Clatter | Bounded browser integration after app/audio lifecycle; actual browser/resource and timing tests on the target |
| 009 — Pi deployment | Reproducible installation, stable device selection, startup/shutdown/recovery checklist; hardware acceptance before any instrument-readiness claim |

Highest-value next work after first sound: prove a continuous instrument process survives controller loss and cleanly stops; establish a real-device audio configuration and build ZacOS on ARM64 in parallel. Desktop appearance and enclosure work stay behind these risks.
