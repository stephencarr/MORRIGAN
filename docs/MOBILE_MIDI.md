# MORRIGAN Mobile USB MIDI

The Android application receives **USB MIDI 1 byte-stream input through Android's native MIDI service**. It does not use Web MIDI, a browser, network MIDI, root access or a replacement phone OS.

Implementation: `mobile/app/src/main/java/org/morrigan/mobile/midi/`.

## Connect a controller

1. Use a USB-C **data/host** adapter or a data-capable powered USB hub. Connect the MIDI controller to that adapter/hub. The Pixel is the USB host.
2. Open MORRIGAN Mobile and start the instrument. The MIDI status line reports recognized USB MIDI devices and open input ports.
3. Choose the **NOTES** profile for a conventional MIDI controller, or **LCXL** for the user's Launch Control XL Mk2.
4. Begin at a modest output level. Try one note, release it, then change its tuning control.

A charge-only cable will not work. Android's developer setting that makes the *phone itself* a USB MIDI peripheral is a different connection direction; it is not required for receiving a USB controller. Devices must expose a class-compliant MIDI interface supported by Android. Vendor-only desktop drivers cannot be assumed to work.

For first hardware testing, use the phone's speaker. Adding a USB audio interface and simultaneous charging requires a suitable hub and a separate audio-routing/power test. A powered hub may be needed for the LCXL's power requirements. USB-C Power Delivery pass-through and data-host behavior depend on the hub; neither is validated by source tests.

## Explicit input profiles

### NOTES

All 16 MIDI channels are accepted. Note numbers are stated numerically because keyboards disagree on octave labels.

| MIDI input | LIRA action |
| --- | --- |
| Notes 36–43, velocity > 0 | Press sensors 1–8 |
| Note-off, or note-on with velocity 0 | Release the corresponding sensor |
| CC 20–27, values 0–127 | Tune voices 1–8 |
| CC 7, values 0–127 | Original LIRA master `vol` parameter |
| CC 120 / 123 | Release notes owned by that device port and channel |
| System Reset (`FF`) | Global panic |

Velocity is treated as gate strength on/off, not invented per-voice amplitude. Pitch bend, sustain, aftertouch and other CCs are currently ignored.

### LCXL

Select **Factory Template 1 on the LCXL Mk2**, MIDI channel 9 (zero-based channel 8). This profile does not rewrite templates or send SysEx; template selection is manual.

| Hardware / message | LIRA action |
| --- | --- |
| Upper eight channel buttons, notes `41,42,43,44,57,58,59,60` | Momentary sensors 1–8, released on note-off/velocity-zero |
| Top knob row, CC `13–20` | Tune voices 1–8, values 0–127 |
| Faders, remaining knobs, second button row and navigation | Unassigned in this initial version |

The LCXL's channels and note constants are shared with the previous MORRIGAN Mk2 investigation, with reference to Novation's [Programmer's Reference Guide](https://fael-downloads-prod.focusrite.com/customer/prod/downloads/launch_control_xl_programmer_s_reference_guide.pdf). Physical controller behavior still requires testing. This mobile profile controls LIRA voices, not the old Clatter sequencer.

There is no per-voice volume parameter in this LIRA interface, so the faders are not presented as eight volume controls. Controller LED feedback, arbitrary MIDI learn, relative encoders and mapping persistence are not implemented by this input layer.

## Lifecycle and safety behavior

- Existing USB devices are enumerated on start; hot-plug callbacks discover new devices.
- Only USB devices are accepted. Android 13+ enumeration/callbacks explicitly request MIDI byte-stream transport; UMP/MIDI 2 messages are not passed to a MIDI 1 parser.
- Android names ports from the external device's perspective: its **output** ports are the application's inputs. All available device-output ports are opened.
- A pending asynchronous device-open callback is rejected and its device closed if the app has stopped, that device was removed, or a new connection replaced it.
- Every device port gets its own parser, so a fragmented/running-status message cannot contaminate another port.
- Gate ownership is tracked by device port, MIDI channel and note. Repeated note-on does not accumulate unmatched gate counts. One device disconnecting cannot release a voice still held by another USB device/channel.
- Disconnect, stream flush and profile changes release the affected owned gates. Profile changes do not reinterpret held notes as new voices.
- A global panic clears ownership. The application service must combine screen-touch and USB gate states before sending the final sensor value to the audio engine.
- Parsing retains no SysEx payload and uses bounded message state. System common messages cancel running status; realtime bytes can be interleaved safely.

`UsbMidiController.Sink` receives `onControl(name, value)`, `onStatus(status)` and `onPanic()`. Callbacks may occur off the UI/audio thread; the service must queue/coalesce controls onto its audio thread, rather than call libpd concurrently. `onPanic()` must not recursively call the controller's `panic()` method.

## Tests and verification boundary

The host parser/mapping tests use the real Java decoder and mapper, with no Android or external Java dependency:

```sh
python3 mobile/tests/midi/run_tests.py
```

They exercise fragmented input, running status, realtime interleaving, system common/SysEx, reset, bounds, all eight voices, zero-velocity release, duplicate notes, multi-device/channel ownership, profile transitions, both mapping tables and panic. The runner uses `javac`, or the JDK compiler module through `java com.sun.tools.javac.Main` when a separate `javac` launcher is unavailable.

Observed on the development host, 2026-11-16: **17 tests passed**. Android SDK compilation and full-app integration are recorded by the parent build/verification report; this host test alone does not compile or execute the Android USB service wrapper.

These are software tests. They do not establish that a Pixel enumerates a particular controller, that a hub supplies adequate power, that MIDI latency is acceptable, or that Android audio continues correctly through all physical hot-plug events.

## Pixel 9 acceptance procedure — not yet physically executed

1. Record Android version, app build, controller firmware/template, cable/hub, output device and charging state.
2. Start with no USB device: the instrument should run and show a truthful waiting status.
3. Attach a class-compliant controller while running; verify device status and all eight note gates. Repeat with the device connected before launch.
4. Send note-on with zero velocity and ordinary note-off; verify both release. Exercise chords, repeated notes and quick note/controller changes.
5. With the LCXL in Factory 1, select LCXL mode, test the upper eight buttons and top knob row. Confirm other channels and unassigned controls do not trigger voices.
6. Unplug while holding several notes; all notes owned solely by that controller must release. Reconnect and verify new notes work without restarting the app.
7. If a second device is available, hold the same voice from both devices and disconnect/release one; the remaining owner's gate must remain on.
8. Test profile switching and Panic while notes are held, repeated USB reconnects, screen rotation/activity recreation, background/foreground transitions and explicit instrument stop.
9. Separately measure controller-to-audio latency and long-run dropout behavior. A responsive oscilloscope is not a latency measurement.
