/** Persistent, device/channel-scoped absolute CC assignments. SPDX-License-Identifier: GPL-3.0-only */
export interface ControlChange { device: string; channel: number; cc: number; value: number }
export interface MidiBinding { device: string; channel: number; cc: number; target: string }
export interface LearnTarget {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  get(): number;
  set(value: number): void;
}
export const LEARN_KEY = 'clatter-midi-learn-v1';
const integer = (n: unknown, lo: number, hi: number): n is number => Number.isInteger(n) && Number(n) >= lo && Number(n) <= hi;
const valid = (b: Partial<MidiBinding>): b is MidiBinding => typeof b.device === 'string' && b.device.length > 0 && typeof b.target === 'string' && b.target.length > 0 && integer(b.channel, 1, 16) && integer(b.cc, 0, 119);
const sameSource = (a: MidiBinding, b: MidiBinding) => a.device === b.device && a.channel === b.channel && a.cc === b.cc;

export class MidiLearn {
  bindings: MidiBinding[] = [];
  active = false;
  pending: string | null = null;
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
  remove(target: string): void {
    this.bindings = this.bindings.filter((b) => b.target !== target);
    this.save();
  }
  clear(): void { this.bindings = []; this.cancel(); this.save(); }
  private assign(binding: MidiBinding): void {
    this.bindings = this.bindings.filter((b) => b.target !== binding.target && !sameSource(b, binding));
    this.bindings.push({ device: binding.device, channel: binding.channel, cc: binding.cc, target: binding.target });
  }
  private save(): void {
    try { this.storage?.setItem(LEARN_KEY, JSON.stringify(this.bindings)); }
    catch { this.say('MIDI ASSIGNMENTS WORK THIS SESSION, BUT COULD NOT BE SAVED'); }
    this.changed();
  }
  receive(message: ControlChange): void {
    if (!valid({ ...message, target: '_' }) || !integer(message.value, 0, 127)) return;
    if (this.active) {
      if (!this.pending) return; // Suppress existing mappings while choosing a control.
      const target = this.targets().find((t) => t.id === this.pending);
      if (!target) { this.cancel(); return; }
      this.assign({ ...message, target: target.id });
      this.active = false;
      this.pending = null;
      this.say(`LEARNED CH${message.channel} CC${message.cc} → ${target.label}`);
      this.save();
      return; // The capture message never changes the sound.
    }
    const binding = this.bindings.find((b) => sameSource(b, { ...message, target: '' }));
    const target = binding && this.targets().find((t) => t.id === binding.target);
    if (!target) return;
    const raw = target.min + (message.value / 127) * (target.max - target.min);
    const value = Math.min(target.max, Math.max(target.min, target.min + Math.round((raw - target.min) / target.step) * target.step));
    if (Math.abs(value - target.get()) > 1e-8) target.set(value);
  }
}
