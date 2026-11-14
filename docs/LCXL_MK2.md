# Launch Control XL Mk2: CLATTER sequencer experiment

The LCXL is a quick way to test hands-on CLATTER operation with a mouse and no required
computer-keyboard shortcuts. MORRIGAN may eventually become a custom hardware controller
for CLATTER; this experiment does not specify that hardware. CLATTER owns the project,
sequencer, sound and undo history. The controller sends edits to the same application actions
used by the screen and receives feedback from that state.

## Use it

Open [CLATTER in MORRIGAN](https://stephencarr.github.io/MORRIGAN/clatter.html) in Chrome or
Edge. Choose **MIDI → Launch Control XL Mk2… → ENABLE MK2 PROFILE** and allow MIDI/SysEx
access. A single connected LCXL input/output pair is detected automatically; if there are
multiple devices, choose its input and LED output in the dialog and enable again.

Enabling selects **Factory Template 1**. It changes the current template without writing or
replacing any user template. Ordinary MIDI learn does not request SysEx; this profile requests
it for template selection and indexed LED feedback. Enable the profile again after reloading. Make knob/fader learn assignments with this profile
active so they use the same Factory 1 messages.

| Hardware | Action |
| --- | --- |
| SEND SELECT Up / Down | Previous / next CLATTER track, stopping at the ends |
| TRACK SELECT Left / Right | Previous / next 16-step page |
| Upper eight channel buttons | Tap steps 1–8 to toggle; hold and turn a mapped knob to lock |
| Lower eight channel buttons | Tap steps 9–16 to toggle; hold and turn a mapped knob to lock |
| Knobs and faders | Available to the existing MIDI CC learn feature |
| Device / Mute / Solo / Record Arm | Available to MIDI button learn; unassigned presses do not trigger drums |

The mouse can still select tracks and edit the pattern. The controller follows those changes,
including undo, pattern replacement and parameter locks. Track assignments remain flexible;
the profile works with the project's actual track count. This does not change the workstation's
ten-track defaults.

**FOLLOW** starts off: playback never moves you away from the page you chose to edit.
The playhead lights only when it crosses that page. Click FOLLOW if you explicitly want
automatic page changes; manual page selection turns it off again.
All navigation and setup controls are also clickable in the LCXL bar. Buttons beyond
the end of a short/partial page are off and do nothing. A short tap toggles once on release.
Holding for half a second or moving a knob suppresses the toggle, so inspecting/editing an
existing hit does not delete it. Repeated held messages do not toggle additional steps.

## Hold a step and turn a knob

First use MIDI learn to assign a knob to a voice synthesis control, such as FILTER CUTOFF,
AMP DECAY or OSC COARSE. Hold a step button on the LCXL and turn that knob. The value becomes
a parameter lock on the held step, the LED turns red, and the LCXL strip names the step,
parameter and value. The STEP SOUND editor opens for inspection and mouse editing.

The base kit stays unchanged. On release, the knob controls its normal learned destination
again. An empty step gets a hit when its first lock is written. Multiple held steps can be
locked together, and the entire hold gesture is one Undo action. Use the lock's **×** or
**CLEAR LOCKS** in STEP SOUND to remove locks; the LEDs update from those mouse edits too.

The held step's actual voice is used, including a per-step voice override. A knob mapped to
another voice uses a matching group/name parameter when available (for example, another
voice's filter cutoff). Unsupported parameters and sample-only tracks report that they
cannot take that lock. Tempo, mixer controls and global FX are not voice step-lock targets;
turning these or an unmapped knob while holding a step does not change the base sound or
toggle the step.

Track/page/pattern changes and Undo cancel pending holds. Release and press again before
editing the new location. Disconnecting or switching templates closes the gesture and
clears held buttons. Optional FOLLOW pauses page movement while steps are held.

## Learning controls without performing them

Open **MIDI → MIDI learn…**, select the input, then **CHOOSE ON SCREEN**. Hover an outlined
control to see its name; click to select it. The selected control keeps a double outline while
waiting for MIDI. Selection does not change its value or trigger playback.

The on-screen Play button toggles playback and changes to Stop while playing. Select it to
learn **TRANSPORT · PLAY/STOP TOGGLE**. The dropdown also offers separate **PLAY** and **STOP**
actions. Press a Note or momentary CC button to assign an action, release, then press again to
use it. The assignment press does not perform the action, and releases or repeated held messages
do not retrigger it. Knobs/faders still use absolute CC messages; existing assignments are retained.
The 16 sequence buttons and navigation arrows remain reserved for the fixed LCXL profile.

| LED | Meaning |
| --- | --- |
| Off | Empty step |
| Dim green | Normal hit |
| Dim amber | Probability, ratchet, flam, pitch/sample override, variation, voice override or trigger condition |
| Dim red | Parameter lock or parameter rule (takes precedence over other modifiers) |
| Brighter version of that colour | Current playback step |
| Bright yellow | Current playback step is empty |

The indicator follows CLATTER's audio-compensated playhead. It is a visual indicator, not a
separate MIDI clock or sample-accurate trigger. Like CLATTER's onscreen animation, LED updates
can slow when the browser tab is backgrounded. A button colour describes the stored step;
probability and other transformations may still make that hit silent in a particular pass.

Selecting another hardware template pauses sequencer input. Return to Factory 1 on the device
or click **RETURN TO FACTORY 1**. Reconnecting the selected ports reselects Factory 1 and
refreshes the LEDs. Disable clears the controlled LEDs. The LCXL's output is reserved for LED
feedback while enabled; musical note/clock output can use a different device.

## Protocol and implementation

- [Novation Mk1/Mk2 downloads](https://downloads.novationmusic.com/novation/launch/launch-control-xl-mk1mk2)
- [Novation Programmer's Reference Guide v2](https://fael-downloads-prod.focusrite.com/customer/prod/downloads/launch_control_xl_programmer_s_reference_guide.pdf), pp. 3–9: templates, LED intensity/buffers, indexed SysEx and template changes.
- Factory mapping cross-checks: [Bitwig Layout.js](https://github.com/jdachtera/bitwig-novation-launch-control-xl/blob/master/Layout.js), [Factory channel](https://github.com/jdachtera/bitwig-novation-launch-control-xl/blob/master/LaunchControlXL.js), [Web MIDI mapping](https://github.com/lazurite-app/launch-control-xl/blob/master/index.js). Protocol constants were checked against these references; their implementations are not included.

Factory Template 1 is template index 8 and MIDI channel 9 (zero-based channel 8). The channel
button notes are `41–44,57–60` then `73–76,89–92`. Direction CCs are `104–107`. Direction
messages are deliberately mapped by arrow direction: Up/Down changes tracks; Left/Right changes
step pages. This differs from the hardware's printed SEND SELECT / TRACK SELECT headings.

`lcxl.ts` contains fixed protocol constants and the small sequencer adapter. `lcxlSession.ts`
connects it to CLATTER and Web MIDI. Buttons are intercepted before musical note input/recording
or CC learn. LED traffic goes directly to the reserved device output, separate from musical
MIDI note ownership and panic. Only changed LEDs are sent during playback. Template changes,
button events and reconnects force a refresh.

Validation uses simulated Mk2 input/output plus the real browser audio engine. Physical Mk2
button/LED behaviour still needs checking on the user's controller.
