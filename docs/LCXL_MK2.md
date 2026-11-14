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
| Upper eight channel buttons | Toggle steps 1–8 on the displayed page |
| Lower eight channel buttons | Toggle steps 9–16 on the displayed page |
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
the end of a short/partial page are off and do nothing. Button releases and repeated held
messages do not toggle additional steps.

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
