# MORRIGAN OS: Autonomous Engineering Handoff

Canonical user brief, received 2026-11-16. The subsequent first-success criterion is recorded in PRODUCT.md.

## Mission

You are the principal engineer and technical lead for MORRIGAN OS, an open-source instrument operating environment.

Your assignment is to take the project from product vision through technical investigation, architecture, software proofs of concept, automated tests, and as many working engineering milestones as can reasonably be completed without physical hardware or user intervention.

Do not stop after creating a plan. Investigate, build, test, and integrate real working software.

Use parallel specialist subagents wherever the environment supports them. Coordinate their work, review their findings, and merge the results into a coherent implementation.

Do not repeatedly ask the user to make routine implementation decisions. Choose sensible, reversible defaults and document them.

Work within the current Codex session and available execution budget. Do not imply work continues after the session finishes unless an actual scheduled or resumable workflow has been established.

## PART I: CANONICAL PRODUCT DEFINITION

### 1. Vision

MORRIGAN OS is a dedicated musical computer combining:

- The visual personality of classic Macintosh computers.
- The immediate tactile experience of boutique synthesizers.
- An open Linux-based application environment.
- A consistent hardware control surface.
- Extensible audio and MIDI capabilities.
- A distinctive vintage-computer enclosure.

Its intended users are musicians, experimental sound designers, synthesizer enthusiasts, makers, and developers.

The fundamental experience is:

Switch on. Make sound. Explore.

The machine should feel like an instrument first and a computer second.

### 2. Product identity

The visual north star is a retro-futurist desktop instrument inspired by:

- The computers seen in Severance.
- Classic Macintosh System 6/7/8/9 interfaces.
- SOMA Laboratory instruments.
- 1960s aircraft instrumentation.
- The tactile controls of Erica Synths Pērkons.
- Vintage monochrome computer terminals.

Aesthetic direction:

- Cream or ivory enclosure.
- Charcoal or black inset control panels.
- Amber monochrome instrument display.
- Substantial metal knobs and switches.
- Integrated trackball.
- Carefully restrained illumination.
- Modular internal electronics.
- High-quality, deliberately mechanical construction.

MORRIGAN should look like a serious piece of fictional vintage equipment containing surprisingly modern technology.

The final hardware design is not yet frozen.

### 3. Two primary operating experiences

**Instrument Mode**

The default startup experience.

- An amber monochrome oscilloscope or visualization.
- Sound engines available immediately.
- Physical controls remain active.
- No desktop navigation required to play.
- Minimal operational status and essential feedback.
- Audio runs independently of the graphical user interface.

The instrument should be usable with the display disconnected or malfunctioning, as far as the selected instrument's control requirements permit.

**Desktop Mode**

A classic Macintosh-inspired operating environment built around ZacOS 9.

- Desktop with icons and windows.
- Application launcher.
- File management.
- Instrument applications.
- Effects and routing configuration.
- System diagnostics.
- Audio and MIDI settings.
- Preset and project management.
- Developer tools where appropriate.

The integrated trackball provides pointer interaction.

The desktop must never block audio processing.

### 4. Hardware philosophy

The built-in control surface is fixed and recognizable.

Applications must adapt to its capabilities rather than require arbitrary physical layouts.

The final surface may contain:

- Eight voice strips.
- Multiple potentiometers per voice.
- Metal toggle switches.
- Touch-sensitive trigger surfaces.
- Dedicated master and effects controls.
- Performance buttons.
- A trackball.
- A limited number of encoders.
- Status LEDs.
- A display.

These are design candidates, not a finalized component inventory.

The operating environment should use a versioned hardware-control model rather than binding application logic directly to GPIO.

Support additional external MIDI controllers and USB peripherals.

### 5. Software architecture principles

The intended major components are:

1. Linux operating system.
2. ZacOS graphical environment.
3. MORRIGAN system services.
4. Audio and MIDI services.
5. Hardware abstraction and control mapping.
6. App runtime / launcher.
7. Instrument and utility applications.

Core architectural principles:

- Real-time audio must not depend on the desktop event loop.
- Applications must not directly access hardware GPIO unless explicitly authorized.
- Control mappings must be inspectable and configurable.
- The operating environment must handle application lifecycle.
- Audio resources must have deterministic ownership and routing.
- A malfunctioning app should not destabilize the entire system.
- Keep abstractions small until concrete applications justify them.

