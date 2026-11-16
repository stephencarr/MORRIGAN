# Architecture: first-sound checkpoint

MORRIGAN is a Linux instrument environment, not a new kernel or a replacement implementation of LIRA. See [DECISIONS.md](DECISIONS.md) for provisional choices and [HANDOFF.md](HANDOFF.md) for the full product definition.

## Implemented proof boundary

```text
Python test driver / virtual control event
    │ validated, named control message on loopback
    ▼
Separate unprivileged Pure Data process, no GUI
    │ explicit routing to LIRA instance-local receivers
    ▼
Original upstream standalone LIRA DSP graph
    │ two-channel recording of its duplicated mono output
    ▼
WAV + process log + event trace + numerical acceptance report
```

The adapter is intentionally specific to the pinned standalone patch. A generated runtime copy adds a bounded control receiver and recording tap; the original upstream checkout is kept intact. Control traffic must never use Pd's legacy global-message network execution mode. Parameter names and ranges are explicit, and network listening is local only.

The Python driver is not an audio engine. DSP executes in Pd; no browser, desktop event loop, graphics process or GPIO participates in the recording. This proves the headless signal path, not deadline-safe real-time hardware output. The test runtime deliberately has no audio-device backend.

## Proposed next process boundaries

1. A small instrument supervisor owns one audio application at a time, starts it muted, reports readiness, handles termination and bounds restart attempts.
2. A control service owns the physical device and translates the versioned device model to the active app's declared controls. Apps do not open GPIO directly.
3. A visualization reads a bounded, decimated audio/status stream. Losing that reader must not block the audio callback.
4. ZacOS launches graphical applications and provides Desktop Mode. It is not responsible for keeping the audio engine alive. Conventional Linux remains the compatibility development environment while ARM64 support is tested.

These services, hardware ownership and visualization paths are **PROPOSED**, not implemented by a WAV proof. Do not add a plugin framework or an app store before one long-running real-device instrument is reliable.

## Audio ownership and device choice

The first proof owns a file sink only. It does not choose a sound card, request elevated scheduling, launch JACK/PipeWire, or configure the host's mixer.

Next, test a single application against a stable ALSA card identifier on Pi hardware. Compare a PipeWire/JACK route only where device sharing, browser audio or measured reliability requires it. Record sample rate, buffer/period sizes, observed underruns, measured latency and reconnect behavior; `-noaudio` success supplies none of those measurements.

## Control contract scope

The LIRA adapter's version-1 event carries a device identity, an allowlisted control identity and a bounded absolute value. This is the minimum application-control slice needed for the first proof. It is **not yet** the full physical-controller protocol: discovery, capabilities, switch/touch semantics, relative encoders, feedback, reconnect/reconciliation, mapping persistence and ownership remain explicit next work.

Use USB MIDI where conventional messages suffice. Compare serial/HID or MIDI SysEx for richer device/state semantics once a simulated bidirectional device exists. Do not bind the permanent protocol to a particular microcontroller or the current experimental TCP transport.

## Application and desktop boundaries

LIRA, ZacOS and Clatter keep their upstream implementations and licences. ZacOS is the preferred desktop; [ZACOS.md](ZACOS.md) records source evidence and ARM64 gaps. Clatter's DSP uses an AudioWorklet but its sequencer scheduling still involves the main thread; [CLATTER.md](CLATTER.md) records why a browser adapter is a later, separate integration.

No arbitrary third-party app is treated as sandboxed merely because it runs as a subprocess. Local developer installs should be explicit and unprivileged; evaluate Linux isolation before offering untrusted app installation.
