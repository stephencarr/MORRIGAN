/** A deliberately small instrument panel document, independent of musical session state.
 * Coordinates and footprints are logical panel units, not browser pixels.
 * SPDX-License-Identifier: GPL-3.0-only
 */
import { PAR, VOICES, VOICE_PARAMS, type ParamDef } from '../sound/lxrParams';

export type ControlType = 'encoder' | 'slider' | 'toggle' | 'select';
export interface PanelControl {
  id: string;
  type: ControlType;
  label: string;
  param: number;
  x: number;
  y: number;
  width: number;
  height: number;
  min: number;
  max: number;
  step: number;
  inverted: boolean;
}
export interface VoiceModule {
  id: string;
  voice: number;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  controls: PanelControl[];
}
export interface PanelDocument {
  format: 'morrigan-panel';
  version: 1;
  name: string;
  modules: VoiceModule[];
}
export const PANEL_STORAGE_KEY = 'morrigan.panel.v1';
export const CONTROL_TYPES: readonly ControlType[] = ['encoder', 'slider', 'toggle', 'select'];

export function parameterChoices(voice: number): ParamDef[] {
  return (VOICE_PARAMS[voice] ?? []).filter((p) => p.kind !== 'target');
}

const candidates: [number, string][][] = [
  [[PAR.COARSE1, 'Pitch'], [PAR.VELOD1, 'Decay'], [PAR.MODAMNT1, 'Pitch depth'], [PAR.MOD_EG1, 'Pitch decay'], [PAR.FMAMNT1, 'FM amount'], [PAR.TRANS1_VOL, 'Transient'], [PAR.FILTER_FREQ_1, 'Cutoff'], [PAR.DRIVE1, 'Drive']],
  [[PAR.COARSE2, 'Pitch'], [PAR.VELOD2, 'Decay'], [PAR.MODAMNT2, 'Pitch depth'], [PAR.FMAMNT2, 'FM amount'], [PAR.FM_FREQ2, 'FM pitch'], [PAR.OSC_WAVE_DRUM2, 'Waveform'], [PAR.FILTER_FREQ_2, 'Cutoff'], [PAR.DRIVE2, 'Drive']],
  [[PAR.COARSE3, 'Pitch'], [PAR.VELOD3, 'Decay'], [PAR.VELOA3, 'Attack'], [PAR.FMAMNT3, 'FM amount'], [PAR.FM_FREQ3, 'FM pitch'], [PAR.MOD_EG3, 'Pitch decay'], [PAR.VOICE_DECIMATION3, 'Decimation'], [PAR.DRIVE3, 'Drive']],
  [[PAR.COARSE4, 'Tone pitch'], [PAR.VELOD4, 'Decay'], [PAR.MIX1, 'Noise mix'], [PAR.NOISE_FREQ1, 'Noise colour'], [PAR.MODAMNT4, 'Pitch depth'], [PAR.REPEAT4, 'Repeat'], [PAR.FILTER_FREQ_4, 'Cutoff'], [PAR.SNARE_DISTORTION, 'Drive']],
  [[PAR.COARSE5, 'Pitch'], [PAR.VELOD5, 'Decay'], [PAR.MOD_OSC_F1_CYM, 'Metal 1 pitch'], [PAR.MOD_OSC_GAIN1_CYM, 'Metal 1 depth'], [PAR.MOD_OSC_F2_CYM, 'Metal 2 pitch'], [PAR.MOD_OSC_GAIN2_CYM, 'Metal 2 depth'], [PAR.FILTER_FREQ_5, 'Cutoff'], [PAR.CYMBAL_DISTORTION, 'Drive']],
  [[PAR.COARSE6, 'Pitch'], [PAR.VELOD6_CLOSED, 'Closed decay'], [PAR.VELOD6_OPEN, 'Open decay'], [PAR.MOD_OSC_F1, 'Metal 1 pitch'], [PAR.MOD_OSC_GAIN1, 'Metal 1 depth'], [PAR.MOD_OSC_F2, 'Metal 2 pitch'], [PAR.FILTER_FREQ_6, 'Cutoff'], [PAR.HAT_DISTORTION, 'Drive']],
];

