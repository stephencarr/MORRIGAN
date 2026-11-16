# Android host UI and state tests

Run from `mobile/` with the configured Android SDK and JDK:

```sh
gradle :app:testDebugUnitTest
```

JUnit 4.13.2 and Robolectric 4.18 are pinned in `app/build.gradle`. The first run downloads Robolectric's instrumented Android framework and native graphics runtime. A managed environment's Java proxy/CA configuration may need propagating to the test JVM; no private proxy paths or credentials belong in the project.

- `LiraPanelViewTest`: actual Android widgets with native Skia rasterization, 47 parameter controls and callbacks, real precision-SeekBar touch input, MIDI state refresh, action controls, momentary pad release/cancel, viewport reachability and scrolling at 393×820 and 820×393 logical pixels.
- `InstrumentStateTest`: stopped-state editing, MIDI updates, all-parameter factory restore preserving master volume, invalid-value rejection and persistence across service recreation. These tests never start libpd or AudioTrack.
- `NativeGraphicsRuntimeTest`: checks that the native Canvas rasterizer produces actual pixels.

All rendering and service tests use Android API 35. One full-hierarchy two-finger dispatch test explicitly uses API 34: Robolectric 4.18's API-35 `NativeInput.nativeSplit` loses pointer coordinate offsets and supplies nanosecond timestamps to a millisecond API. That test-framework defect was observed as a correct split action/ID arriving at a pad with incorrect local coordinates. The test is not weakened and production touch handling is not rewritten to accommodate those incorrect events. Physical Pixel/Android-15 multi-touch validation is still required.

PNG captures are written to `app/build/reports/ui-native/`. They are native Android-widget **host test renders**, not Pixel screenshots. Their oscilloscope input comes from `resources/lira-scope.txt`: real host-rendered LIRA PCM, with source-file hash and extraction provenance in its header. The visible controller/status values are test fixtures, not evidence that a physical controller or phone was connected.

JUnit XML and HTML reports are under `app/build/test-results/testDebugUnitTest/` and `app/build/reports/tests/testDebugUnitTest/`.
