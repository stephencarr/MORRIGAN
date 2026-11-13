import { describe, expect, it } from 'vitest';
import { ClatterEngine, BLOCK, silentTrack } from '../src/audio/engine';
import { defaultOutputFx, legacyOutputFx, repairOutputFx } from '../src/audio/mixfx';
import { ReverbProcessor } from '../src/audio/reverb';
import { engineTrackOf } from '../src/app/soundConfig';
import { defaultProject } from '../src/model/defaults';
import { parseProject, serialize } from '../src/model/project';
import { PAR } from '../src/sound/lxrParamIds';
import { newLxr, stats, lxrModule } from './helpers';
import { readKit } from '../src/sound/kitcheck';
import { renderProject, newEngine } from '../src/audio/render';
import { createInstrumentProject } from '../src/morrigan/instrument';
import type { App } from '../src/app/app';
import type { TrackMix } from '../src/model/types';
import { getInsert, setInsert } from '../src/morrigan/effects';

function engine(send = 0, reverbSend = 0, enabled = true) {
  const e = new ClatterEngine(newLxr(21), 2, 21);
  const sample = new Float32Array(1000);
  for (let i = 0; i < sample.length; i++) sample[i] = Math.sin(i * 0.17) * Math.exp(-i / 120);
  e.setSample('impulse', { rate: 44100, channels: [sample] });
  e.setTrack(0, { ...silentTrack(), mode: 'sample', samples: ['impulse'], send, reverbSend });
  e.setTrack(1, { ...silentTrack(), mode: 'sample', samples: ['impulse'] });
  e.setParam(PAR.FX_TYPE, 4);
  e.setParam(PAR.FX_DRY_WET, 100);
  e.setParam(PAR.FX_P1, 45);
  e.setParam(PAR.FX_P2, 0);
  e.setParam(PAR.FX_P3, 100);
  e.setParam(PAR.FX_P4, 45);
  const out = legacyOutputFx();
  if (enabled) out.reverb = { on: true, room: 0.7, damping: 0.4 };
  e.setOutput(out);
  e.setMaster(0.8, false);
  return e;
}
function render(e: ClatterEngine, track = 0, blocks = 1800) {
  const l = new Float32Array(BLOCK), r = new Float32Array(BLOCK);
  const master = new Float32Array(blocks * BLOCK);
  const dry = new Float32Array(blocks * BLOCK);
  const effects = new Float32Array(blocks * BLOCK);
  let at = 0;
  e.stemSink = (ti, x) => { if (ti === track) dry.set(x, at); };
  e.fxSink = x => effects.set(x, at);
  e.schedule({ frame: 0, track, vel: 127, pitch: 0 });
  for (let b = 0; b < blocks; b++) { at = b * BLOCK; e.renderBlock(l, r); master.set(l, at); }
  return { master, dry, effects };
}
const energy = (x: Float32Array, from = 0) => stats(x.subarray(from)).rms;

describe('MORRIGAN independent sends', () => {
  it('preserves legacy dry audio bit-for-bit when both sends are zero', () => {
    expect(render(engine()).master).toEqual(render(engine(0, 0, false)).master);
  });
  it('reverb leaves the dry channel untouched and produces a wet-only tail', () => {
    const dry = render(engine());
    const wet = render(engine(0, 0.8));
    expect(wet.dry).toEqual(dry.dry);
    expect(Array.from(wet.effects.subarray(0, 1000)).every(v => v === 0)).toBe(true);
    expect(energy(wet.effects, 10000)).toBeGreaterThan(0.000001);
    expect(stats(wet.master).finite).toBe(true);
  });
  it('a send on a silent track does not affect a different voice', () => {
    expect(render(engine(1, 1), 1).master).toEqual(render(engine(), 1).master);
  });
  it('delay and reverb work independently and combine without feeding one another', () => {
    const d = render(engine(0.5, 0));
    const r = render(engine(0, 0.7));
    const both = render(engine(0.5, 0.7));
    expect(energy(d.effects)).toBeGreaterThan(0.00001);
    expect(energy(r.effects)).toBeGreaterThan(0.00001);
    let err = 0;
    for (let i = 0; i < both.effects.length; i++) err = Math.max(err, Math.abs(both.effects[i]! - d.effects[i]! - r.effects[i]!));
    expect(err).toBeLessThan(0.000001);
    // The combined effects stem sums with dry audio to the pre-master mix.
    let sumErr = 0;
    for (let i = 0; i < both.master.length; i++) sumErr = Math.max(sumErr, Math.abs(both.master[i]! - both.dry[i]! - both.effects[i]!));
    expect(sumErr).toBeLessThan(0.000001);
  });
  it('muted tracks feed neither effect', () => {
    const e = engine(1, 1);
    e.setTrack(0, { audible: false });
    expect(stats(render(e).master).peak).toBe(0);
  });
  it('retains the optional send/config in project serialization and engine configuration', () => {
    const p = defaultProject();
    p.tracks[0]!.mix.reverbSend = 0.7;
    p.master.out = { ...defaultOutputFx(), reverb: { on: true, room: 0.8, damping: 0.2 } };
    const loaded = parseProject(serialize(p));
    expect(loaded.tracks[0]!.mix.reverbSend).toBe(0.7);
    expect(engineTrackOf(loaded.tracks[0]!, false).reverbSend).toBe(0.7);
    expect(loaded.master.out?.reverb).toEqual(p.master.out.reverb);
    expect(repairOutputFx({ reverb: { on: true, room: 100, damping: -3 } })?.reverb).toEqual({ on: true, room: 1, damping: 0 });
    expect(legacyOutputFx().reverb).toBeUndefined();
  });
});

