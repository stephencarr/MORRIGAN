/** Mk2 connection and CLATTER adapter. LED output is separate from musical MIDI output.
 * SPDX-License-Identifier: GPL-3.0-only
 */
import type { App } from '../app/app';
import type { Hit, StepSound, TrigCond } from '../model/types';
import { LCXL_OFF, LCXL_TEMPLATE, LcxlSurface, lcxlLeds, lcxlTemplate, selectLcxlTemplate, type StepLight } from './lcxl';

export function stepLight(hit: Hit | null | undefined, sound?: StepSound, condition?: TrigCond): StepLight {
  if (!hit) return 'empty';
  if (Object.keys(sound?.locks ?? {}).length || sound?.rules?.length) return 'locked';
  if ((hit.prob ?? 100) < 100 || (hit.ratchet ?? 1) > 1 || hit.flam || hit.note || hit.sample || sound?.v !== undefined || sound?.alt || sound?.voice !== undefined || (condition && condition.k !== 'always')) return 'modified';
  return 'hit';
}
const KEY = 'clatter-lcxl-mk2';
const deviceName = (name: string) => /launch\s*control\s*xl/i.test(name);

export class LcxlSession {
  readonly surface: LcxlSurface;
  enabled = false;
  templateReady = false;
  inputId: string | null = null;
  outputId: string | null = null;
  message = 'Connect your Launch Control XL Mk2, then enable the profile.';
  private leds = new Map<number, number>();
  private previousOutput: MIDIOutput | null = null;
  private wasConnected = false;
  private listeners = new Set<() => void>();
  private sending = false;
  private lastView = '';
  constructor(private app: App) {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null');
      if (typeof saved?.input === 'string') this.inputId = saved.input;
      if (typeof saved?.output === 'string') this.outputId = saved.output;
    } catch { /* Port choices are optional preferences. */ }
    this.surface = new LcxlSurface({
      state: () => {
        const p = app.pattern, t = app.track;
        return { pattern: p.id, steps: p.steps, track: app.trackIndexOf(t.id), tracks: app.project.tracks.length, trackName: t.name,
          cells: Array.from({ length: p.steps }, (_, i) => stepLight(p.grids[t.id]?.[i], p.sounds?.[t.id]?.[i], p.trig?.[t.id]?.[i])), playhead: app.playhead() };
      },
      selectTrack: (i) => { const t = app.project.tracks[i]; if (t) { app.select(null); app.selectTrack(t.id); } },
      toggleStep: (step) => { app.select(null); app.setCursor({ track: app.ui.track, step }); app.toggleCell(app.ui.track, step); },
    });
    app.midi.intercept((data, device) => this.receive(data, device));
    app.on('midi', () => this.frame());
  }
  onChange(fn: () => void): () => void { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  private changed(): void { for (const fn of this.listeners) fn(); }
  private output(): MIDIOutput | null {
    const port = this.outputId ? this.app.midi.access.access?.outputs.get(this.outputId) : null;
    return port?.state === 'connected' ? port : null;
  }
  get connected(): boolean {
    return this.enabled && this.app.midi.prefs.inId === this.inputId && this.app.midi.access.inputReady && !!this.output();
  }
  async enable(input: string | null = this.inputId, output: string | null = this.outputId): Promise<boolean> {
    if (this.enabled) this.disable();
    const state = await this.app.midi.enable(true);
    if (state !== 'ready' || !this.app.midi.access.access?.sysexEnabled) {
      this.message = 'Allow MIDI and SysEx access in your browser to select the Mk2 template and light its buttons.';
      this.changed(); return false;
    }
    const inputs = this.app.midi.inputs().filter((p) => p.connected), outputs = this.app.midi.outputs().filter((p) => p.connected);
    const ins = inputs.filter((p) => deviceName(p.name)), outs = outputs.filter((p) => deviceName(p.name));
    this.inputId = inputs.some((p) => p.id === input) ? input : ins.length === 1 ? ins[0]!.id : null;
    this.outputId = outputs.some((p) => p.id === output) ? output : outs.length === 1 ? outs[0]!.id : null;
    if (!this.inputId || !this.outputId) {
      this.message = 'Select the Mk2 input and output, then enable the profile.';
      this.changed(); return false;
    }
    this.app.midiLearn.cancel();
    this.enabled = true;
    this.app.midi.reserveOutput(this.outputId);
    this.app.midi.selectInput(this.inputId);
    try { localStorage.setItem(KEY, JSON.stringify({ input: this.inputId, output: this.outputId })); } catch { /* Session still works. */ }
    this.activateTemplate();
    return this.enabled && this.templateReady;
  }
  activateTemplate(): void {
    if (!this.connected) return;
    if (!this.send(selectLcxlTemplate())) return;
    // Display/update buffer 0, copy, no hardware flashing; the audio clock drives our playhead.
    if (!this.send([0xb8, 0, 48])) return;
    this.templateReady = true;
    this.surface.release(); this.leds.clear();
    this.message = 'Factory Template 1 · Up/Down: track · Left/Right: step page';
    this.changed(); this.frame();
  }
  disable(): void {
    if (this.enabled) this.send(lcxlLeds([...Array.from({ length: 16 }, (_, i): [number, number] => [24 + i, LCXL_OFF]), ...[44, 45, 46, 47].map((i): [number, number] => [i, LCXL_OFF])]));
    this.enabled = false; this.templateReady = false; this.wasConnected = false;
    this.app.midi.reserveOutput(null);
    this.surface.release(); this.leds.clear();
    this.message = 'Mk2 sequencer profile disabled.'; this.changed();
  }
  private send(bytes: number[]): boolean {
    const port = this.output();
    if (!port) return false;
    try { port.send(bytes); return true; }
    catch {
      this.templateReady = false;
      this.message = 'Could not send Mk2 LED feedback. Check the output and re-enable the profile.';
      this.changed(); return false;
    }
  }
  private receive(data: Uint8Array, device: string | null): boolean {
    if (!this.enabled || device !== this.inputId) return false;
    const template = lcxlTemplate(data);
    if (template !== null) {
      this.templateReady = template === LCXL_TEMPLATE;
      this.surface.release(); this.leds.clear();
      this.message = this.templateReady ? 'Factory Template 1 active' : 'Another template is selected. Return to Factory 1 to use the sequencer.';
      this.changed(); return true;
    }
    // While disconnected or on another template, controller buttons must never become drum notes.
    if (!this.connected || !this.templateReady) return (data[0]! & 0xf0) === 0x90 || (data[0]! & 0xf0) === 0x80 || (data[0]! & 0xf0) === 0xb0;
    const consumed = this.surface.receive(data);
    if (consumed) { this.leds.clear(); this.frame(); }
    return consumed;
  }
  /** Called from CLATTER's animation frame, using its audible playhead, not a separate clock. */
  frame(): void {
    if (!this.enabled || this.sending) return;
    this.sending = true;
    try {
      const port = this.output(), connected = this.connected;
      if (!connected) {
        if (this.wasConnected) {
          // Clear the still-connected output if the input disappears or is changed.
          this.send(lcxlLeds([...Array.from({ length: 16 }, (_, i): [number, number] => [24 + i, LCXL_OFF]), ...[44, 45, 46, 47].map((i): [number, number] => [i, LCXL_OFF])]));
          this.message = 'Mk2 input or output disconnected. Reconnect it, or re-enable with the selected ports.';
          this.surface.release(); this.leds.clear(); this.changed();
        }
        this.wasConnected = false; return;
      }
      if (!this.wasConnected || port !== this.previousOutput) {
        this.wasConnected = true; this.previousOutput = port;
        this.activateTemplate();
      }
      if (!this.templateReady) return;
      const values = this.surface.leds();
      const changed = values.filter(([i, value]) => this.leds.get(i) !== value);
      if (changed.length && this.send(lcxlLeds(changed))) for (const [i, value] of changed) this.leds.set(i, value);
      const s = this.surface.state();
      const view = `${s.track}:${s.trackName}:${s.pattern}:${s.steps}:${this.surface.page}:${this.surface.follow}`;
      if (view !== this.lastView) { this.lastView = view; this.changed(); }
    } finally { this.sending = false; }
  }
}
