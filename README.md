# MORRIGAN

A playable six-voice LXR instrument and a configurable front-panel playground, based on CLATTER.

## Run

Requires Node 22 or newer.

```sh
npm ci
npm run dev:instrument
```

Open the `morrigan.html` entry served by Vite. The original CLATTER workstation remains at `clatter.html` (and locally at `index.html`) for comparison and regression testing. Audio starts after a user gesture.

```sh
npm run build
npm test -- --maxWorkers=2
npx playwright install chromium
npm run test:e2e
```

To use an already installed Chromium, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to its executable path for browser tests. Build before running browser tests. Both application entries are included in `dist`.

The committed WASM engine is sufficient for normal development. Optional source reproducibility check: install LLVM clang and wasm-ld 15+ and run `npm run check:lxr`; this compares a temporary build without replacing the committed binary.

## Instrument

Six fixed native voices: Drum 1–3, Snare, Cymbal, and one shared closed/open Hi-hat. Select a voice to edit its 16-step pattern. Volume is an LXR synthesis parameter, independent of step velocity.

A new page starts an empty jam with an audible kit. Musical sessions are disposable; control-surface layouts are saved separately in the browser. Original CLATTER sessions are not overwritten by MORRIGAN.

Synthesis parameter locks persist through the sounding hit until that voice's next trigger. A base edit made while its parameter is locked takes effect after the lock is released. Synth triggers align to 64-sample blocks (about 1.45 ms at 44.1 kHz). Sequencer edits respect CLATTER's 120 ms planning horizon.

Voice inserts and delay/reverb sends edit live mixer settings and are not step-lock destinations. Each voice has one selectable insert. Delay uses the existing LXR delay as a wet-only bus; reverb has its own wet-only processor and send. Both receive post-fader audio, without return feedback.

## Architecture and provenance

- `src/morrigan/instrument.ts`: six-voice project and semantic input adapter.
- `src/morrigan/panel.ts`: validated physical control definitions, positions and parameter assignments.
- `src/morrigan/view.ts`, `style.css`: instrument renderer and design interface.
- `src/morrigan/effects.ts`: curated insert and send policy.
- `src/audio/reverb.ts`: independent fixed-rate stereo reverb.
- Existing CLATTER project, resolver, scheduler, WASM, audio worklet and offline renderer provide the musical engine.

Imported from `clickysteve/clatter` commit `f9ddb05bd6d7f8a9c2a0a5b73a4ab8a50a59eae6`. See [the upstream README](docs/CLATTER_README.md) and [development record](docs/MORRIGAN.md).

MORRIGAN is a modified version of CLATTER and the LXR engine, not an official Erica Synths product. Distributed under GPL-3.0-only with the additional LXR terms. Preserve `LICENSE`, `NOTICE.md`, `THIRD_PARTY_NOTICES.md`, and `lxr/upstream/NOTICE.md`. Full corresponding source is in this repository.

## GitHub Pages

The Pages workflow builds and tests both interfaces, then deploys `dist` after a push to `main`. In repository Settings → Pages, select **GitHub Actions** as the source. The Pages root opens MORRIGAN; the comparison workstation is at `clatter.html`. No custom domain or external backend is required.
