# Mobile LIRA: sound correction and original-engine comparison

Observed 2026-11-16. Scope: actual upstream LIRA patch through the pinned libpd engine on the development host. This is **not** a standalone Pd GUI comparison, a SOMA hardware comparison, a Pixel recording, or proof of glitch-free Android audio output.

## Concrete cause found

The first app reused the real, unchanged LIRA DSP, but its native initialization applied the **dry calibration preset from the engineering test**. That made it substantially different from LIRA's shipped musical preset:

| Parameter group | Previous app initialization | Original standalone preset |
| --- | --- | --- |
| Eight tunes | All 64 | 0, 78, 74, 36, 27, 57, 60, 51 |
| Four sharpness values | All 0 | 14.3774, 43.1321, 103.038, 71.8868 |
| Four source selectors | All 1 | All 0 |
| Group pitch | 64 / 64 | 66 / 65 |
| Vibrato | Off | On |
| Drive / distortion mix | 0 / 0 | 86 / 69 |
| Delay time 1 / 2 | 0 / 0 | 94.5745 / 56.7447 |
| Delay feedback / mix | 0 / 0 | 54.0426 / 67.5532 |
| Delay modulation 1 / 2 | 0 / 0 | 40.7358 / 47.9245 |
| LFO A / B, AND/OR, link | Zeroed | 42 / 64, 1, 1 |

These differences remove much of the original character; a non-silence test could not catch that mistake. Startup now restores the original 47-value preset, including its effects and modulation settings. Only master volume is initially reduced to **64 rather than 127**, and all sensors start released. The Android service then applies its visible/current parameter state before output. Because upstream master gain is squared and sits after the effects, the initial reduced volume is a deliberate output-level difference rather than a changed distortion/feedback preset.

The dry preset has moved into the **test harness only**. `vibrato` is also corrected to a binary 0/1 control, matching the original toggle; it was previously too permissively accepted as a 0..127 potentiometer.

## Source identity and coverage

- LIRA: `6a6b6cbc3359a20d7741c9270c7690ab6b21c92a`.
- libpd: `ba0dc63262901d658af8bbda5e619a60fa975e78`.
- Its Pure Data source: `f009fd8d7b537e209e09898d487fdf1bf547da2b` (observed 0.56.5).
- The loaded `_LIRA-8.pd` SHA-256 is `f0a7443e75140a16a44e46ce2957f99d751fe495dc8387c7a082f8f71dbf3392`.

The comparison reads `gui.link` indices and `parameters.txt` directly from the original source, extracts actual slider/toggle/radio ranges from the Pd GUI objects, and checks the native factory table against all 47 values and types. Eight sensor controls are additional to those 47. The synthesis graph and included abstractions remain unchanged.

## Independent same-settings reference

`mobile/tests/audio_compare/render_compare.c` has two paths, each run in a **fresh process and private copy of the original patch**:

1. **Reference:** directly initialize libpd, open the pristine original patch, and send its parameter values through the original instance-local receivers. This path does not use the MORRIGAN default table, parameter-validation implementation, or processing wrapper.
2. **Production:** use the actual MORRIGAN native initialization, parameter adapter and processing wrapper compiled into the Android library.

Both use identical sample rate, warm-up tick count, parameter values and sample-aligned control events. The reference values are parsed from the original source; the production defaults are exercised as-is. A third reference run reproduces the previous dry calibration settings with the same gates and master value, isolating that preset change.

The reference and production both use libpd's genuine Pure Data implementation. This verifies that the MORRIGAN adapter/defaults preserve the original patch's computed output in these conditions; it is not independent evidence that libpd itself matches every other Pd version or physical output stack.

## Observed results

48 kHz floating-point analysis, original mono duplicated into two channels:

| Scenario | Frames / duration | Production versus original reference |
| --- | --- | --- |
| Factory preset: eight individual gates and all voices together | 552,000 / 11.5 seconds | **All 1,104,000 samples identical**, maximum difference 0, RMS difference 0 |
| All 47 parameters exercised while voices sound | 950,400 / 19.8 seconds | **All 1,900,800 samples identical**, maximum difference 0, RMS difference 0 |

- Factory preset whole-file peak: **0.1418603361**; RMS **0.0211539125**.
- All-parameter scenario whole-file peak: **0.0690198466**; RMS **0.0145292264**.
- Production safety-ceiling hits: **0**. Nonfinite replacements: **0**.
- Previous dry preset versus restored factory: RMS difference **0.0406182537**, maximum sample difference **0.2882461548**. Dry-preset RMS was **0.0347210157**; its higher overall level is preserved in the listening files.

The hard safety ceiling at ±0.95 is still an intentional departure for extreme levels. It was inactive in both verified comparisons. Exposed limiter/nonfinite counters let the UI distinguish that intervention from AudioTrack underruns; arbitrary high-feedback/high-level combinations are not claimed to be transparent or safe merely because these presets passed.

## Targeted voice cross-modulation proof

