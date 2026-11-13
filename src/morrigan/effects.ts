/** MORRIGAN effects policy. These controls edit live mixer state, not synthesis locks. */
import type { App } from '../app/app';
import { defaultChannelFx, defaultOutputFx, type OutputFx } from '../audio/mixfx';
import { PAR } from '../sound/lxrParamIds';

export type InsertType = 'off' | 'saturation' | 'crush' | 'transient';
export interface InsertState { type: InsertType; a: number; b: number }
const unit = (v: number) => Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
const voiceTrack = (app: App, voice: number) => Number.isInteger(voice) && voice >= 0 && voice < 6 ? app.project.tracks[voice] : undefined;
const output = (app: App): OutputFx => structuredClone(app.project.master.out ?? defaultOutputFx());

/** Call once after fresh MORRIGAN boot; original CLATTER defaults are untouched. */
export function configureEffects(app: App): void {
  app.beginDrag('INITIAL EFFECTS');
  try {
    app.setParam(PAR.FX_TYPE, 4);
    app.setParam(PAR.FX_DRY_WET, 100);
    app.setParam(PAR.FX_P1, 48);
    app.setParam(PAR.FX_P2, 0);
    app.setParam(PAR.FX_P3, 90);
    app.setParam(PAR.FX_P4, 45);
    const out = output(app);
    out.reverb = { on: true, room: 0.55, damping: 0.45 };
    app.setMaster({ out });
    for (const t of app.project.tracks) app.setTrackMix(t.id, { route: 'main', send: 0, reverbSend: 0 });
  } finally { app.endDrag(); }
  app.history.clear();
}
export function setDelaySend(app: App, voice: number, value: number): void {
  const t = voiceTrack(app, voice);
  if (t) app.setTrackMix(t.id, { send: unit(value) }, 'DELAY SEND');
}
export function setReverbSend(app: App, voice: number, value: number): void {
  const t = voiceTrack(app, voice);
  if (t) app.setTrackMix(t.id, { reverbSend: unit(value) }, 'REVERB SEND');
}
export function setDelay(app: App, config: { time?: number; feedback?: number }): void {
  app.beginDrag('DELAY');
  try {
    if (config.time !== undefined) app.setParam(PAR.FX_P1, Math.round(unit(config.time / 127) * 127));
    // Keep feedback away from maximum regeneration in the initial jam surface.
    if (config.feedback !== undefined) app.setParam(PAR.FX_P4, Math.min(110, Math.round(unit(config.feedback / 127) * 127)));
  } finally { app.endDrag(); }
}
export function setReverb(app: App, config: { room?: number; damping?: number }): void {
  const out = output(app);
  out.reverb = { on: true, room: out.reverb?.room ?? 0.55, damping: out.reverb?.damping ?? 0.45 };
  if (config.room !== undefined) out.reverb.room = unit(config.room);
  if (config.damping !== undefined) out.reverb.damping = unit(config.damping);
  app.setMaster({ out }, 'REVERB');
}
export function setInsert(app: App, voice: number, type: InsertType, a: number, b: number): void {
  const t = voiceTrack(app, voice);
  if (!t) return;
  const fx = defaultChannelFx();
  a = unit(a); b = unit(b);
  if (type === 'saturation') fx.sat = { on: true, drive: a, mix: b };
  if (type === 'crush') fx.crush = { on: true, bits: Math.round(16 - a * 14), rate: b };
  if (type === 'transient') fx.trans = { on: true, attack: a * 2 - 1, sustain: b * 2 - 1 };
  app.setTrackMix(t.id, { fx }, 'VOICE INSERT');
}
export function getInsert(app: App, voice: number): InsertState {
  const f = voiceTrack(app, voice)?.mix.fx;
  if (f?.sat.on) return { type: 'saturation', a: f.sat.drive, b: f.sat.mix };
  if (f?.crush.on) return { type: 'crush', a: (16 - f.crush.bits) / 14, b: f.crush.rate };
  if (f?.trans.on) return { type: 'transient', a: (f.trans.attack + 1) / 2, b: (f.trans.sustain + 1) / 2 };
  return { type: 'off', a: 0.5, b: 0.5 };
}

/** Stop transport, fade voices and discard both effect tails. A later hit resumes sends. */
export function silence(app: App): void {
  app.stop();
  app.host.send({ type: 'panic', clearEffects: true });
  app.midi.panic();
  app.say('SILENCED');
}
