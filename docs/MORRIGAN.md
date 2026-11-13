# MORRIGAN development record

## Decisions (milestone 000)

The implementation starts from CLATTER f9ddb05bd6d7f8a9c2a0a5b73a4ab8a50a59eae6, retaining its original application entry, tests, engine, and notices. MORRIGAN is a separate entry point over the same App, project, scheduler and audio pipeline. There is no second sequencer or synthesis implementation.

- Six fixed voices, one pattern, sixteen sixteenth-note steps, one transport.
- One hat pattern, closed/open articulation per step. Both trigger the same monophonic engine.
- Holding or latching a step edits only that selected voice's synthesis locks. Other strips change their base values.
- Empty-step parameter editing does not create a trigger. Velocity edits on empty steps do nothing. Removing a trigger clears its step sound.
- Step overrides last through the hit until that voice's next trigger. Base edits remain pending while locked. Stop releases synthesis locks.
- A drag is one undo operation. Tap-versus-edit is resolved when the step is released; turning a control consumes the toggle.
- LXR voice volume is lockable and independent of hit velocity. Downstream mixer level is kept internal.
- A fresh page opens an audible init kit and blank pattern. The user starts audio through a gesture. No saved musical state or sample collection is restored.
- Panel designs persist in a separate local-storage document and can be exported/imported as JSON.
- Synthesis controls are integers in firmware ranges; menu controls use valid discrete choices. No invented high-resolution DSP parameters.

## Implemented increments

001: Six playable native voices, curated synthesis controls, audition, volume, mute, accessible keyboard-operated controls.

002: Shared 16-step row, six selectors, start/stop, tempo, swing, independent velocity and hat articulation, playhead and output meter.

003: Physical pointer hold and mouse-friendly Shift-click latch, per-step locks, clear via encoder push control or Delete, base-value restoration and explicit target isolation.

004: Design-mode parameter assignment, labels, control type, value bounds/increments/direction, validated bindings and separate layout serialization.

005: Control coordinates and footprint editing, voice-strip rearrangement, overlap feedback, panel undo, import/export and persistence. This is a first voice-strip layout editor; transport, sequencer and effects controls have fixed layouts. It does not implement a generic visual application builder or CAD.

006: One of saturation, crusher or transient shaping per voice, with two controls. Reuses CLATTER channel processors. Live mixer parameters are not step-lockable.

007: Independent per-voice sends into one shared LXR delay, wet-only, with delay time and feedback controls. Dry audio remains in the main mix.

008: Separate post-fader reverb sends, a new stereo Schroeder reverb, room and damping controls. Effects run in the same engine for live and offline rendering; the effects stem contains both returns. This is an initial algorithm for musical evaluation, not a claim of hardware reverb equivalence.

## Validation

Automated checks cover real WASM output for all voices, independent patterns, lock restoration and kit edits under locks, hat ownership, empty-step semantics, layout repair/persistence, insert exclusivity, effects routing and signal stability. Browser tests exercise the production build, actual AudioWorklet, sequence entry, lock editing, layout persistence and user-gesture audio startup. The original CLATTER tests remain available as regressions.

Run `npm run build`, `npm test -- --maxWorkers=2`, and `npm run test:e2e` (with a Playwright Chromium installed or PLAYWRIGHT_CHROMIUM_EXECUTABLE configured). The optional `npm run check:lxr` needs LLVM; regular UI work uses the committed, tested WASM binary.

## Next decisions and limits

Milestone 009 remains a hardware feasibility gate: the actual Teensy/MCU model, RAM, codec and I/O configuration have not been confirmed. No processor, enclosure, PCB, battery or charger has been selected. Benchmark all six native voices plus both effects on the actual processor before making claims about standalone performance. A software CPU figure is not evidence of MCU capability.

Listening and tactile evaluation are still needed: choose the smallest expressive control set, assess encoder sensitivity, evaluate the initial reverb and delay, and decide what value/lock feedback a screenless panel requires. The browser can validate mappings and gestures but cannot establish encoder feel or finger clearance. All six strips remain accessible through horizontal scrolling at small widths; this is a desktop/tablet instrument prototype.

Deferred: arbitrary macros, modulation sequencing, advanced trigger conditions, sample/hybrid layers in MORRIGAN, per-step mixer FX locks, return feedback, routing the full mix into effects, generic layout scripting, and project/preset menus. These do not block the implemented playable milestones.

No upstream or MORRIGAN remote changes, commits, or publication are required to run this local build.

## Verified build result

On 2026-11-13 in the cloud workspace: production build passed; 843 unit tests across 38 files passed; 87 Chromium browser tests passed. These include the original CLATTER regressions and seven new MORRIGAN browser scenarios. Real WASM and AudioWorklet paths were exercised. A separate browser launch without the autoplay override verified audio startup from a user gesture. Play and Design screenshots were captured in `/workspace/artifacts/`.

The native MCU port, physical control feel, battery/charging design and fresh-task restoration of this new uncommitted source have not been tested. The optional LLVM source-to-WASM reproducibility check was not run.