Avoid inventing a new operating-system kernel.

MORRIGAN OS is an instrument-focused Linux distribution/environment.

## PART II: UPSTREAM PROJECTS

### 6. ZacOS 9

Source: https://github.com/chromasystemprofessional/Zac-OS-9

Desired role: The classic desktop environment for MORRIGAN OS.

Important: Do not assume ZacOS already runs on Raspberry Pi.

Investigate its:

- Supported CPU architectures.
- Debian version and dependencies.
- wlroots and Wayland requirements.
- Qt dependencies.
- GPU and display requirements.
- Linux input integration.
- Build system.
- Current maturity.
- Licensing.
- Session management.
- Application launching.
- Compatibility with Raspberry Pi OS or Debian ARM64.

Read the actual source and build instructions.

Determine whether ZacOS can be built and run on ARM64 with the Raspberry Pi graphics stack.

If ARM64 support requires patches, evaluate the precise effort before attempting large changes.

If ZacOS cannot reasonably be run in the development environment, create a separate, clearly labeled compatibility prototype using a lightweight Linux desktop.

Do not replace ZacOS permanently with a custom imitation simply because the port is difficult.

Upstream should remain the preferred long-term solution.

Do not modify or publish to the upstream repository without authorization.

### 7. LIRA-8

Source: https://github.com/MikeMorenoDSP/LIRA-8

This is Mike Moreno DSP's software interpretation of the SOMA Lyra-8.

Use the standalone Pure Data source as the initial integration target.

Investigate:

- Audio graph and processing requirements.
- Dependencies on Pure Data externals.
- Eight-voice implementation.
- MIDI handling.
- Available synthesis parameters.
- Internal receive/send symbols.
- Preset loading.
- Startup initialization.
- DSP performance.
- Headless operation.
- Audio output configuration.
- Stereo output and effect processing.
- Licensing and redistribution conditions.

Do not assume the precompiled plugin binaries will run on Raspberry Pi.

Prefer running the source in a suitable Pure Data runtime.

Build a small control adapter exposing the LIRA parameters through MORRIGAN's application-control system.

The goal is to use the existing engine, not recreate it.

### 8. Clatter

Source: https://github.com/clickysteve/clatter

Clatter is a browser-based music workstation using the LXR sound engine.

It is an intended MORRIGAN application, but is not a prerequisite for the first playable system.

Investigate:

- Browser and WebAssembly requirements.
- AudioWorklet support.
- ARM64 Chromium compatibility.
- Audio latency.
- Web MIDI.
- Fullscreen/windowed operation.
- GPU requirements.
- Control-surface integration.
- Resource utilization.
- Whether its existing software architecture can coexist cleanly with MORRIGAN's audio system.

Do not rewrite Clatter to suit MORRIGAN.

Prefer a bounded integration adapter.

Do not modify the original Clatter repository in place.

### 9. Licensing and intellectual property

Audit the licenses and obligations for all upstream projects.

Include:

- ZacOS.
- LIRA-8.
- Clatter.
- Pure Data.
- Any additional dependencies.
- Fonts, icons, graphics and sounds.

Document distribution obligations, source attribution, license compatibility, and trademark limitations.

MORRIGAN must not imply official endorsement by SOMA, Erica Synths, Apple, or upstream software authors.

Do not bundle proprietary Macintosh ROMs, system software or other unlicensed assets.

## PART III: HARDWARE TARGET

### 10. Initial platform

Use Raspberry Pi 5 as the primary candidate.

It is not permanently selected until the technical investigation supports it.

Compare with realistic alternatives only when a specific issue warrants it.

Desired properties:

- ARM64 Linux.
- Reliable stereo audio.
- Low-latency audio processing.
- USB MIDI.
- HDMI output.
- Moderate power consumption.
- Reliable startup and shutdown.
- Available documentation and development tools.

Do not assume a Raspberry Pi is automatically adequate for every audio workload.

### 11. Audio requirements

Investigate and prototype:

- ALSA versus JACK/PipeWire where relevant.
- Stable device selection.
- Sample rates.
- Buffer sizes.
- Underrun detection.
- Audio process scheduling.
- Multiple application audio routing.
- Device hot-plug behaviour.
- Mixer and volume handling.
- Crash recovery.
- Startup muting.
- Clean shutdown.

The initial target is reliable stereo output from one application.

Do not attempt a complex multi-application modular audio graph until basic audio reliability has been established.

