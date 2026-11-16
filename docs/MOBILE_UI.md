# MORRIGAN Mobile display

`mobile/app/src/main/java/org/morrigan/mobile/ScopeView.java` is an original Android Canvas interface. It uses Android's built-in monospace typeface and geometric drawing; no Macintosh ROM, system software, copied Apple icon, proprietary font or upstream desktop is included. This is a small Mac-inspired instrument display, not Mac OS emulation or a port of ZacOS.

The amber screen contains one oscilloscope window, audio and USB MIDI status, eight momentary audition pads, Start/Stop, Panic, MIDI profile selection, screen pinning and master volume. Every visible action has a callback; the decorative title/menu strip does not pretend to expose an application menu.

## Integration contract

- Construct `ScopeView(Context)` and call `setListener(Listener)` from the UI thread.
- The listener supplies `onStartStop()`, `onPanic()`, `onVoice(int voice, boolean down)`, `onVolume(float normalized)`, `onProfileToggle()` and `onPinRequested()`.
- Voice numbers are 1 through 8; volume is finite and clamped to 0 through 1.
- Call `update(float[] samples, String audioStatus, String midiStatus, boolean running, String profile, float volume)` on the UI thread at approximately 30 Hz. The view copies at most 512 mono display samples. It neither reads the audio device nor performs synthesis.
- Profile strings are `notes` and `lcxl`. The UI requests a toggle; the MIDI/controller owner performs the actual change.
- Pin requests delegate to the Activity. Android screen pinning is a reversible dedicated-use option; it is not equivalent to a device-owner kiosk or a replacement operating system.

## Touch and accessibility

The layout uses density-independent coordinates, with 44 dp action targets. Audition pads use four columns on narrow displays and eight where the available width permits. The window adapts to portrait/landscape dimensions supplied by its Activity; the Activity remains responsible for Android system-bar/cutout insets.

Voice pads track each pointer and count multiple fingers on the same pad. The final finger release sends note-off. Leaving a pad releases it; dragging does not silently trigger a neighboring voice. Cancelled touches, lost window focus, detachment, resizing, stopping, Panic and profile changes release held touch voices.

Pads and Panic are disabled while the engine is stopped. Start, profile selection, master volume and Pin remain available. The scope shows a flat baseline while stopped and sanitizes nonfinite/out-of-range display samples.

The plotted trace uses bounded visual gain (1–16×), labeled inside the display, so conservative listening levels remain visible. This changes only the drawn trace, never audio gain or the samples supplied by the engine.

The custom view exposes virtual accessibility nodes for every action, including a ranged volume control. TalkBack can inspect/activate buttons and adjust volume; activating an audition pad produces a short 180 ms pulse. Tab/left/right move keyboard focus, Enter/Space activates a control, and up/down adjust the focused volume slider. This does not require a keyboard for ordinary operation. Physical TalkBack behavior and Android system-pinning interactions require device/emulator verification.

## Validation boundary

The view compiled successfully against the actual Android API 35 `android.jar` using the installed Java 21 compiler module:

```sh
java com.sun.tools.javac.Main -cp /workspace/android-sdk/platforms/android-35/android.jar \
  -d /tmp/morrigan-scope-classes mobile/app/src/main/java/org/morrigan/mobile/ScopeView.java
```

The compiler reported only deprecated accessibility-API notices; those older methods remain available for the app's minimum Android API. Full application build/runtime verification belongs to the mobile checkpoint report. A Canvas layout is not evidence of Pixel display performance, touch latency or uninterrupted audio. The Activity/service must keep audio independent of the rendering thread and release its own touch ownership when visual lifecycle events occur. The view is not an audio supervisor and does not claim to reset externally held USB MIDI notes.
