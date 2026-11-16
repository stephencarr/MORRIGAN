# Clatter integration reconnaissance

Scope: source inspection only, 2026-11-16. No browser/Pi resource or latency benchmark was performed for this investigation; no Clatter code was changed. Milestone 008 remains an investigation, not a completed integration.

Source: <https://github.com/clickysteve/clatter>, inspected commit `f9ddb05bd6d7f8a9c2a0a5b73a4ab8a50a59eae6`. This is the requested original upstream. The previous MORRIGAN/Clatter fork's MIDI-learn and Launch Control XL additions are not assumed to exist in it.

## What the source establishes

| Claim | Evidence at the pinned revision | Status |
| --- | --- | --- |
| LXR DSP is WebAssembly executing inside an AudioWorklet. | `src/audio/host.ts`, `src/audio/worklet.ts`, `src/audio/lxr/lxr.ts`; `scripts/build-lxr.mjs` compiles `--target=wasm32` and `-mbulk-memory`. | VERIFIED by source. |
| Requested rate is 44.1 kHz, interactive latency, two output channels; another device rate has a resampling fallback. | `AudioHost.start()` requests `ENGINE_RATE` and `latencyHint: 'interactive'`, then creates stereo worklet; worklet constructs `StreamResampler` if rates differ. | VERIFIED by source. Actual device latency is unmeasured. |
| Browser audio startup expects user interaction. | `AudioHost.start()` explicitly documents initial gesture; resumes a suspended AudioContext. | VERIFIED by source; chosen kiosk browser's startup policy remains untested. |
| MIDI access includes discovery, hot-plug, note input, clock and transport. | `src/midi/webmidi.ts` calls `navigator.requestMIDIAccess({sysex: false})`; `src/midi/controller.ts` parses note-on plus clock/transport; `App.midiNote()` resolves note to track. | VERIFIED by source. |
| Arbitrary CC parameter mapping and bidirectional controller-state mirroring are not available through that input path. | `MidiController.receive()` handles note-on and realtime messages; there is no general CC handler, controller profile or state-feedback subscription in that interface. | VERIFIED for inspected upstream. A bounded adapter is still needed. |
| GUI rendering is ordinary DOM/CSS with Canvas 2D plots/grid. | `src/ui/grid.ts` uses `getContext('2d')`; relevant view files use canvas; source search found no WebGL renderer. | VERIFIED source approach; this does not prove any Pi GPU/display combination performs well. |
| Static build uses relative URLs and ES2022. | `vite.config.ts`: `base: './'`, `build.target: 'es2022'`; `npm ci && npm run build` in README. | VERIFIED build configuration, not a build executed in this investigation. |
| Main-thread stalls remain a timing risk despite AudioWorklet DSP. | `src/transport/scheduler.ts` computes upcoming events on the main thread; its `startTicker()` creates a Worker whose messages invoke the main-thread callback. Worklet handles already-scheduled events independently. | VERIFIED architecture, consequence to be stress-tested. “AudioWorklet” does not imply indefinitely GUI-independent sequencing. |

No SharedArrayBuffer requirement was found in the inspected source: initialization/configuration use worklet MessagePort messages. Do not impose cross-origin-isolation headers without a concrete new requirement. AudioWorklet and Web MIDI still require an appropriate secure browser context; serve from loopback or HTTPS and verify API availability and user permissions in the actual Chromium package.

## ARM64 assessment

**PARTIALLY VERIFIED:** the application is TypeScript/JavaScript plus wasm32, not an x86 native plugin. Its source therefore presents no obvious CPU-instruction-set barrier to ARM64 Chromium. The WASM module needs the supported instructions above; Node/LLVM are build-time tools and need not be installed on the instrument if a compliant static bundle is built elsewhere.

**PROPOSED:** use the selected Debian/Raspberry Pi OS ARM64 Chromium package, normal sandboxing, and a loopback static origin. Launch a dedicated browser app window or kiosk window from the MORRIGAN launcher. Windowed/fullscreen lifecycle can be managed by the browser/compositor; no custom desktop rewrite is needed.

**UNVERIFIED / hardware-dependent:** exact Chromium/Wayland/GPU compatibility, startup permission persistence, MIDI permission and reconnect behavior, cold-start time, CPU/RSS/temperature, sustained underruns, and end-to-end controller-to-audio latency on Pi 5. The browser sandbox must remain enabled; running as root or adding `--no-sandbox` is not an acceptable integration shortcut.

## Smallest bounded future adapter

1. Treat Clatter as a separately installed, pinned browser application with declared audio/MIDI capability and its own persistent browser profile/project storage.
2. First use upstream note/clock/transport MIDI for a smoke test. Do not pretend this controls arbitrary synthesis parameters or mirrors step LEDs.
3. For richer controls, add a narrow, versioned integration bridge in a separately maintained adapter/fork: explicit allowed parameter/transport commands and state subscriptions, tested against that pinned version. `window.clatter` in `src/main.ts` is an existing debug/test handle, not a stable public API or permission boundary.
4. Give that adapter only the selected local control device/application session; do not expose unauthenticated HTTP/WebSocket administration on the network. Do not let arbitrary websites send privileged host commands.
5. Stop/release the prior audio app before launching Clatter in the initial single-owner mode. ALSA-exclusive Pd playback could prevent Chromium opening the same hardware; determine the actual Chromium backend before assuming coexistence. Shared PipeWire/JACK routing is a later verified milestone, not a prerequisite for LIRA first sound.
6. Preserve upstream licensing/source notices and label any modifications; see [LICENSES.md](LICENSES.md). Do not alter or publish to the original upstream.

## Reproducible next verification

After LIRA and application lifecycle are proven:

```sh
git clone https://github.com/clickysteve/clatter /path/to/clatter
git -C /path/to/clatter checkout --detach f9ddb05bd6d7f8a9c2a0a5b73a4ab8a50a59eae6
cd /path/to/clatter
npm ci
npm run build
npm test
# Serve the built site on loopback using the project preview command.
npm run preview -- --host 127.0.0.1
```

Those commands are proposed reproduction steps, not claimed results from this workstream. On target hardware record OS/kernel/browser/package versions, audio interface/backend, sample rate/quantum/buffer, `AudioContext.baseLatency` and `outputLatency` (estimates, not round-trip measurements), measured output capture, CPU/RSS and underrun evidence under a repeatable pattern. Test at least a simple synth pattern, the heavier demo kit, sample playback, MIDI input, device loss, switching away/back, and a deliberate long main-thread stall. Use a loopback/capture measurement for actual latency; absence of browser errors is not proof of glitch-free audio.
