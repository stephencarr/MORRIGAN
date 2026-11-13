import { describe, expect, it, vi } from 'vitest';
import { LEARN_KEY, MidiLearn, type LearnTarget } from '../src/midi/learn';
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