Provide actual benchmark results when execution permits.

Otherwise label results as unverified.

### 12. Control hardware

We expect a central control microcontroller, with candidate platforms including Teensy 4.x or RP2350.

The control processor will:

- Acquire potentiometer values.
- Read switches and buttons.
- Detect touch inputs.
- Drive LEDs.
- Handle debounce and filtering.
- Expose control events to the host.
- Receive state feedback.
- Support calibration.
- Manage communications and recovery.

A modular PCB architecture is desirable:

- Voice-control boards.
- Global/effects board.
- Performance/touch board.
- Central control/backplane board.

The electrical and mechanical design is not the first implementation priority.

Create a simulated control device first.

Define a protocol that can later be implemented on physical hardware.

USB MIDI and USB serial/HID are candidates. Compare them, including their support for bidirectional state, device discovery, and event semantics.

Prefer standard interfaces where practical.

### 13. Control-surface API

Define a small versioned model describing:

- Device identity.
- Control identity.
- Control type.
- Input values.
- Relative and absolute behaviours.
- Buttons and switches.
- Touch state.
- LED output and feedback.
- Control capabilities.
- Application mappings.
- Connection and disconnection events.

Applications should be able to discover the control surface and map it to their own functions.

Support external MIDI controllers without compromising the built-in mapping.

Do not build a large general-purpose plugin API prematurely.

Start with the smallest model needed to integrate a simulated controller and LIRA-8.

## PART IV: APP PLATFORM

### 14. Third-party application model

Anyone should be able to develop and install a MORRIGAN-compatible application.

The platform needs:

- A documented application manifest.
- Application discovery.
- Installation.
- Launching.
- Closing.
- Version metadata.
- A control-surface interface.
- Audio and MIDI capability declarations.
- Persistent application data.
- Logs and diagnostics.

First-party and third-party apps should use the same documented integration mechanisms.

However, arbitrary untrusted executable software must not be silently treated as secure.

Research suitable Linux application isolation and permissions.

For V1, a local developer-install workflow may be enough.

Do not build an app store.

### 15. Initial applications

**LIRA**

The first serious sound-producing application.

It must demonstrate control of the existing LIRA sound engine from a virtual or external MIDI control surface.

**Scope**

A simple oscilloscope or audio visualization.

Default Instrument Mode application.

Investigate efficient approaches to sampling an audio signal for visualization without disrupting real-time playback.

**Diagnostics**

Display:

- Connected control devices.
- Event stream.
- Audio device status.
- CPU and memory usage.
- Application health.
- Audio underruns where measurable.

**Patch Bay**

A future routing interface for control and audio resources.

Start with a technical design rather than a complete graphical patching system.

**Clatter**

A later integration target once the application runtime and audio architecture are proven.

## PART V: ENGINEERING ORGANIZATION

### 16. Use parallel specialist agents

Where the Codex environment supports multi-agent workflows, delegate independent, bounded workstreams.

Use these specialist roles:

**Agent A: ZacOS / Linux integration**

Investigate architecture compatibility, ARM64 build requirements, desktop startup, display services, and practical integration.

Deliver a feasibility report plus patches or a working proof where possible.

**Agent B: Audio / Pure Data**

Investigate LIRA-8, create headless launch experiments, implement control input experiments, establish testing methodology, and investigate low-latency audio.

**Agent C: Hardware / control protocol**

Define the controller abstraction, simulated inputs, event handling, device discovery and hardware interface recommendations.

**Agent D: Application platform**

Design and implement a minimal manifest, launcher, application lifecycle and developer integration contract.

**Agent E: Quality / reliability / security**

Review test design, service failure recovery, file permissions, audio safety, licensing, dependency risks and reproducibility.

**Agent F: Product UX / visual integration**

Investigate feasible ways to integrate Instrument Mode, the amber oscilloscope, ZacOS navigation and application launch flows without replacing the upstream desktop.

Provide a minimal demonstrable experience where possible.

**Coordination rules**

- Only delegate work that is genuinely independent.
- Give agents distinct file ownership and write scopes.
- Do not have multiple agents edit the same files concurrently.
- Run research work in parallel when useful.
- Establish shared interfaces before parallel implementation.
- Main agent owns integration and architectural decisions.
- Review all agent-produced changes before accepting them.
- Run integration tests after merging.
- Record each agent's work, evidence, results and unresolved issues.

