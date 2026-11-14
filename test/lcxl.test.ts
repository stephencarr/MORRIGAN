import { describe, expect, it, vi } from 'vitest';
import { LCXL_STEPS, LcxlSurface, lcxlLeds, lcxlTemplate, selectLcxlTemplate, type LcxlState, type StepLight } from '../src/midi/lcxl';
import { stepLight } from '../src/midi/lcxlSession';
import { MidiController, defaultMidiPrefs } from '../src/midi/controller';
import { MidiAccess } from '../src/midi/webmidi';

function rig(steps = 32) {
  const state: LcxlState = { pattern: 'a', steps, track: 0, trackId: 'track-0', tracks: 6, trackName: 'DRUM 1', cells: Array<StepLight>(steps).fill('empty'), playhead: null };
  const toggle = vi.fn();
  let now = 0;
  const surface = new LcxlSurface({ state: () => state, selectTrack: (i) => { state.track = i; state.trackId = `track-${i}`; }, toggleStep: toggle }, () => now);
  const note = (n: number, v = 127, status = 0x98) => surface.receive(new Uint8Array([status, n, v]));
  const arrow = (n: number) => { surface.receive(new Uint8Array([0xb8, n, 127])); surface.receive(new Uint8Array([0xb8, n, 0])); };
  return { state, surface, toggle, note, arrow, advance: (ms: number) => { now += ms; } };
}