export function defaultPanel(): PanelDocument {
  return {
    format: 'morrigan-panel', version: 1, name: 'Six voices',
    modules: VOICES.map((label, voice) => ({
      id: `voice-${voice}`, voice, label, x: voice * 4, y: 0, width: 4, height: 15,
      controls: [...candidates[voice]!, [PAR.VOL1 + voice, 'Volume'] as [number, string]].map(([param, name], i) => {
        const def = parameterChoices(voice).find((p) => p.id === param)!;
        return { id: `v${voice}-c${i}`, type: def.kind === 'menu' ? 'select' : 'encoder', label: name, param,
          x: (i % 2) * 2, y: Math.floor(i / 2) * 3, width: 2, height: 3,
          min: 0, max: def.max, step: 1, inverted: false };
      }),
    })),
  };
}

type Obj = Record<string, unknown>;
const object = (x: unknown): Obj => x !== null && typeof x === 'object' && !Array.isArray(x) ? x as Obj : {};
const integer = (x: unknown, fallback: number, lo: number, hi: number): number => typeof x === 'number' && Number.isFinite(x) ? Math.min(hi, Math.max(lo, Math.round(x))) : fallback;
const label = (x: unknown, fallback: string): string => typeof x === 'string' && x.trim() ? x.trim().slice(0, 40) : fallback;
const validId = (x: unknown): x is string => typeof x === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(x);

/** Repair untrusted documents. Six voice identities stay fixed; array order and layout are editable.
 * Unknown schema versions fall back rather than silently interpreting a future format.
 */
export function repairPanel(input: unknown): PanelDocument {
  const fallback = defaultPanel();
  const o = object(input);
  if (o.format !== 'morrigan-panel' || o.version !== 1 || !Array.isArray(o.modules)) return fallback;
  const seenVoices = new Set<number>();
  const seenIds = new Set<string>();
  const uniqueId = (raw: unknown, base: string): string => {
    let id = validId(raw) ? raw : base;
    for (let n = 1; seenIds.has(id); n++) id = `${base}-${n}`;
    seenIds.add(id);
    return id;
  };
  const modules: VoiceModule[] = [];
  for (const raw of o.modules.slice(0, 32)) {
    const m = object(raw);
    if (typeof m.voice !== 'number' || !Number.isInteger(m.voice) || m.voice < 0 || m.voice > 5 || seenVoices.has(m.voice)) continue;
    const voice = m.voice;
    seenVoices.add(voice);
    const original = fallback.modules[voice]!;
    const width = integer(m.width, original.width, 2, 32);
    const height = integer(m.height, original.height, 3, 64);
    const module: VoiceModule = {
      id: uniqueId(m.id, `voice-${voice}`), voice, label: label(m.label, original.label),
      x: integer(m.x, original.x, 0, 128), y: integer(m.y, original.y, 0, 128), width, height, controls: [],
    };
    const definitions = new Map(parameterChoices(voice).map((p) => [p.id, p]));
    for (const [i, rawControl] of (Array.isArray(m.controls) ? m.controls.slice(0, 32) : original.controls).entries()) {
      const c = object(rawControl);
      const def = typeof c.param === 'number' ? definitions.get(c.param) : undefined;
      if (!def) continue;
      const min = integer(c.min, 0, 0, Math.max(0, def.max - 1));
      const max = integer(c.max, def.max, min + 1, def.max);
      const cw = integer(c.width, 2, 1, width);
      const ch = integer(c.height, 3, 1, height);
      let type: ControlType = CONTROL_TYPES.includes(c.type as ControlType) ? c.type as ControlType : 'encoder';
      if (type === 'select' && def.kind !== 'menu') type = 'encoder';
      module.controls.push({
        id: uniqueId(c.id, `v${voice}-c${i}`), type, label: label(c.label, `${def.group} ${def.label}`), param: def.id,
        x: integer(c.x, 0, 0, width - cw), y: integer(c.y, 0, 0, height - ch), width: cw, height: ch,
        min, max, step: def.kind === 'menu' ? 1 : integer(c.step, 1, 1, max - min), inverted: c.inverted === true,
      });
    }
    modules.push(module);
  }
  for (const original of fallback.modules) if (!seenVoices.has(original.voice)) {
    original.id = uniqueId(original.id, `voice-${original.voice}`);
    for (const c of original.controls) c.id = uniqueId(c.id, `v${original.voice}-control`);
    modules.push(original);
  }
  return { format: 'morrigan-panel', version: 1, name: label(o.name, fallback.name), modules };
}

