/** Launch Control XL Mk1/Mk2, immutable Factory Template 1 (MIDI channel 9).
 * Protocol: Novation Launch Control XL Programmer's Reference Guide v2.
 * SPDX-License-Identifier: GPL-3.0-only
 */
export const LCXL_TEMPLATE = 8;
export const LCXL_CHANNEL = 8; // zero based
export const LCXL_STEPS = [41, 42, 43, 44, 57, 58, 59, 60, 73, 74, 75, 76, 89, 90, 91, 92] as const;
export const LCXL_HEADER = [0xf0, 0, 0x20, 0x29, 2, 0x11];
export const LCXL_OFF = 12; // Copy + Clear; green and red both zero.
export const selectLcxlTemplate = (): number[] => [...LCXL_HEADER, 0x77, LCXL_TEMPLATE, 0xf7];
export const lcxlLeds = (pairs: readonly [number, number][]): number[] => [...LCXL_HEADER, 0x78, LCXL_TEMPLATE, ...pairs.flat(), 0xf7];
export function lcxlTemplate(data: Uint8Array): number | null {
  return data.length === 9 && LCXL_HEADER.every((x, i) => data[i] === x) && data[6] === 0x77 && data[7]! < 16 && data[8] === 0xf7 ? data[7]! : null;
}

export type StepLight = 'empty' | 'hit' | 'modified' | 'locked';
export interface LcxlState {
  pattern: string;
  steps: number;
  track: number;
  tracks: number;
  trackName: string;
  cells: readonly StepLight[];
  playhead: { pattern: string; step: number } | null;
}
export interface LcxlActions {
  state(): LcxlState;
  selectTrack(index: number): void;
  toggleStep(step: number): void;
}

/** The sequencer logic is independent of Web MIDI and the application renderer. */
export class LcxlSurface {
  page = 0;
  follow = true;
  private pattern = '';
  private held = new Set<string>();
  constructor(private actions: LcxlActions) {}
  release(): void { this.held.clear(); }
  state(): LcxlState {
    const state = this.actions.state();
    if (state.pattern !== this.pattern) { this.page = 0; this.pattern = state.pattern; }
    if (this.follow && state.playhead?.pattern === state.pattern) this.page = Math.floor(state.playhead.step / 16);
    this.page = Math.max(0, Math.min(Math.ceil(state.steps / 16) - 1, this.page));
    return state;
  }
  moveTrack(delta: number): void {
    const s = this.state();
    const next = Math.max(0, Math.min(s.tracks - 1, s.track + delta));
    if (next !== s.track && next >= 0) this.actions.selectTrack(next);
  }
  movePage(delta: number): void {
    const s = this.state();
    this.follow = false;
    this.page = Math.max(0, Math.min(Math.ceil(s.steps / 16) - 1, this.page + delta));
  }
  /** True means the message belongs to this profile and must not play/record a drum note. */
  receive(data: Uint8Array): boolean {
    if (data.length !== 3 || data[1]! > 127 || data[2]! > 127 || (data[0]! & 15) !== LCXL_CHANNEL) return false;
    const type = data[0]! & 0xf0, number = data[1]!, value = data[2]!;
    const step = LCXL_STEPS.indexOf(number as typeof LCXL_STEPS[number]);
    const note = type === 0x90 || type === 0x80;
    const arrow = type === 0xb0 && number >= 104 && number <= 107;
    const side = note && number >= 105 && number <= 108;
    if (!(note && step >= 0) && !arrow && !side) return false;
    const key = `${arrow ? 'cc' : 'note'}:${number}`;
    if (type === 0x80 || value === 0) { this.held.delete(key); return true; }
    if (this.held.has(key)) return true;
    this.held.add(key);
    if (side) return true; // The four mode buttons are reserved, not drum triggers.
    if (arrow) {
      if (number === 104 || number === 105) this.moveTrack(number === 104 ? -1 : 1);
      else this.movePage(number === 106 ? -1 : 1);
    } else {
      const s = this.state(), absolute = this.page * 16 + step;
      if (absolute < s.steps) this.actions.toggleStep(absolute);
    }
    return true;
  }
  leds(): [number, number][] {
    const s = this.state(), start = this.page * 16;
    const head = s.playhead?.pattern === s.pattern ? Math.floor(s.playhead.step) : -1;
    const base: Record<StepLight, number> = { empty: LCXL_OFF, hit: 28, modified: 29, locked: 13 };
    const bright: Record<StepLight, number> = { empty: 62, hit: 60, modified: 63, locked: 15 };
    const leds: [number, number][] = Array.from({ length: 16 }, (_, i) => {
      const step = start + i, kind = s.cells[step] ?? 'empty';
      return [24 + i, step >= s.steps ? LCXL_OFF : step === head ? bright[kind] : base[kind]];
    });
    leds.push([44, s.track > 0 ? 15 : LCXL_OFF], [45, s.track < s.tracks - 1 ? 15 : LCXL_OFF], [46, this.page > 0 ? 15 : LCXL_OFF], [47, start + 16 < s.steps ? 15 : LCXL_OFF]);
    return leds;
  }
}