describe('reverb stability and bypass', () => {
  it('is stable at maximum room and stops its tail when bypassed', () => {
    const p = new ReverbProcessor();
    p.set({ on: true, room: 1, damping: 0 });
    const l = new Float32Array(64), r = new Float32Array(64);
    let peak = 0, early = 0, late = 0;
    let finite = true;
    for (let b = 0; b < 15000; b++) {
      l.fill(0); r.fill(0);
      if (b === 0) l[0] = r[0] = 1;
      p.process(l, r, 64);
      for (const v of l) { finite = finite && Number.isFinite(v); peak = Math.max(peak, Math.abs(v)); if (b < 1000) early += v * v; if (b > 14000) late += v * v; }
    }
    expect(finite).toBe(true);
    expect(peak).toBeLessThan(1);
    expect(early).toBeGreaterThan(0);
    expect(late).toBeLessThan(early * 0.0001);
    p.set({ on: false, room: 1, damping: 0 });
    l.fill(1); r.fill(1); p.process(l, r, 64);
    expect(stats(l).peak).toBe(0);
    p.set({ on: true, room: 1, damping: 0 });
    l.fill(0); r.fill(0); p.process(l, r, 64);
    expect(stats(l).peak).toBe(0);
  });
});


describe('restricted inserts', () => {
  it('selects exactly one channel algorithm and bypass returns the unchanged signal', () => {
    const project = defaultProject();
    const app = { project, setTrackMix: (id: string, mix: Partial<TrackMix>) => Object.assign(project.tracks.find(t => t.id === id)!.mix, mix) } as unknown as App;
    const baseline = render(engine()).master;
    for (const type of ['saturation', 'crush', 'transient'] as const) {
      setInsert(app, 0, type, 0.8, 0.7);
      const fx = project.tracks[0]!.mix.fx!;
      expect(Object.values(fx).filter(stage => stage.on)).toHaveLength(1);
      expect(getInsert(app, 0).type).toBe(type);
      const e = engine(); e.setTrack(0, { fx });
      expect(render(e).master).not.toEqual(baseline);
    }
    setInsert(app, 0, 'off', 0, 0);
    const e = engine(); e.setTrack(0, { fx: project.tracks[0]!.mix.fx });
    expect(render(e).master).toEqual(baseline);
    expect(project.tracks[1]!.mix.fx).toBeUndefined();
  });
});