describe('LCXL Mk2 fixed profile', () => {
  it('encodes the documented factory template and indexed LED protocol', () => {
    expect(selectLcxlTemplate()).toEqual([240, 0, 32, 41, 2, 17, 119, 8, 247]);
    expect(lcxlLeds([[24, 60], [39, 15]])).toEqual([240, 0, 32, 41, 2, 17, 120, 8, 24, 60, 39, 15, 247]);
    expect(lcxlTemplate(new Uint8Array(selectLcxlTemplate()))).toBe(8);
    expect(lcxlTemplate(new Uint8Array([240, 0, 32, 41, 2, 17, 119, 16, 247]))).toBeNull();
    expect(lcxlTemplate(new Uint8Array([0x98, 41, 127]))).toBeNull();
  });
  it('maps the physical rows in order and toggles once on release, leaving press available for locks', () => {
    const r = rig();
    LCXL_STEPS.forEach((n, i) => {
      expect(r.note(n)).toBe(true); r.note(n); r.note(n, 0); r.note(n, 0, 0x88);
      expect(r.toggle).toHaveBeenLastCalledWith(i);
    });
    expect(r.toggle).toHaveBeenCalledTimes(16);
    r.note(41); expect(r.toggle).toHaveBeenCalledTimes(16);
    r.note(41, 0); expect(r.toggle).toHaveBeenCalledTimes(17);
    r.note(41, 127, 0x99); expect(r.toggle).toHaveBeenCalledTimes(17);
    expect(r.surface.receive(new Uint8Array([0xb8, 13, 60]))).toBe(false); // Knob → normal CC learn.
    expect(r.note(105)).toBe(true); expect(r.toggle).toHaveBeenCalledTimes(17);
  });
  it('bounds track navigation, supports every project track and reads mouse focus', () => {
    const r = rig(); r.arrow(104); expect(r.state.track).toBe(0);
    for (let i = 0; i < 10; i++) r.arrow(105);
    expect(r.state.track).toBe(5);
    r.state.track = 2; r.arrow(104); expect(r.state.track).toBe(1);
    r.state.tracks = 10; for (let i = 0; i < 12; i++) r.arrow(105);
    expect(r.state.track).toBe(9);
  });
  it('pages in 16s, disables follow on manual paging, ignores buttons past the end', () => {
    const r = rig(18); r.arrow(107); expect(r.surface.page).toBe(1); expect(r.surface.follow).toBe(false);
    for (const n of [41, 42, 43]) { r.note(n); r.note(n, 0); } expect(r.toggle.mock.calls).toEqual([[16], [17]]);
    r.arrow(107); expect(r.surface.page).toBe(1);
    r.state.steps = 8; r.surface.leds(); expect(r.surface.page).toBe(0);
    expect(r.surface.leds().slice(8, 16).every(([, value]) => value === 12)).toBe(true);
  });
  it('follows the audible playhead, restores step colours after stop and ignores other playing patterns', () => {
    const r = rig(); r.state.cells = ['hit', 'modified', 'locked', ...Array<StepLight>(29).fill('empty')];
    r.surface.follow = true;
    expect(r.surface.leds().slice(0, 4)).toEqual([[24, 28], [25, 29], [26, 13], [27, 12]]);
    r.state.playhead = { pattern: 'a', step: 2.4 }; expect(r.surface.leds()[2]).toEqual([26, 15]);
    r.state.playhead = { pattern: 'a', step: 3 }; expect(r.surface.leds()[3]).toEqual([27, 62]);
    r.state.playhead = { pattern: 'a', step: 17.1 }; expect(r.surface.leds()[1]).toEqual([25, 62]); expect(r.surface.page).toBe(1);
    r.surface.movePage(-1); r.surface.leds(); expect(r.surface.page).toBe(0);
    r.surface.follow = true; r.state.playhead = { pattern: 'other', step: 20 }; r.surface.leds(); expect(r.surface.page).toBe(0);
    r.state.playhead = null; expect(r.surface.leds()[2]).toEqual([26, 13]);
    r.surface.movePage(1); r.state.pattern = 'b'; r.surface.state(); expect(r.surface.page).toBe(0);
  });
  it('keeps the editing page fixed during playback unless follow is explicitly enabled', () => {
    const r = rig(64);
    expect(r.surface.follow).toBe(false);
    r.state.playhead = { pattern: 'a', step: 35 }; r.surface.leds();
    expect(r.surface.page).toBe(0);
    r.arrow(107); expect(r.surface.page).toBe(1);
    r.state.playhead.step = 50; r.surface.leds();
    expect(r.surface.page).toBe(1);
    r.note(41); r.note(41, 0); expect(r.toggle).toHaveBeenLastCalledWith(16);
    expect(r.surface.leds().slice(0, 16).every(([, colour]) => colour === 12)).toBe(true);
    r.state.playhead.step = 19; expect(r.surface.leds()[3]).toEqual([27, 62]);
    r.state.playhead = null; r.surface.leds(); expect(r.surface.page).toBe(1);
  });
  it('classifies musical modifiers and parameter locks without treating velocity as a modifier', () => {
    expect(stepLight(null, { locks: { 1: 30 } })).toBe('empty');
    expect(stepLight({ vel: 50 })).toBe('hit');
    for (const hit of [{ vel: 100, prob: 50 }, { vel: 100, ratchet: 2 }, { vel: 100, flam: true }, { vel: 100, note: -1 }]) expect(stepLight(hit)).toBe('modified');
    expect(stepLight({ vel: 100 }, { v: 0 })).toBe('modified');
    expect(stepLight({ vel: 100 }, undefined, { k: 'every', n: 2, at: 0 })).toBe('modified');
    expect(stepLight({ vel: 100 }, { locks: { 1: 0 } })).toBe('locked');
    expect(stepLight({ vel: 100 }, { locks: {} })).toBe('hit');
  });
  it('consumes controller buttons before note input/recording and reserves feedback output', () => {
    const note = vi.fn(), cc = vi.fn(), message = vi.fn();
    const midi = new MidiController({ note, cc, message, changed() {}, tempo() {}, transport() {} }, { ...defaultMidiPrefs(), inId: 'lcxl' });
    const r = rig(); midi.intercept((data, device) => device === 'lcxl' && r.surface.receive(data));
    const receive = (bytes: number[]) => (midi as unknown as { receive(d: Uint8Array, t: number): void }).receive(new Uint8Array(bytes), 0);
    receive([0x98, 41, 127]); expect(r.toggle).not.toHaveBeenCalled();
    receive([0x88, 41, 0]); expect(note).not.toHaveBeenCalled(); expect(r.toggle).toHaveBeenCalledOnce();
    receive([0xb8, 13, 25]); expect(cc).toHaveBeenCalledOnce();
    receive([0x90, 36, 100]); expect(note).toHaveBeenCalledWith(1, 36, 100);
    midi.reserveOutput('lcxl'); midi.selectOutput('lcxl'); expect(midi.prefs.outId).toBeNull(); expect(message).toHaveBeenCalledOnce();
    midi.reserveOutput(null); midi.selectOutput('lcxl'); expect(midi.prefs.outId).toBe('lcxl');
  });
  it('keeps ordinary MIDI working when a SysEx permission upgrade is refused', async () => {
    const access = { inputs: new Map(), outputs: new Map(), sysexEnabled: false, onstatechange: null };
    const request = vi.fn().mockResolvedValueOnce(access).mockRejectedValueOnce(new Error('denied'));
    vi.stubGlobal('navigator', { requestMIDIAccess: request });
    try {
      const m = new MidiAccess({ onPorts() {}, onInputLost() {}, onInputReturned() {}, onOutputLost() {}, onOutputReturned() {} });
      expect(await m.request()).toBe('ready'); expect(await m.request(true)).toBe('ready'); expect(m.access).toBe(access);
      expect(request).toHaveBeenLastCalledWith({ sysex: true });
    } finally { vi.unstubAllGlobals(); }
  });
  it('keeps held steps addressed on their page and suppresses toggles after a knob edit', () => {
    const r = rig(64); r.arrow(107); r.surface.follow = true;
    r.note(41); r.note(42);
    r.state.playhead = { pattern: 'a', step: 50 }; r.surface.state();
    expect(r.surface.page).toBe(1);
    expect(r.surface.useHeldSteps().map(s => s.step)).toEqual([16, 17]);
    r.note(41, 0); r.note(42, 0, 0x88); expect(r.toggle).not.toHaveBeenCalled();
    r.surface.state(); expect(r.surface.page).toBe(3);
  });
  it('does not delete a step when holding to inspect it without turning a knob', () => {
    const r = rig(); r.note(41); r.advance(600); r.note(41, 0);
    expect(r.toggle).not.toHaveBeenCalled();
    r.note(41); r.advance(100); r.note(41, 0); expect(r.toggle).toHaveBeenCalledOnce();
  });
  it('cancels pending taps on focus, page, pattern, length and connection changes', () => {
    for (const change of [
      (r: ReturnType<typeof rig>) => { r.state.trackId = 'other'; },
      (r: ReturnType<typeof rig>) => { r.state.pattern = 'other'; },
      (r: ReturnType<typeof rig>) => { r.surface.movePage(1); },
      (r: ReturnType<typeof rig>) => { r.state.steps = 0; },
      (r: ReturnType<typeof rig>) => { r.surface.release(); },
    ]) {
      const r = rig(); r.note(41); change(r); r.note(41, 0);
      expect(r.toggle).not.toHaveBeenCalled(); expect(r.surface.heldSteps()).toEqual([]);
    }
  });
});