If subagent tools are unavailable, proceed sequentially without treating that as a blocker.

## PART VI: MILESTONES

### Milestone 000: Technical reconnaissance

Inspect all upstream repositories.

Create:

- PRODUCT.md
- ARCHITECTURE.md
- FEASIBILITY.md
- LICENSES.md
- RISKS.md
- ROADMAP.md
- DECISIONS.md

The investigation must answer:

1. Can ZacOS realistically run on the selected ARM64 platform?
2. Can standalone LIRA run headlessly?
3. What dependencies are needed?
4. What control interfaces are available?
5. Which portions can be tested without physical hardware?
6. What would be the smallest demonstrable system?
7. What technical assumptions remain unverified?

Do not spend excessive time making beautiful documentation. It must support implementation.

### Milestone 001: First sound

Make LIRA run in the available development environment.

Prefer a real Pure Data runtime.

Verify:

- Patch loads.
- Dependencies resolve.
- MIDI or injected note events trigger the engine.
- Audio output is generated.
- Eight voices can be triggered.
- Output is non-silent and free of obvious clipping under defined test conditions.

If audio hardware is unavailable, use an offline or virtual audio sink where feasible.

Capture objective results and logs.

Do not fabricate performance benchmarks.

### Milestone 002: Bootable instrument service

Create a reproducible Linux service configuration that:

- Starts the sound engine automatically.
- Runs without a graphical desktop.
- Restarts on recoverable failures.
- Records useful logs.
- Handles stopping and shutdown cleanly.
- Can run with an HDMI display disconnected.

Test using a Linux VM/container where possible, noting which aspects require actual Pi hardware.

### Milestone 003: Virtual control surface

Implement a simulated MORRIGAN controller.

Include:

- Potentiometers.
- Switches.
- Buttons.
- Touch triggers.
- Parameter changes.
- Connection/disconnection simulation.
- Event logging.

Connect this to the LIRA application adapter.

The result should allow real sound manipulation without physical controller hardware.

Write unit tests for the event protocol.

### Milestone 004: Basic MORRIGAN application environment

Create a minimal demonstration of:

- Application discovery.
- Application manifest parsing.
- Application launching.
- App lifecycle reporting.
- Control-device integration.
- Safe failure reporting.

Avoid building a completely new desktop.

Use ZacOS where feasible, or a clearly marked temporary compatibility environment.

### Milestone 005: Instrument Mode

Implement a minimal visual instrument experience:

- Amber monochrome display.
- Oscilloscope or meaningful audio visualization.
- Status indicating active audio engine.
- Pointer support.
- A way to enter and return from Desktop Mode.

Keep audio independent of the graphics process.

### Milestone 006: ZacOS integration

Integrate with ZacOS if compatibility and build findings support it.

Demonstrate:

- Desktop startup.
- MORRIGAN application launching.
- Trackball/pointer input.
- Instrument Mode transition.
- Audio continuing across the transition.

If ARM64 compatibility blocks progress, document the smallest upstream changes required and preserve a runnable fallback rather than attempting an uncontrolled rewrite.

### Milestone 007: External controller integration

Support a standard USB MIDI controller.

Use existing MIDI hardware conventions.

Demonstrate:

- Parameter mapping.
- MIDI learn or configurable mapping.
- Relative and absolute input handling where relevant.
- Basic feedback.
- Persistence of mappings.

The Launch Control XL2 is a known user-owned test candidate.

Include clear instructions for testing it.

### Milestone 008: Clatter integration investigation

Determine how Clatter could run as an application.

Prototype only after the underlying app platform is working.

Benchmark browser audio and resource requirements.

Document all constraints.

Do not let Clatter integration block LIRA or the desktop environment.

### Milestone 009: Raspberry Pi deployment

Produce:

- Reproducible installation instructions.
- Startup scripts and service files.
- Audio configuration.
- Recommended display configuration.
- Controller connection instructions.
- Shutdown procedure.
- Test checklist.
- Hardware verification instructions.

Create a scripted or image-based deployment where feasible.

Do not claim hardware validation without running on physical hardware.

## PART VII: QUALITY BAR

### 17. Test real assumptions

Prefer executable tests over speculative documentation.

For every major technical claim, classify it as:

- VERIFIED: observed through a test or primary-source evidence.
- PARTIALLY VERIFIED: evidence exists but some relevant conditions remain untested.
- PROPOSED: a design awaiting validation.
- BLOCKED: cannot proceed with available environment or information.