describe('effects transitions and full instrument', () => {
  it('stop preserves tails, explicit silence clears them without fading voices re-seeding effects', () => {
    const e = engine(1, 1);
    // Long input ensures voices are still active when silence arrives.
    e.setSample('impulse', { rate: 44100, channels: [new Float32Array(44100).fill(0.3)] });
    const l = new Float32Array(BLOCK), r = new Float32Array(BLOCK);
    e.schedule({ frame: 0, track: 0, vel: 127, pitch: 0 });
    for (let b = 0; b < 200; b++) e.renderBlock(l, r);
    e.cancelFrom(e.frame); // ordinary transport stop
    let tail = 0;
    e.fxSink = x => { tail += stats(x).rms; };
    e.renderBlock(l, r);
    expect(tail).toBeGreaterThan(0);
    e.panic(true);
    let post = 0;
    e.fxSink = x => { post = Math.max(post, stats(x).peak); };
    for (let b = 0; b < 1200; b++) {
      e.renderBlock(l, r);
      if (b > 4) expect(stats(l).peak).toBe(0);
    }
    expect(post).toBe(0);
    e.schedule({ frame: e.frame, track: 0, vel: 127, pitch: 0 });
    for (let b = 0; b < 100; b++) e.renderBlock(l, r);
    expect(post).toBeGreaterThan(0); // audition/play resumes sends
  });

  it('switching reverb off and on clears its old tail while delay remains continuous', () => {
    const e = engine(0.7, 1);
    const reference = engine(0.7, 0);
    const l = new Float32Array(BLOCK), r = new Float32Array(BLOCK);
    const rl = new Float32Array(BLOCK), rr = new Float32Array(BLOCK);
    for (const x of [e, reference]) x.schedule({ frame: 0, track: 0, vel: 127, pitch: 0 });
    for (let b = 0; b < 200; b++) { e.renderBlock(l, r); reference.renderBlock(rl, rr); }
    e.setOutput(legacyOutputFx());
    for (let b = 0; b < 100; b++) { e.renderBlock(l, r); reference.renderBlock(rl, rr); expect(l).toEqual(rl); }
    e.setOutput({ ...legacyOutputFx(), reverb: { on: true, room: 0.7, damping: 0.4 } });
    for (let b = 0; b < 100; b++) { e.renderBlock(l, r); reference.renderBlock(rl, rr); expect(l).toEqual(rl); }
  });

  it('exports both effect returns in the effects stem and is deterministic', async () => {
    const p = createInstrumentProject(readKit(newLxr()));
    p.master = { volume: 0.8, clip: false, chain: null, out: { ...legacyOutputFx(), reverb: { on: true, room: 0.7, damping: 0.4 } } };
    p.kit.synth.params[PAR.FX_TYPE] = 4;
    p.kit.synth.params[PAR.FX_DRY_WET] = 100;
    p.kit.synth.params[PAR.FX_P1] = 45;
    p.kit.synth.params[PAR.FX_P4] = 45;
    for (const t of p.tracks) { t.mix.send = 0.7; t.mix.reverbSend = 0.7; p.patterns[0]!.grids[t.id]![0] = { vel: 127 }; }
    const a = await renderProject(lxrModule(), p, null, { bars: 1, tail: 1, stems: true });
    const b = await renderProject(lxrModule(), p, null, { bars: 1, tail: 1 });
    expect(a.master).toEqual(b.master);
    expect(stats(a.fx![0]!).rms).toBeGreaterThan(0.00001);
    let error = 0;
    for (let i = 0; i < a.frames; i++) {
      let sum = a.fx![0]![i]!;
      for (const stem of Object.values(a.stems)) sum += stem[0]![i]!;
      error = Math.max(error, Math.abs(sum - a.master[0]![i]!));
    }
    expect(error).toBeLessThan(0.00001);
  });

  it('keeps six simultaneous real synth voices with maximum sends and inserts finite and limited', async () => {
    const p = createInstrumentProject(readKit(newLxr()));
    const app = { project: p, setTrackMix: (id: string, mix: Partial<TrackMix>) => Object.assign(p.tracks.find(t => t.id === id)!.mix, mix) } as unknown as App;
    const types = ['saturation', 'crush', 'transient'] as const;
    p.master.out = { ...defaultOutputFx(), reverb: { on: true, room: 1, damping: 0 } };
    p.master.volume = 1;
    p.kit.synth.params[PAR.FX_TYPE] = 4;
    p.kit.synth.params[PAR.FX_DRY_WET] = 100;
    p.kit.synth.params[PAR.FX_P1] = 45;
    p.kit.synth.params[PAR.FX_P4] = 110;
    for (let v = 0; v < 6; v++) { setInsert(app, v, types[v % 3]!, 1, 1); p.tracks[v]!.mix.send = p.tracks[v]!.mix.reverbSend = 1; }
    const e = await newEngine(lxrModule(), p, null);
    const l = new Float32Array(BLOCK), r = new Float32Array(BLOCK);
    let peak = 0, finite = true;
    for (let block = 0; block < 7000; block++) {
      if (block % 43 === 0) for (let voice = 0; voice < 6; voice++) e.schedule({ frame: e.frame, track: voice, vel: 127, pitch: 0 });
      e.renderBlock(l, r);
      for (let i = 0; i < BLOCK; i++) { finite = finite && Number.isFinite(l[i]) && Number.isFinite(r[i]); peak = Math.max(peak, Math.abs(l[i]!), Math.abs(r[i]!)); }
    }
    expect(finite).toBe(true);
    expect(peak).toBeGreaterThan(0.1);
    expect(peak).toBeLessThanOrEqual(Math.pow(10, -0.3 / 20) + 0.000001);
  });
});
