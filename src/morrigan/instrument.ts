/** MORRIGAN's fixed six-voice instrument. The adapter owns gestures; CLATTER owns sound and time. */
import { App } from '../app/app';
import { defaultMix, defaultPlay, defaultProject, defaultSound } from '../model/defaults';
import { clone, type Project, type Role, type SynthKit, type Track } from '../model/types';
import { PAR, VOICES, voiceOfParam } from '../sound/lxrParams';
import { lockableParam } from '../sound/stepSound';
import { InstrumentMidi } from './midi';

const ROLES: Role[] = ['kick', 'ltom', 'htom', 'snare', 'cymbal', 'chat'];

/** A new jam never inherits workstation samples, automation, variations or session state. */
export function createInstrumentProject(init: SynthKit): Project {
  const p = defaultProject();
  p.name = 'MORRIGAN';
  p.kit.synth = clone(init);
  p.kit.name = 'INIT';
  p.tempo = 120;
  p.tracks = VOICES.map((name, v): Track => ({
    id: `voice-${v}`, name, role: ROLES[v]!,
    sound: defaultSound({ trigger: v, mode: 'synth', note: 60 }),
    mix: defaultMix({ volume: 0.8, route: 'main' }),
    play: defaultPlay(), midi: { channel: 10, note: [36, 45, 50, 38, 49, 42][v]! }, lock: false,
  }));
  for (let v = 0; v < 6; v++) {
    p.kit.synth.params[PAR.VOLUME_MOD_ON_OFF1 + v] = 1;
    p.kit.synth.params[PAR.AMOUNT_LFO1 + v] = 0;
    p.kit.synth.params[PAR.VELO_MOD_AMT_1 + v] = 0;
  }
  p.kit.synth.lfoTarget.fill(0);
  p.kit.synth.velTarget.fill(0);
  p.kit.synth.params[PAR.FX_TYPE] = 0;
  const pattern = p.patterns[0]!;
  pattern.steps = 16;
  pattern.res = 4;
  pattern.grids = Object.fromEntries(p.tracks.map(t => [t.id, Array(16).fill(null)]));
  delete pattern.sounds;
  delete pattern.trig;
  p.patterns = [pattern];
  p.current = pattern.id;
  return p;
}

const isVoice = (v: number) => Number.isInteger(v) && v >= 0 && v < 6;
const isStep = (s: number) => Number.isInteger(s) && s >= 0 && s < 16;

export class Instrument {
  readonly app: App;
  readonly midi: InstrumentMidi;
  selectedVoice = 0;
  heldStep: number | null = null;

  constructor(app = new App({ trackCount: 6, session: false })) { this.app = app; this.midi = new InstrumentMidi(app); }
  get project(): Project { return this.app.project; }
  get track(): Track { return this.project.tracks[this.selectedVoice]!; }

  async boot(base = './'): Promise<void> {
    await this.app.boot(base, { project: createInstrumentProject, bundledSamples: false });
    this.selectVoice(0);
  }

  selectVoice(voice: number): void {
    if (!isVoice(voice)) return;
    // A held step belongs to the voice where the gesture began.
    if (voice !== this.selectedVoice) this.releaseStep();
    this.selectedVoice = voice;
    this.app.selectTrack(this.track.id);
  }
  holdStep(step: number): void {
    if (!isStep(step)) return;
    this.heldStep = step;
    this.app.setCursor({ track: this.track.id, step });
  }
  releaseStep(): void { this.heldStep = null; this.app.emit(['selection']); }
  toggleStep(step: number): void {
    if (isStep(step)) this.app.toggleCell(this.track.id, step);
  }
  setVelocity(step: number, value: number): void {
    if (isStep(step) && Number.isFinite(value)) this.app.setHitProps(this.track.id, step, { vel: Math.max(1, Math.min(127, Math.round(value))) }, 'STEP VELOCITY');
  }
  setHatOpen(step: number, open: boolean): void {
    if (this.selectedVoice !== 5 || !isStep(step)) return;
    this.app.editStepSound(s => {
      if (open) s.voice = 6;
      else delete s.voice;
      return s;
    }, 'HAT ARTICULATION', [{ track: this.track.id, step }]);
  }
  value(voice: number, param: number): number {
    if (this.heldStep !== null && voice === this.selectedVoice) {
      const lock = this.app.stepSound(this.track.id, this.heldStep)?.locks?.[param];
      if (lock !== undefined) return lock;
    }
    return this.project.kit.synth.params[param] ?? 0;
  }
  setValue(voice: number, param: number, value: number): void {
    if (!isVoice(voice) || !Number.isFinite(value) || voiceOfParam(param) !== voice) return;
    const def = lockableParam(voice, param);
    if (!def) return;
    const val = Math.max(0, Math.min(def.max, Math.round(value)));
    if (voice === this.selectedVoice && this.heldStep !== null) {
      this.app.editStepSound(s => { (s.locks ??= {})[param] = val; return s; }, 'STEP LOCK', [{ track: this.track.id, step: this.heldStep }]);
    } else this.app.setParam(param, val);
  }
  clearLock(voice: number, param: number): void {
    if (voice !== this.selectedVoice || this.heldStep === null || voiceOfParam(param) !== voice) return;
    this.app.editStepSound(s => {
      if (s.locks) { delete s.locks[param]; if (!Object.keys(s.locks).length) delete s.locks; }
      return s;
    }, 'CLEAR STEP LOCK', [{ track: this.track.id, step: this.heldStep }]);
  }
  audition(voice: number): Promise<void> {
    return isVoice(voice) ? this.app.audition(this.project.tracks[voice]!.id) : Promise.resolve();
  }
}