Keep this distinction explicit.

For software tests, include commands and actual observed outputs.

For hardware-dependent tests, provide clear reproducible procedures.

### 18. Definition of done

Each completed milestone must have:

- Working code or a substantive tested engineering artifact.
- Reproducible setup.
- Automated tests where appropriate.
- Clear acceptance criteria.
- Known limitations.
- Updated architecture documentation.
- A working or recoverable repository state.

A milestone is not complete just because code was written.

### 19. Security and stability

Never execute arbitrary third-party applications with elevated privileges merely to simplify integration.

Avoid insecure default services.

Do not expose unauthenticated remote administration to the public network.

Use least-privilege mechanisms wherever practical.

Do not perform destructive changes to machines, repositories or user data.

Do not flash hardware or modify real devices without explicit authorization.

Do not publish builds, create public releases, deploy infrastructure or spend money.

Local tests and non-destructive implementation work are authorized.

## PART VIII: AUTONOMY AND EXECUTION

### 20. Operating instructions

You have permission to autonomously:

- Read public upstream repositories.
- Clone repositories when available.
- Install development dependencies in the sandbox if supported.
- Write original project code.
- Create tests.
- Run test suites.
- Benchmark software using available resources.
- Create documentation.
- Delegate independent work to agents.
- Refactor your own implementation.
- Fix discovered issues.
- Make reversible technical choices.
- Create local milestones and checkpoints.
- Commit changes in the working repository where appropriate.

Do not request user input for:

- Routine code organization.
- Framework selection when a clear fit exists.
- Naming internal modules.
- Testing methodology.
- Temporary development tooling.
- Implementation details that can be reversed.
- Minor UI layout decisions.

When an important design decision remains unresolved, choose a reasonable provisional approach, write it down, and continue with work that does not depend on that decision.

Escalate only when a decision is irreversible, externally consequential, security-sensitive or materially expensive.

### 21. Stay on the critical path

The most important technical risks are:

1. ZacOS compatibility.
2. LIRA/Pure Data execution.
3. Reliable audio startup.
4. Controller integration.
5. Application lifecycle and extensibility.

Resolve those before investing heavily in decorative UI or hardware enclosure design.

Avoid premature abstraction.

Avoid creating an elaborate plugin framework before one real instrument can run.

Avoid rebuilding upstream components that can be reused.

### 22. Repository structure

Inspect the existing repository before deciding on a structure.

If starting from an empty MORRIGAN repository, a possible layout is:

- "docs/" — product definition, architecture, design decisions and investigations.
- "platform/" — system services and application management.
- "control/" — control protocol, simulator and mapping.
- "apps/" — first-party app integrations.
- "ui/" — Instrument Mode and graphical shell integration.
- "deploy/" — system setup and Raspberry Pi deployment.
- "tests/" — automated verification.
- "third_party/" — licensed upstream references or reproducible dependency declarations.

This is only a suggestion.

Prefer a smaller repository structure where possible.

Preserve upstream history and license requirements.

### 23. Final reporting

At the end of the available work session, report:

**Executive summary**

What actually works now?

**Engineering progress**

Milestones completed, partially completed, or blocked.

**Agent results**

What each agent accomplished and where its outputs live.

**Working demonstrations**

Commands for running each POC.

**Verification**

Tests run, results, failures and environmental limits.

**Architecture**

Chosen design and remaining significant decisions.

**Hardware feasibility**

What still needs testing on a Raspberry Pi and real control hardware.

**Risks**

The most important unresolved issues.

**Next actions**

The next highest-value engineering tasks.

**User involvement**

A minimal, explicit checklist of anything requiring the user to supply hardware, credentials or make an important decision.

Do not claim the system is ready for an instrument build unless the core audio path and control integration have been verified.

## START NOW

Begin by inspecting the existing working repository, then the ZacOS, LIRA-8 and Clatter sources.

Create a concise execution plan.

Delegate independent investigations immediately where subagents are available.

Start implementing the shortest viable path to:

A Linux computer booting into an eight-voice, LIRA-powered musical instrument with a standardized control interface and a classic desktop environment accessible when needed.

Produce the first runnable proof of concept as early as possible.

Continue through subsequent milestones while time, tool access and test results permit.

The outcome should be genuine engineering progress, not merely an impressive proposal.