The user's follow-up described a smooth, bell-like result with no apparent cross-modulation. **The original factory preset itself has all four MOD amounts at zero.** Restoring that preset restores its tone/effects, but does not turn voice cross-modulation up. The earlier calibration preset additionally chose SOURCE=OFF and SHARP=0, making the reduction more pronounced.

The comparison runner now includes a dedicated, clearly labeled demonstration using all eight held voices. It keeps original factory tuning/sharpness, chooses the other-voice-pair sources (`SOURCE 12=34`, `SOURCE 34=12`, `SOURCE 56=78`, `SOURCE 78=56`, all internal value 0), and turns output drive/distortion/delay feedback/mix and vibrato off to isolate voice cross-modulation. Master is 32. Routing switch and total feedback remain off.

| Recording time | All four MOD amounts | Other changes |
| --- | ---: | --- |
| 0–2 seconds | 0 | Eight voices held continuously |
| 2–4 seconds | 48 | None |
| 4–6 seconds | 96 | None |
| 6–8 seconds | 0 | None |
| 8–8.5 seconds | 0 | Release all eight sensors |

A separate reference control recording uses exactly the same timed controls/gates but keeps MOD=0 throughout. This distinguishes the modulation intervention from a different note pattern, different initial phase or unsynchronized playback. The production and direct-original-reference demonstration are **sample-identical across all 816,000 float samples**. Both match the control baseline exactly through the first two seconds.

Measured settled windows, excluding the immediate control boundary:

- MOD=48: RMS difference from its simultaneous MOD-zero control **0.0237851768**.
- MOD=96: RMS difference **0.0462563024**.
- At MOD=96, RMS remains similar (0.03197 versus baseline 0.03122), while normalized adjacent-sample energy changes from **0.03568 to 0.03927**, about **10.06%**. This diagnostic is insensitive to uniform output gain and confirms a changed waveform texture; it is not a psychoacoustic quality score or a claim of identical SOMA hardware sound.
- Whole demonstration peak: **0.0615683161**; limiter/nonfinite replacements remain zero.

The initial diagnostic used an unsuitable absolute threshold of 0.01 for normalized waveform roughness; the observed change was 0.00359 against a baseline of 0.03568. The acceptance criterion is now explicitly relative: greater than 5% change at MOD=96, plus nonzero causal waveform differences and exact production/reference equality. The original failed-attempt artifacts were retained separately.

Returning MOD to zero restores the original modulation amount, but oscillators retain the phase history accumulated while modulating. The final MOD-zero segment is therefore not required to become sample-identical to the never-modulated control.

Listening files and the extended report are in `/workspace/artifacts/mobile-audio-crossmod/`:

- `cross-modulation-reference.wav`
- `cross-modulation-morrigan.wav`
- `cross-modulation-mod-zero-baseline.wav`
- `report.json`, including section timings, explicit settings, controls and differences.

These are 8.5-second unnormalized recordings at master 32. The prior factory/dry comparisons remain unchanged and still pass.

**Manual panel recipe:** start from factory values, sustain the voices using gates/MIDI (or the two HOLD banks), set the four SOURCE selectors to their numbered partner pair rather than OFF, and turn the four MOD controls from 0 to 48 and then 96. For the isolated test above, set VOL=32, DRIVE=0, DISTORTION MIX=0, DELAY MIX=0, FEEDBACK=0 and VIBRATO off. Keep SWITCH and TOTAL FB off. Lower MOD again to hear the contrast; effects can then be added independently.

## Listen and reproduce

Session artifacts are in `/workspace/artifacts/mobile-audio-comparison/`:

- `reference.wav` — direct-libpd original patch.
- `morrigan.wav` — restored production adapter; identical to the reference for this scenario.
- `old-dry.wav` and `restored-factory.wav` — the audible preset correction.
- `report.json` — metrics, source identity, factory values, comparison results.
- Per-run event files, logs, float recordings and metadata.

WAVs are 48 kHz, signed 16-bit stereo containers with duplicated mono. **No loudness normalization** was applied. Every listening run uses master parameter 64; the differing synthesis/effect presets naturally produce different levels.

```sh
python3 mobile/tools/prepare_lira.py
cmake -S mobile/app/src/main/cpp -B mobile/.cache/host-build -DCMAKE_BUILD_TYPE=Release
cmake --build mobile/.cache/host-build -j 4
python3 mobile/tests/audio_compare/compare.py --output /tmp/morrigan-comparison
python3 mobile/tests/native/run_test.py --output /tmp/morrigan-native-test.wav
```

Output locations must be new. Both Python runners use temporary private patch copies: LIRA's original `gui.link` autosaves `parameters.txt`, so running a test directly inside generated Android assets would modify that generated preset. Source checkouts and final packaged assets must remain pristine; rerun asset preparation before packaging if older tests were run directly against the generated asset directory.

## Remaining verification

Real Pixel speaker/headphone/USB output, Android AudioTrack scheduling, hardware MIDI timing, low-buffer glitches, thermal behavior and physical listening remain separate tests. The application can now expose the original modules and settings rather than just a reduced controller, but this objective host comparison alone cannot diagnose a phone-specific audio-path fault.
