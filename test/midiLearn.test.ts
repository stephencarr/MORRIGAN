import { describe, expect, it, vi } from 'vitest';
import { LEARN_KEY, MidiLearn, type LearnTarget, type NoteControl } from '../src/midi/learn';
import { MidiController, defaultMidiPrefs } from '../src/midi/controller';

function fixture(saved = '') {
  const values = { a: 64, b: 0 };
  const targets: LearnTarget[] = [
    { id: 'a', label: 'A', min: 0, max: 127, step: 1, get: () => values.a, set: (v) => { values.a = v; } },
    { id: 'b', label: 'B', min: -1, max: 1, step: 0.001, get: () => values.b, set: (v) => { values.b = v; } },
  ];
  const storage = { getItem: vi.fn(() => saved), setItem: vi.fn((_, v: string) => { saved = v; }) };
  const say = vi.fn();
  const learn = new MidiLearn(() => targets, storage, vi.fn(), say);
  const cc = (value: number, extra = {}) => learn.receive({ device: 'knobs', channel: 1, cc: 74, value, ...extra });
  return { learn, values, cc, storage, targets, say };
}

describe('MIDI learn', () => {
  it('captures without editing, then scales, rounds and persists assignments', () => {
    const f = fixture();
    f.learn.start('a'); f.cc(0);
    expect(f.values.a).toBe(64);
    expect(f.learn.active).toBe(false);
    f.cc(127); expect(f.values.a).toBe(127);
    expect(f.storage.setItem).toHaveBeenCalledWith(LEARN_KEY, expect.any(String));
    const restored = fixture(f.storage.getItem());
    restored.cc(13); expect(restored.values.a).toBe(13);
    f.learn.start('b'); f.cc(0); f.cc(0); expect(f.values.b).toBe(-1);
    f.cc(127); expect(f.values.b).toBe(1);
    f.cc(64); expect(f.values.b).toBeCloseTo(0.008);
  });
  it('scopes by channel and device and replaces conflicting sources and targets', () => {
    const f = fixture(); f.learn.start('a'); f.cc(5);
    f.cc(0, { channel: 2 }); f.cc(0, { device: 'other' }); expect(f.values.a).toBe(64);
    f.learn.start('b'); f.cc(10); expect(f.learn.bindings).toHaveLength(1);
    f.learn.start('b'); f.cc(10, { cc: 1 }); expect(f.learn.bindings[0]?.cc).toBe(1);
    f.cc(127); expect(f.values.b).toBe(0);
  });
  it('suppresses mappings during selection, cancels cleanly and removes bindings', () => {
    const f = fixture(); f.learn.start('a'); f.cc(0); f.learn.start(); f.cc(0);
    expect(f.values.a).toBe(64); f.learn.cancel(); f.cc(0); expect(f.values.a).toBe(0);
    f.learn.remove('a'); f.cc(127); expect(f.values.a).toBe(0);
    f.learn.start('a'); f.cc(0); f.learn.clear(); expect(f.learn.bindings).toEqual([]);
    expect(f.learn.active).toBe(false);
  });
  it('ignores absent targets, malformed data and channel-mode messages', () => {
    const f = fixture('not json'); f.learn.start('a');
    for (const extra of [{ cc: 120 }, { value: 128 }, { channel: 0 }, { device: '' }, { cc: 1.5 }]) f.cc(0, extra);
    expect(f.learn.bindings).toEqual([]);
    f.cc(0); f.targets.splice(0); expect(() => f.cc(12)).not.toThrow();
    const invalid = fixture(JSON.stringify([null, { device: 'x', channel: 1, cc: 200, target: 'a' }]));
    expect(invalid.learn.bindings).toEqual([]);
  });
  it('keeps assignments working if storage fails', () => {
    const f = fixture(); f.storage.setItem.mockImplementation(() => { throw new Error('full'); });
    f.learn.start('a'); f.cc(0); f.cc(20);
    expect(f.values.a).toBe(20); expect(f.say).toHaveBeenLastCalledWith(expect.stringContaining('COULD NOT BE SAVED'));
  });
  it('learns note buttons without acting on capture, repeats or either kind of release, and restores them', () => {
    const f = fixture(), trigger = vi.fn();
    f.targets.push({ id: 'toggle', label: 'PLAY/STOP', trigger });
    const note = (value: number, extra = {}) => f.learn.receiveNote({ device: 'buttons', channel: 9, note: 105, value, ...extra });
    f.learn.start('toggle');
    note(0); expect(f.learn.active).toBe(true);
    note(127); note(127); note(0); expect(trigger).not.toHaveBeenCalled();
    note(127); note(127); note(0); expect(trigger).toHaveBeenCalledOnce();
    note(127, { channel: 1 }); note(127, { device: 'other' }); expect(trigger).toHaveBeenCalledOnce();
    const restored = fixture(f.storage.getItem()); restored.targets.push({ id: 'toggle', label: 'PLAY/STOP', trigger });
    expect(restored.learn.receiveNote({ device: 'buttons', channel: 9, note: 105, value: 100 })).toBe(true);
    expect(trigger).toHaveBeenCalledTimes(2);
    restored.learn.release(); restored.learn.receiveNote({ device: 'buttons', channel: 9, note: 105, value: 100 });
    expect(trigger).toHaveBeenCalledTimes(3);
    f.learn.remove('toggle'); expect(note(127)).toBe(false);
  });
  it('learns momentary CC actions on a press and only triggers on subsequent rising edges', () => {
    const f = fixture(), trigger = vi.fn();
    f.targets.push({ id: 'toggle', label: 'PLAY/STOP', trigger });
    f.learn.start('toggle'); f.cc(0); expect(f.learn.active).toBe(true);
    f.cc(127); f.cc(127); f.cc(0); expect(trigger).not.toHaveBeenCalled();
    f.cc(127); f.cc(64); f.cc(0); expect(trigger).toHaveBeenCalledOnce();
    f.cc(1); expect(trigger).toHaveBeenCalledTimes(2);
    // A CC and a note with the same number are different sources.
    expect(f.learn.receiveNote({ device: 'knobs', channel: 1, note: 74, value: 127 })).toBe(false);
  });
  it('suppresses notes while choosing, rejects note-to-slider assignments and preserves CC compatibility', () => {
    const f = fixture(); const note = () => f.learn.receiveNote({ device: 'x', channel: 1, note: 36, value: 100 });
    f.learn.start(); expect(note()).toBe(true); expect(f.learn.bindings).toEqual([]);
    f.learn.start('a'); expect(note()).toBe(true); expect(f.learn.pending).toBe('a');
    f.cc(0); f.cc(127); expect(f.values.a).toBe(127);
    expect(f.learn.bindings[0]).toEqual({ device: 'knobs', channel: 1, cc: 74, target: 'a' });
    expect(note()).toBe(false);
  });
});

