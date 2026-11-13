import { describe, expect, it } from 'vitest';
import { PAR } from '../src/sound/lxrParams';
import { controlValue, defaultPanel, findOverlaps, loadPanel, moveControl, moveModule, PANEL_STORAGE_KEY, parameterChoices, parsePanel, reassignControl, repairPanel, reorderModule, savePanel, serializePanel, updateControl } from '../src/morrigan/panel';

describe('MORRIGAN control surface', () => {
  it('offers six native voices, distinct candidate assignments, and lockable volume', () => {
    const p = defaultPanel();
    expect(p.modules.map((m) => m.voice)).toEqual([0, 1, 2, 3, 4, 5]);
    for (const m of p.modules) {
      expect(m.controls).toHaveLength(9);
      expect(m.controls.some((c) => c.param === PAR.VOL1 + m.voice)).toBe(true);
      for (const c of m.controls) expect(parameterChoices(m.voice).some((d) => d.id === c.param && d.max === c.max)).toBe(true);
    }
    expect(findOverlaps(p)).toEqual([]);
    expect(p.modules[5]!.controls.map((c) => c.param)).toContain(PAR.VELOD6_OPEN);
    expect(p.modules[5]!.controls.map((c) => c.param)).toContain(PAR.VELOD6_CLOSED);
  });
  it('round-trips an edited layout without needing a musical project', () => {
    const p = defaultPanel();
    const edited = reorderModule(moveControl(reassignControl(p, 'v0-c0', PAR.RESO_1), 'v0-c0', 1, 1), 'voice-5', 0);
    expect(parsePanel(serializePanel(edited))).toEqual(edited);
    expect(edited.modules[0]!.voice).toBe(5);
    expect(p.modules[0]!.controls[0]!.param).toBe(PAR.COARSE1);
  });
  it('rejects parameters owned by another voice and firmware routing targets', () => {
    const p = defaultPanel();
    expect(reassignControl(p, 'v0-c0', PAR.COARSE4)).toEqual(p);
    expect(updateControl(p, 'v0-c0', { param: PAR.TARGET_LFO1 })).toEqual(p);
    p.modules[0]!.controls[0]!.param = PAR.COARSE4;
    expect(repairPanel(p).modules[0]!.controls).toHaveLength(8);
  });
  it('repairs nonfinite geometry, menu ranges, duplicate ids and missing voice modules', () => {
    const p = defaultPanel();
    p.modules = [p.modules[1]!, p.modules[1]!];
    p.modules[0]!.width = Infinity;
    p.modules[0]!.controls[0]!.id = p.modules[0]!.controls[1]!.id;
    const wave = p.modules[0]!.controls.find((c) => c.param === PAR.OSC_WAVE_DRUM2)!;
    Object.assign(wave, { x: 999, y: -20, max: 127, min: 1000, step: 7, width: NaN });
    const fixed = repairPanel(p);
    expect(fixed.modules).toHaveLength(6);
    const ids = fixed.modules.flatMap((m) => [m.id, ...m.controls.map((c) => c.id)]);
    expect(new Set(ids).size).toBe(ids.length);
    const repaired = fixed.modules[0]!.controls.find((c) => c.param === PAR.OSC_WAVE_DRUM2)!;
    expect(repaired).toMatchObject({ min: 4, max: 5, step: 1, x: 2, y: 0, width: 2 });
  });
  it('uses safe defaults for corrupted, unsupported and blocked storage', () => {
    expect(loadPanel({ getItem: () => '{bad' })).toEqual(defaultPanel());
    expect(loadPanel({ getItem: () => { throw Error('blocked'); } })).toEqual(defaultPanel());
    expect(repairPanel({ ...defaultPanel(), version: 999 })).toEqual(defaultPanel());
    expect(savePanel(defaultPanel(), { setItem: () => { throw Error('quota'); } })).toBe(false);
    let written = '';
    expect(savePanel(defaultPanel(), { setItem: (key, value) => { expect(key).toBe(PANEL_STORAGE_KEY); written = value; } })).toBe(true);
    expect(loadPanel({ getItem: () => written })).toEqual(defaultPanel());
  });
  it('bounds and quantizes continuous controls, while menu reassignment uses enumerated choices', () => {
    const p = updateControl(defaultPanel(), 'v0-c0', { min: 20, max: 90, step: 5 });
    const c = p.modules[0]!.controls[0]!;
    expect(controlValue(c, 33)).toBe(35);
    expect(controlValue(c, -100)).toBe(20);
    expect(controlValue(c, 100)).toBe(90);
    expect(controlValue(c, NaN)).toBe(20);
    const menu = reassignControl(p, 'v0-c0', PAR.OSC_WAVE_DRUM1).modules[0]!.controls[0]!;
    expect(menu).toMatchObject({ type: 'select', min: 0, max: 5, step: 1 });
  });
  it('reports collisions, accepts touching edges, and confines controls to their module', () => {
    const p = defaultPanel();
    const shifted = moveControl(p, 'v0-c0', 99, 99);
    expect(shifted.modules[0]!.controls[0]).toMatchObject({ x: 2, y: 12 });
    expect(findOverlaps(moveControl(p, 'v0-c0', 2, 0))).toContainEqual(['v0-c0', 'v0-c1']);
    expect(findOverlaps(moveModule(p, 'voice-1', 2, 0))).toContainEqual(['voice-0', 'voice-1']);
    expect(findOverlaps(p)).toEqual([]);
  });
});
