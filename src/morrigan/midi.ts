import type { App } from '../app/app';
import { configureEngine } from '../app/soundConfig';
import { MidiController, defaultMidiPrefs } from '../midi/controller';

/** MIDI note numbers are unambiguous; octave names vary between controller manufacturers. */
export const MIDI_DRUMS = [
  { label: 'Drum 1', note: 36, voice: 0, trigger: 0 },
  { label: 'Drum 2', note: 45, voice: 1, trigger: 1 },
  { label: 'Drum 3', note: 50, voice: 2, trigger: 2 },
  { label: 'Snare', note: 38, voice: 3, trigger: 3 },
  { label: 'Cymbal', note: 49, voice: 4, trigger: 4 },
  { label: 'Closed hat', note: 42, voice: 5, trigger: 5 },
  { label: 'Open hat', note: 46, voice: 5, trigger: 6 },
] as const;

/** Reuse CLATTER's device discovery, hotplug, channel filtering and clock follower.
 * MORRIGAN has its own fixed voice map and never opens a MIDI output or records into the grid.
 */
export class InstrumentMidi {
  readonly controller: MidiController;
  error = '';
  constructor(private app: App) {
    this.controller = new MidiController({
      note: (_channel, note, velocity) => this.note(note, velocity),
      tempo: bpm => app.setTempo(bpm, false),
      transport: message => { if (message === 'stop') app.stop(); else void app.play(); },
      changed: () => {},
      message: () => {},
    }, { ...defaultMidiPrefs(), notesOut: false, clockOut: false });
  }

  /** Called from a click: both browser MIDI permission and audio activation require consent. */
  async enable(): Promise<void> {
    this.error = '';
    const audio = this.app.host.start();
    const midi = this.controller.enable();
    const [sound, access] = await Promise.allSettled([audio, midi]);
    if (sound.status === 'rejected') {
      this.error = `Audio could not start: ${String(sound.reason)}`;
      return;
    }
    configureEngine(this.app.live, this.app.project, this.app.library);
    if (access.status === 'rejected') { this.error = String(access.reason); return; }
    if (access.value === 'ready' && !this.controller.prefs.inId) {
      const ports = this.controller.inputs().filter(p => p.connected);
      if (ports.length === 1) this.controller.selectInput(ports[0]!.id);
    }
  }

  note(note: number, velocity: number): void {
    const drum = MIDI_DRUMS.find(d => d.note === note);
    if (!drum || !Number.isInteger(velocity) || velocity < 1 || velocity > 127 || this.app.host.state !== 'running') return;
    this.app.host.send({ type: 'hits', hits: [{ time: this.app.host.now, track: drum.voice, trig: drum.trigger, vel: velocity, pitch: 0 }] });
  }

  setChannel(channel: number): void {
    if (Number.isInteger(channel) && channel >= 0 && channel <= 16) this.controller.prefs.inChannel = channel;
  }
  setClock(enabled: boolean): void {
    this.controller.prefs.clockIn = enabled;
    if (enabled && this.controller.follower.bpm >= 30) this.app.setTempo(this.controller.follower.bpm, false);
  }
  disconnect(): void {
    this.controller.selectInput(null);
    this.controller.prefs.clockIn = false;
  }
}
