/** Persistent, device/channel-scoped CC and button assignments. SPDX-License-Identifier: GPL-3.0-only */
export interface ControlChange { device: string; channel: number; cc: number; value: number }
export interface NoteControl { device: string; channel: number; note: number; value: number }
type Source = { device: string; channel: number } & ({ kind?: 'cc'; cc: number; note?: never } | { kind: 'note'; note: number; cc?: never });
export type MidiBinding = Source & { target: string };
interface Target { id: string; label: string }
export type LearnTarget = Target & ({
  min: number; max: number; step: number;
  get(): number; set(value: number): void; trigger?: never;
} | {
  trigger(): void;
  min?: never; max?: never; step?: never; get?: never; set?: never;
});
export const LEARN_KEY = 'clatter-midi-learn-v1';
const integer = (n: unknown, lo: number, hi: number): n is number => Number.isInteger(n) && Number(n) >= lo && Number(n) <= hi;
const valid = (b: Partial<MidiBinding>): b is MidiBinding => typeof b.device === 'string' && b.device.length > 0 && typeof b.target === 'string' && b.target.length > 0 && integer(b.channel, 1, 16) && (b.kind === 'note' ? integer(b.note, 0, 127) : (b.kind === undefined || b.kind === 'cc') && integer(b.cc, 0, 119));
const sourceKey = (s: Source) => JSON.stringify([s.device, s.channel, s.kind ?? 'cc', s.kind === 'note' ? s.note : s.cc]);
const sameSource = (a: Source, b: Source) => sourceKey(a) === sourceKey(b);
export const sourceLabel = (s: Source): string => `CH${s.channel} ${s.kind === 'note' ? `NOTE ${s.note}` : `CC${s.cc}`}`;

export class MidiLearn {
  bindings: MidiBinding[] = [];
  active = false;
  pending: string | null = null;
  private held = new Set<string>();
  constructor(
    private targets: () => LearnTarget[],
    private storage: Pick<Storage, 'getItem' | 'setItem'> | undefined,
    private changed: () => void,
    private say: (message: string) => void,
  ) {
    try {
      const data: unknown = JSON.parse(storage?.getItem(LEARN_KEY) ?? 'null');
      if (Array.isArray(data)) for (const b of data.slice(0, 1024)) {
        if (b && typeof b === 'object' && valid(b)) this.assign(b);
      }
    } catch { /* Invalid or unavailable local storage starts with no assignments. */ }
  }
  catalog(): LearnTarget[] { return this.targets(); }
  start(target?: string): void {
    this.active = true;
    this.pending = target && this.targets().some((t) => t.id === target) ? target : null;
    this.changed();
  }
  cancel(): void { this.active = false; this.pending = null; this.changed(); }
  release(): void { this.held.clear(); }
  remove(target: string): void {
    this.bindings = this.bindings.filter((b) => b.target !== target);
    this.save();
  }
  clear(): void { this.bindings = []; this.release(); this.cancel(); this.save(); }
  private assign(binding: MidiBinding): void {
    this.bindings = this.bindings.filter((b) => b.target !== binding.target && !sameSource(b, binding));
    this.bindings.push(binding.kind === 'note'
      ? { device: binding.device, channel: binding.channel, kind: 'note', note: binding.note, target: binding.target }
      : { device: binding.device, channel: binding.channel, cc: binding.cc, target: binding.target });
  }
  private save(): void {
    try { this.storage?.setItem(LEARN_KEY, JSON.stringify(this.bindings)); }
    catch { this.say('MIDI ASSIGNMENTS WORK THIS SESSION, BUT COULD NOT BE SAVED'); }
    this.changed();
  }
  receive(message: ControlChange): boolean { return this.control(message, message.value); }
  receiveNote(message: NoteControl): boolean { return this.control({ ...message, kind: 'note' }, message.value); }
  private control(source: Source, value: number): boolean {
    if (!valid({ ...source, target: '_' }) || !integer(value, 0, 127)) return false;
    const key = sourceKey(source), wasHeld = this.held.has(key);
    const binding = this.bindings.find((b) => sameSource(b, source));
    const target = this.targets().find((t) => t.id === (this.active ? this.pending : binding?.target));
    // Track button edges only for learn/assigned controls, not every musical note.
    if (value === 0) this.held.delete(key);
    else if (this.active || binding) this.held.add(key);
    if (this.active) {
      if (!this.pending) return true; // Suppress performance while choosing a target.
      if (!target) { this.cancel(); return true; }
      if (source.kind === 'note' && !target.trigger) {
        this.say('USE A CC KNOB OR FADER FOR THIS CONTROL'); return true;
      }
      if (target.trigger && (value === 0 || wasHeld)) return true;
      this.assign({ ...source, target: target.id });
      this.active = false;
      this.pending = null;
      this.say(`LEARNED ${sourceLabel(source)} → ${target.label}`);
      this.save();
      return true; // Capturing a mapping never performs its action.
    }
    if (!target) return !!binding;
    if (target.trigger) {
      if (value > 0 && !wasHeld) target.trigger();
    } else if (source.kind !== 'note') {
      const raw = target.min + (value / 127) * (target.max - target.min);
      const next = Math.min(target.max, Math.max(target.min, target.min + Math.round((raw - target.min) / target.step) * target.step));
      if (Math.abs(next - target.get()) > 1e-8) target.set(next);
    }
    return true;
  }
}