it('offers note on and both release formats to button learn before drum input, even with notes disabled', () => {
  const noteControl = vi.fn((_message: NoteControl) => true), note = vi.fn(), resetControls = vi.fn();
  const m = new MidiController({ noteControl, note, resetControls, changed() {}, tempo() {}, transport() {} }, { ...defaultMidiPrefs(), inId: 'buttons', notesIn: false });
  const receive = (bytes: number[]) => (m as unknown as { receive(d: Uint8Array, t: number): void }).receive(new Uint8Array(bytes), 0);
  receive([0x98, 105, 100]); receive([0x88, 105, 64]); receive([0x98, 105, 0]);
  expect(noteControl.mock.calls.map(([m]) => m.value)).toEqual([100, 0, 0]);
  m.prefs.notesIn = true; receive([0x98, 105, 100]); expect(note).not.toHaveBeenCalled();
  noteControl.mockReturnValue(false); receive([0x98, 36, 100]); expect(note).toHaveBeenCalledOnce();
  m.selectInput(null); expect(resetControls).toHaveBeenCalledOnce();
});

it('routes CC independently of notes while preserving note, channel and clock behavior', () => {
  const handlers = { note: vi.fn(), cc: vi.fn(), tempo: vi.fn(), transport: vi.fn(), changed: vi.fn() };
  const m = new MidiController(handlers, { ...defaultMidiPrefs(), inId: 'knobs', clockIn: true });
  // Exercise the same packet parser used by MidiAccess, without a browser permission prompt.
  const receive = (bytes: number[]) => (m as unknown as { receive(data: Uint8Array, ts: number): void }).receive(new Uint8Array(bytes), 100);
  receive([0xb0, 74, 99]); expect(handlers.cc).toHaveBeenCalledWith({ device: 'knobs', channel: 1, cc: 74, value: 99 });
  m.prefs.notesIn = false; receive([0xb0, 74, 1]); expect(handlers.cc).toHaveBeenCalledTimes(2);
  receive([0x90, 36, 100]); expect(handlers.note).not.toHaveBeenCalled();
  m.prefs.notesIn = true; receive([0x90, 36, 100]); expect(handlers.note).toHaveBeenCalledWith(1, 36, 100);
  receive([0x90, 36, 0]); receive([0x80, 36, 100]); expect(handlers.note).toHaveBeenCalledTimes(1);
  m.prefs.inChannel = 2; receive([0xb0, 74, 5]); receive([0xb1, 74, 5]); expect(handlers.cc).toHaveBeenCalledTimes(3);
  receive([0xb1, 74]); receive([0xb1, 74, 255]); receive([0xb1, 120, 0]); expect(handlers.cc).toHaveBeenCalledTimes(3);
  receive([0xfa]); expect(handlers.transport).toHaveBeenCalledWith('start');
});