export function serializePanel(panel: PanelDocument): string { return JSON.stringify(repairPanel(panel), null, 2); }
export function parsePanel(text: string): PanelDocument { return repairPanel(JSON.parse(text)); }

/** Missing, blocked, or corrupted storage never prevents playing. No musical state is saved here. */
export function loadPanel(storage?: Pick<Storage, 'getItem'>): PanelDocument {
  try {
    const store = storage ?? globalThis.localStorage;
    const raw = store?.getItem(PANEL_STORAGE_KEY);
    return raw ? parsePanel(raw) : defaultPanel();
  } catch { return defaultPanel(); }
}
export function savePanel(panel: PanelDocument, storage?: Pick<Storage, 'setItem'>): boolean {
  try {
    const store = storage ?? globalThis.localStorage;
    if (!store) return false;
    store.setItem(PANEL_STORAGE_KEY, serializePanel(panel));
    return true;
  } catch { return false; }
}

/** Every editing helper returns a new document, so the caller can keep simple layout undo. */
export function updateControl(panel: PanelDocument, id: string, patch: Partial<PanelControl>): PanelDocument {
  const next = repairPanel(panel);
  for (const module of next.modules) {
    const c = module.controls.find((candidate) => candidate.id === id);
    if (!c) continue;
    // An invalid reassignment is a no-op rather than deletion of the user's control.
    if (patch.param !== undefined && !parameterChoices(module.voice).some((p) => p.id === patch.param)) return next;
    Object.assign(c, patch, { id: c.id });
  }
  return repairPanel(next);
}
export function reassignControl(panel: PanelDocument, id: string, param: number): PanelDocument {
  for (const module of panel.modules) {
    const c = module.controls.find((candidate) => candidate.id === id);
    const def = parameterChoices(module.voice).find((p) => p.id === param);
    if (c && def) return updateControl(panel, id, { param, label: `${def.group} ${def.label}`, min: 0, max: def.max, step: 1,
      type: def.kind === 'menu' ? 'select' : c.type === 'select' ? 'encoder' : c.type });
  }
  return repairPanel(panel);
}
export function moveControl(panel: PanelDocument, id: string, x: number, y: number): PanelDocument { return updateControl(panel, id, { x, y }); }
export function moveModule(panel: PanelDocument, id: string, x: number, y: number): PanelDocument {
  const next = repairPanel(panel);
  const module = next.modules.find((m) => m.id === id);
  if (module) Object.assign(module, { x, y });
  return repairPanel(next);
}
export function reorderModule(panel: PanelDocument, id: string, index: number): PanelDocument {
  const next = repairPanel(panel);
  const from = next.modules.findIndex((m) => m.id === id);
  if (from < 0) return next;
  const [module] = next.modules.splice(from, 1);
  next.modules.splice(integer(index, from, 0, 5), 0, module!);
  return next;
}

/** Quantize an absolute value to the control's bounded integer range. Encoder deltas remain a UI concern. */
export function controlValue(control: PanelControl, value: number): number {
  const finite = Number.isFinite(value) ? value : control.min;
  const quantized = control.min + Math.round((finite - control.min) / control.step) * control.step;
  return Math.max(control.min, Math.min(control.max, quantized));
}

/** Layout feedback: overlapping footprints are allowed for exploration, but never hidden. */
export function findOverlaps(panel: PanelDocument): [string, string][] {
  const pairs: [string, string][] = [];
  const intersects = (a: { x: number; y: number; width: number; height: number }, b: typeof a) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  const inspect = (items: { id: string; x: number; y: number; width: number; height: number }[]) => {
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) if (intersects(items[i]!, items[j]!)) pairs.push([items[i]!.id, items[j]!.id]);
  };
  inspect(panel.modules);
  for (const module of panel.modules) inspect(module.controls);
  return pairs;
}
