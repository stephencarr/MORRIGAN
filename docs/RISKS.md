# Open risks

| Risk | Evidence / boundary | Next verification |
| --- | --- | --- |
| Hardware audio may underrun or have excessive latency | Offline headless rendering cannot establish real-time deadlines; this host is x86-64 with no sound device | Pi 5 plus selected USB/I²S DAC; record buffer/rate, long-run underruns and loopback latency under load |
| ZacOS may need additional ARM64/graphics work | Debian ARM64 dependencies exist; architecture-specific packaging assumptions are identified; full compile and Pi KMS/input/session behavior remain untested | Build pinned source on clean ARM64 Debian 13, then exercise real Pi display/pointer/login/logout |
| Headless startup and failure recovery are not yet instrument-grade | A finite test process is not a boot service | User-level service lifecycle, readiness, mute/unmute, crash/restart loop limits, device loss and clean shutdown tests |
| LIRA adapter is tied to an upstream patch structure | Instance-local receivers require a generated integration patch at a pinned revision | Fail closed on revision/structure changes; regression-test the original graph and every exposed parameter |
| A local listener is not per-user authentication | Loopback blocks remote access but other users/processes on the host can reach it | Before multi-user deployment, authenticated or OS-permission-protected IPC; keep control and admin interfaces separate |
| Control lifecycle is incomplete | First proof supplies named absolute values, not physical discovery or bidirectional state | Simulator with disconnect handling, all-notes-off, device identity, takeover rules and feedback |
| Eight-voice sound proof is not a maximum-load benchmark | Deterministic test settings do not cover extreme feedback, distortion, modulation or sustained thermal load | Defined worst-case presets, sustained CPU/thermal/underrun capture, limiter and startup level policy |
| Redistribution requires a full image inventory | Core upstream licences inspected; optional ZacOS emulation and imported assets have separate conditions | Keep optional extras out; audit exact package/assets/source obligations before distribution |
| Clatter may contend for audio or miss events during UI stalls | Separate WebAudio backend and main-thread event scheduling | Validate single-owner app switching before attempting shared audio routing |

No hardware enclosure, controller electronics, boot image, display-free physical startup or real-time scheduling claim is made by this checkpoint.
