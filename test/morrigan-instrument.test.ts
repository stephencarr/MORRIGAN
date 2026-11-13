import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { KitManager } from '../src/app/kitManager';
import { Instrument, createInstrumentProject } from '../src/morrigan/instrument';
import { readKit } from '../src/sound/kitcheck';
import { lxrModule, newLxr, stats } from './helpers';
import { PAR } from '../src/sound/lxrParams';
import { newEngine, renderHit, renderProject } from '../src/audio/render';
import { resolveStepSound } from '../src/sound/stepSound';

function setup() {
  const inst = new Instrument();
  inst.app.project = createInstrumentProject(readKit(newLxr()));
  inst.selectVoice(0);
  return inst;
}

describe('MORRIGAN instrument', () => {
  it('starts with six fixed audible synth voices and an empty 16-step pattern', async () => {
    const i = setup();
    expect(i.project.tracks.map(t => t.sound.trigger)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(i.app.pattern.steps).toBe(16);
    expect(i.project.tracks.every(t => t.sound.mode === 'synth' && t.sound.samples.length === 0)).toBe(true);
    for (const t of i.project.tracks) {
      expect(i.app.pattern.grids[t.id]!.filter(Boolean)).toHaveLength(0);
      const hit = await renderHit(lxrModule(), i.project, null, t.id, 110, 0.3);
      expect(stats(hit[0]!).peak).toBeGreaterThan(0.001);
    }
  });

  it('edits six independent patterns and velocity without modifying voice volume', () => {
    const i = setup();
    const vol = i.value(0, PAR.VOL1);
    i.toggleStep(0);
    i.setVelocity(0, 30);
    i.selectVoice(1);
    i.toggleStep(3);
    expect(i.app.hitAt('voice-0', 0)?.vel).toBe(30);
    expect(i.app.hitAt('voice-1', 0)).toBeNull();
    expect(i.app.hitAt('voice-1', 3)).not.toBeNull();
    expect(i.value(0, PAR.VOL1)).toBe(vol);
  });

  it('targets held steps explicitly, preserves base values and rejects foreign parameters', () => {
    const i = setup();
    const base = i.value(0, PAR.VELOD1);
    i.app.ui.picks = [{ track: 'voice-1', step: 8 }, { track: 'voice-2', step: 9 }];
    i.holdStep(2);
    i.setValue(0, PAR.VELOD1, 12);
    expect(i.app.hitAt('voice-0', 2)).toBeNull();
    expect(i.value(0, PAR.VELOD1)).toBe(12);
    expect(i.project.kit.synth.params[PAR.VELOD1]).toBe(base);
    i.setValue(0, PAR.VELOD2, 77);
    expect(i.app.stepSound('voice-0', 2)?.locks?.[PAR.VELOD2]).toBeUndefined();
    i.setValue(1, PAR.VELOD2, 42);
    expect(i.project.kit.synth.params[PAR.VELOD2]).toBe(42);
    expect(i.app.stepSound('voice-1', 8)).toBeUndefined();
    i.clearLock(0, PAR.VELOD1);
    expect(i.value(0, PAR.VELOD1)).toBe(base);
    expect(i.app.stepSound('voice-0', 2)).toBeUndefined();
  });

  it('uses a shared hat voice with independent open/closed step articulation', () => {
    const i = setup();
    i.selectVoice(5);
    i.toggleStep(0);
    i.toggleStep(2);
    i.setHatOpen(0, true);
    const resolve = (s: number) => resolveStepSound(i.track.sound, i.app.stepSound(i.track.id, s), p => i.project.kit.synth.params[p] ?? 0, { seed: 1, cycle: 0, fill: false, track: i.track.id, step: s });
    expect(resolve(0).trig).toBe(6);
    expect(resolve(2).trig).toBe(5);
    i.setHatOpen(0, false);
    expect(resolve(0).trig).toBe(5);
  });

  it('restores the latest base value on the next unlocked hit in the real engine', async () => {
    const i = setup();
    i.holdStep(0);
    i.setValue(0, PAR.VELOD1, 8);
    i.releaseStep();
    const e = await newEngine(lxrModule(), i.project, null);
    const sp = resolveStepSound(i.track.sound, i.app.stepSound(i.track.id, 0), p => i.project.kit.synth.params[p] ?? 0, { seed: 1, cycle: 0, fill: false, track: i.track.id, step: 0 }).params;
    const l = new Float32Array(64), r = new Float32Array(64);
    e.schedule({ frame: 0, track: 0, vel: 100, pitch: 0, sp });
    e.renderBlock(l, r);
    e.setParam(PAR.VELOD1, 95);
    expect(e.lxr.getParam(PAR.VELOD1)).toBe(8);
    e.schedule({ frame: 64, track: 0, vel: 100, pitch: 0 });
    e.renderBlock(l, r);
    expect(e.lxr.getParam(PAR.VELOD1)).toBe(95);
  });

  it('groups a held-step encoder gesture into one undo and prevents session persistence', () => {
    const i = setup();
    i.holdStep(1);
    i.app.beginDrag('ENCODER');
    i.setValue(0, PAR.VELOD1, 10);
    i.setValue(0, PAR.VELOD1, 20);
    i.app.endDrag();
    i.app.history.undo();
    expect(i.app.stepSound('voice-0', 1)).toBeUndefined();
    expect(i.app.history.canUndo).toBe(false);
    const storage = { setItem: vi.fn(), getItem: vi.fn() };
    vi.stubGlobal('localStorage', storage);
    try { i.app.saveNow(); expect(storage.setItem).not.toHaveBeenCalled(); }
    finally { vi.unstubAllGlobals(); }
  });

  it('does not turn empty steps into triggers when editing velocity or articulation', () => {
    const i = setup();
    i.setVelocity(0, 80);
    expect(i.app.hitAt('voice-0', 0)).toBeNull();
    i.selectVoice(5);
    i.holdStep(2);
    i.setHatOpen(2, true);
    i.setVelocity(2, 40);
    i.setValue(5, PAR.VELOD6_OPEN, 80);
    expect(i.app.hitAt('voice-5', 2)).toBeNull();
    i.toggleStep(2);
    expect(i.app.stepSound('voice-5', 2)?.voice).toBe(6);
    expect(i.app.stepSound('voice-5', 2)?.locks?.[PAR.VELOD6_OPEN]).toBe(80);
    i.setHatOpen(2, false);
    // Closed/open is an articulation change within the same parameter-owning voice.
    expect(i.app.stepSound('voice-5', 2)?.locks?.[PAR.VELOD6_OPEN]).toBe(80);
    i.toggleStep(2);
    expect(i.app.stepSound('voice-5', 2)).toBeUndefined();
  });

  it('releases a held step when changing voice and respects menu parameter ranges', () => {
    const i = setup();
    i.holdStep(1);
    i.selectVoice(1);
    expect(i.heldStep).toBeNull();
    i.setValue(1, PAR.OSC_WAVE_DRUM2, 127);
    expect(i.project.kit.synth.params[PAR.OSC_WAVE_DRUM2]).toBe(5);
    expect(i.app.stepSound('voice-1', 1)).toBeUndefined();
  });

  it('boots the real engine without restoring musical or sample-library sessions', async () => {
    const i = new Instrument();
    const bundled = vi.spyOn(i.app.library, 'loadBundled');
    const restored = vi.spyOn(i.app.library, 'restore');
    const manager = vi.spyOn(KitManager, 'create');
    const wasm = readFileSync(new URL('../src/audio/lxr/lxr.wasm', import.meta.url));
    const fetcher = vi.fn(async () => new Response(wasm));
    const storage = { getItem: vi.fn(), setItem: vi.fn() };
    vi.stubGlobal('fetch', fetcher);
    vi.stubGlobal('localStorage', storage);
    try {
      await i.boot();
      expect(i.app.module).toBeInstanceOf(WebAssembly.Module);
      expect(i.project.tracks).toHaveLength(6);
      expect(bundled).not.toHaveBeenCalled();
      expect(restored).not.toHaveBeenCalled();
      expect(manager).not.toHaveBeenCalled();
      expect(storage.getItem).not.toHaveBeenCalledWith('clatter.project');
      i.app.saveNow();
      expect(storage.setItem).not.toHaveBeenCalledWith('clatter.project', expect.anything());
    } finally {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    }
  });

  it('renders entered steps through the real scheduler and engine', async () => {
    const i = setup();
    i.toggleStep(0);
    i.selectVoice(3);
    i.toggleStep(4);
    const audio = await renderProject(lxrModule(), i.project, null, { bars: 1, tail: 0.2, stems: true });
    expect(stats(audio.master[0]!).peak).toBeGreaterThan(0.01);
    expect(stats(audio.stems['voice-0']![0]!).peak).toBeGreaterThan(0.01);
    expect(stats(audio.stems['voice-3']![0]!.subarray(22050, 33075)).peak).toBeGreaterThan(0.01);
    expect(stats(audio.stems['voice-1']![0]!).peak).toBe(0);
  });
});
