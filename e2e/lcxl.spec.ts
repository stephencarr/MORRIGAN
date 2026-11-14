import { expect, test, type Page } from '@playwright/test';
import { PAR } from '../src/sound/lxrParamIds';
import type { App } from '../src/app/app';
type W = Window & { clatter: App; lcxlTest: { send(bytes: number[]): void; connection(kind: 'input' | 'output', connected: boolean): void; sent: number[][]; leds: Record<number, number>; permissions: boolean[]; deny: boolean } };
async function boot(page: Page) {
  await page.addInitScript(() => {
    const t = { sent: [] as number[][], leds: {} as Record<number, number>, permissions: [] as boolean[], deny: false };
    const input = { id: 'lcxl-in', name: 'Launch Control XL', type: 'input', state: 'connected', onmidimessage: null as ((event: { data: Uint8Array; timeStamp: number }) => void) | null };
    const output = { id: 'lcxl-out', name: 'Launch Control XL', type: 'output', state: 'connected', send: (bytes: number[]) => {
      t.sent.push([...bytes]);
      if (bytes[0] === 240 && bytes[6] === 120) for (let i = 8; i < bytes.length - 1; i += 2) t.leds[bytes[i]!] = bytes[i + 1]!;
    } };
    const access = { inputs: new Map([[input.id, input]]), outputs: new Map([[output.id, output]]), sysexEnabled: false, onstatechange: null as ((event: { port: typeof input | typeof output }) => void) | null };
    Object.defineProperty(navigator, 'requestMIDIAccess', { configurable: true, value: async ({ sysex = false } = {}) => {
      t.permissions.push(sysex);
      if (t.deny) throw new Error('permission denied');
      access.sysexEnabled = sysex; return access;
    } });
    (window as unknown as W).lcxlTest = { ...t, send: (bytes) => input.onmidimessage?.({ data: new Uint8Array(bytes), timeStamp: performance.now() }), connection: (kind, connected) => {
      const port = kind === 'input' ? input : output; port.state = connected ? 'connected' : 'disconnected'; access.onstatechange?.({ port });
    } };
    // Share the denial flag with the permission stub as well.
    Object.defineProperty((window as unknown as W).lcxlTest, 'deny', { get: () => t.deny, set: (v) => { t.deny = v; } });
  });
  await page.goto('./clatter.html'); await page.waitForSelector('#transport');
}
async function setup(page: Page) {
  await page.getByRole('menuitem', { name: 'MIDI', exact: true }).click();
  await page.getByText('Launch Control XL Mk2…', { exact: true }).click();
}
async function enable(page: Page) {
  await setup(page); await page.getByRole('button', { name: 'ENABLE MK2 PROFILE', exact: true }).click();
  await expect(page.getByRole('button', { name: 'DISABLE PROFILE', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'DONE', exact: true }).click();
}
const send = (page: Page, bytes: number[]) => page.evaluate((b) => (window as unknown as W).lcxlTest.send(b), bytes);
const led = (page: Page, index: number) => page.evaluate((i) => (window as unknown as W).lcxlTest.leds[i], index);

test('chooses a MIDI learn control on screen while the Mk2 sequencer is playing', async ({ page }) => {
  await boot(page); await enable(page);
  await page.locator('[data-test=play]').click();
  await page.getByRole('menuitem', { name: 'MIDI', exact: true }).click();
  await page.getByText('MIDI learn…', { exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('INPUT CONNECTED');
  await page.getByRole('button', { name: 'CHOOSE ON SCREEN', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.locator('[data-test=bpm]').click();
  await expect(page.locator('[data-test=midi-learn-strip]')).toContainText('MOVE A MIDI KNOB → TEMPO');
  const original = await page.evaluate(() => (window as unknown as W).clatter.project.tempo);
  await send(page, [0xb8, 13, 0]);
  expect(await page.evaluate(() => (window as unknown as W).clatter.project.tempo)).toBe(original);
  await send(page, [0xb8, 13, 64]);
  expect(await page.evaluate(() => (window as unknown as W).clatter.project.tempo)).toBe(166);
  await expect(page.locator('[data-test=midi-learn-strip]')).toBeHidden();
  await send(page, [0xb8, 105, 127]); await send(page, [0xb8, 105, 0]);
  expect(await page.evaluate(() => (window as unknown as W).clatter.trackIndexOf((window as unknown as W).clatter.ui.track))).toBe(1);
  await page.locator('[data-test=stop]').click();
});

test('fixed factory profile navigates focus and edits steps with LED feedback, mouse sync and undo', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', (e) => errors.push(e.message));
  await boot(page); await enable(page);
  expect(await page.evaluate(() => (window as unknown as W).lcxlTest.permissions)).toEqual([true]);
  expect(await page.evaluate(() => (window as unknown as W).lcxlTest.sent)).toContainEqual([240, 0, 32, 41, 2, 17, 119, 8, 247]);
  await page.evaluate(() => (window as unknown as W).clatter.clearPattern());
  await send(page, [0xb8, 105, 127]); await send(page, [0xb8, 105, 127]); await send(page, [0xb8, 105, 0]);
  expect(await page.evaluate(() => (window as unknown as W).clatter.trackIndexOf((window as unknown as W).clatter.ui.track))).toBe(1);
  await send(page, [0x98, 41, 127]); await send(page, [0x98, 41, 127]); await send(page, [0x88, 41, 127]);
  await expect.poll(() => led(page, 24)).toBe(28);
  expect(await page.evaluate(() => { const a = (window as unknown as W).clatter; return !!a.hitAt(a.ui.track, 0); })).toBe(true);
  await page.evaluate(() => { const a = (window as unknown as W).clatter; a.setHitProps(a.ui.track, 0, { prob: 50 }); });
  await expect.poll(() => led(page, 24)).toBe(29);
  await page.evaluate((p) => (window as unknown as W).clatter.setStepLock(p, 20), PAR.COARSE4);
  await expect.poll(() => led(page, 24)).toBe(13);
  await page.getByRole('menuitem', { name: 'EDIT', exact: true }).click();
  await page.locator('.dropdown .item').filter({ hasText: /^Undo/ }).click();
  await expect.poll(() => led(page, 24)).toBe(29);
  await page.locator('#pattern .trackrow .tname').first().click();
  await expect.poll(() => led(page, 24)).toBe(12);
  await expect(page.locator('[data-test=lcxl-strip]')).toContainText('1: KICK');
  await page.evaluate(() => (window as unknown as W).clatter.midi.selectOutput('lcxl-out'));
  expect(await page.evaluate(() => (window as unknown as W).clatter.midi.prefs.outId)).toBeNull();
  expect(errors).toEqual([]);
});

test('pages, follows the real audio playhead and restores static LED states on stop', async ({ page }) => {
  await boot(page); await enable(page);
  await page.evaluate(() => (window as unknown as W).clatter.clearPattern());
  await send(page, [0xb8, 107, 127]); await send(page, [0xb8, 107, 0]);
  await expect(page.locator('[data-test=lcxl-strip]')).toContainText('STEPS 17–32');
  await send(page, [0x98, 41, 127]); await send(page, [0x98, 41, 0]);
  expect(await page.evaluate(() => { const a = (window as unknown as W).clatter; return !!a.hitAt(a.ui.track, 16); })).toBe(true);
  await page.getByRole('button', { name: 'LCXL follow playhead', exact: true }).click();
  await page.locator('[data-test=play]').click();
  await expect.poll(() => page.evaluate(() => (window as unknown as W).lcxlTest.sent.some((m) => m[0] === 240 && m[6] === 120 && m.includes(62)))).toBe(true);
  await expect.poll(() => page.evaluate(() => (window as unknown as W).clatter.meters?.masterL ?? 0), { timeout: 8000 }).toBeGreaterThan(0.01);
  await page.locator('[data-test=stop]').click();
  await page.getByRole('button', { name: 'LCXL previous page', exact: true }).click();
  await expect.poll(() => led(page, 24)).toBe(12);
  await page.getByRole('button', { name: 'LCXL next page', exact: true }).click();
  await expect.poll(() => led(page, 24)).toBe(28);
});

test('pauses on another template, recovers both ports and clears LEDs on disable', async ({ page }) => {
  await boot(page); await enable(page);
  await page.evaluate(() => (window as unknown as W).clatter.clearPattern());
  await send(page, [240, 0, 32, 41, 2, 17, 119, 9, 247]);
  await expect(page.locator('[data-test=lcxl-strip]')).toContainText('SELECT FACTORY 1');
  await send(page, [0x98, 41, 127]);
  expect(await page.evaluate(() => { const a = (window as unknown as W).clatter; return a.hitAt(a.ui.track, 0); })).toBeNull();
  await page.getByRole('button', { name: 'LCXL setup', exact: true }).click();
  await page.getByRole('button', { name: 'RETURN TO FACTORY 1', exact: true }).click();
  await page.getByRole('button', { name: 'DONE', exact: true }).click();
  for (const kind of ['input', 'output'] as const) {
    await page.evaluate((k) => (window as unknown as W).lcxlTest.connection(k, false), kind);
    await expect(page.locator('[data-test=lcxl-strip]')).toContainText('DISCONNECTED');
    await page.evaluate((k) => (window as unknown as W).lcxlTest.connection(k, true), kind);
    await expect(page.locator('[data-test=lcxl-strip]')).not.toContainText('DISCONNECTED');
  }
  await send(page, [0x98, 41, 127]); await send(page, [0x98, 41, 0]);
  await expect.poll(() => led(page, 24)).toBe(28);
  await page.getByRole('button', { name: 'LCXL setup', exact: true }).click();
  await page.getByRole('button', { name: 'DISABLE PROFILE', exact: true }).click();
  await expect(page.locator('[data-test=lcxl-strip]')).toHaveCount(0);
  expect(await led(page, 24)).toBe(12);
  expect(await page.evaluate(() => (window as unknown as W).clatter.midi.reservedOutputId)).toBeNull();
});

test('permission refusal leaves the stock instrument playable', async ({ page }) => {
  await boot(page); await page.evaluate(() => { (window as unknown as W).lcxlTest.deny = true; });
  await setup(page); await page.getByRole('button', { name: 'ENABLE MK2 PROFILE', exact: true }).click();
  await expect(page.locator('[data-test=lcxl-dialog] [role=status]')).toContainText('Allow MIDI and SysEx');
  await page.getByRole('button', { name: 'DONE', exact: true }).click();
  await page.locator('[data-test=play]').click();
  await expect.poll(() => page.evaluate(() => (window as unknown as W).clatter.meters?.masterL ?? 0)).toBeGreaterThan(0.01);
});

test('keeps the editing page under manual control while the real sequencer crosses bars', async ({ page }) => {
  await boot(page); await enable(page);
  const follow = page.getByRole('button', { name: 'LCXL follow playhead', exact: true });
  await expect(follow).toHaveAttribute('aria-pressed', 'false');
  await page.evaluate(() => { const a = (window as unknown as W).clatter; a.clearPattern(); a.setTempo(300); });
  await page.locator('[data-test=play]').click();
  await page.waitForFunction(() => ((window as unknown as W).clatter.playhead()?.step ?? -1) >= 17);
  await expect(page.locator('[data-test=lcxl-strip]')).toContainText('STEPS 1–16');
  await send(page, [0xb8, 107, 127]); await send(page, [0xb8, 107, 0]);
  await expect(page.locator('[data-test=lcxl-strip]')).toContainText('STEPS 17–32');
  await send(page, [0x98, 41, 127]); await send(page, [0x98, 41, 0]);
  expect(await page.evaluate(() => { const a = (window as unknown as W).clatter; return !!a.hitAt(a.ui.track, 16) && !a.hitAt(a.ui.track, 0); })).toBe(true);
  await page.waitForFunction(() => ((window as unknown as W).clatter.playhead()?.step ?? -1) < 16);
  await expect(page.locator('[data-test=lcxl-strip]')).toContainText('STEPS 17–32');
  await expect.poll(() => led(page, 24)).toBe(28);
  await page.locator('[data-test=play]').click();
  await expect(page.locator('[data-test=lcxl-strip]')).toContainText('STEPS 17–32');
});

test('learns a mode-button transport toggle alongside the fixed sequencer profile', async ({ page }) => {
  await boot(page); await enable(page);
  await page.getByRole('menuitem', { name: 'MIDI', exact: true }).click();
  await page.getByText('MIDI learn…', { exact: true }).click();
  await page.getByRole('button', { name: 'CHOOSE ON SCREEN', exact: true }).click();
  await page.locator('[data-test=play]').click();
  await send(page, [0x98, 105, 127]); await send(page, [0x88, 105, 0]);
  expect(await page.evaluate(() => (window as unknown as W).clatter.ui.playing)).toBe(false);
  await send(page, [0x98, 105, 127]); await send(page, [0x98, 105, 127]); await send(page, [0x98, 105, 0]);
  await expect(page.locator('[data-test=play]')).toHaveText('■ STOP');
  await send(page, [0x98, 105, 127]); await send(page, [0x88, 105, 0]);
  await expect(page.locator('[data-test=play]')).toHaveText('▶ PLAY');
  // CC105 remains track navigation; the Note105 assignment cannot replace it.
  await send(page, [0xb8, 105, 127]); await send(page, [0xb8, 105, 0]);
  expect(await page.evaluate(() => (window as unknown as W).clatter.trackIndexOf((window as unknown as W).clatter.ui.track))).toBe(1);
  await page.evaluate(() => (window as unknown as W).clatter.clearPattern());
  await send(page, [0x98, 41, 127]); await send(page, [0x98, 41, 0]);
  await expect.poll(() => led(page, 24)).toBe(28);
});

async function mapKnob(page: Page, target: string, cc = 13) {
  await page.evaluate(t => (window as unknown as W).clatter.midiLearn.start(t), target);
  await send(page, [0xb8, cc, 0]);
}

test('hold and twist locks an existing step without touching the base sound; release, undo and mouse unlock stay in sync', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await boot(page); await enable(page);
  await page.evaluate(() => { const a = (window as unknown as W).clatter; a.clearPattern(); a.toggleCell(a.ui.track, 0); });
  await mapKnob(page, `param:${PAR.FILTER_FREQ_1}`);
  const base = await page.evaluate(p => (window as unknown as W).clatter.project.kit.synth.params[p], PAR.FILTER_FREQ_1);
  const lock = () => page.evaluate(p => { const a = (window as unknown as W).clatter; return a.stepSound(a.ui.track, 0)?.locks?.[p]; }, PAR.FILTER_FREQ_1);
  await page.evaluate(() => (window as unknown as W).clatter.setView('sound'));
  await page.locator('[data-test=play]').click();
  await send(page, [0x98, 41, 127]);
  expect(await page.evaluate(() => { const a = (window as unknown as W).clatter; return !!a.hitAt(a.ui.track, 0); })).toBe(true);
  // A value equal to the base still needs to create an explicit lock.
  await send(page, [0xb8, 13, base!]); expect(await lock()).toBe(base);
  await send(page, [0xb8, 13, 20]); await send(page, [0xb8, 13, 91]);
  expect(await lock()).toBe(91);
  expect(await page.evaluate(p => (window as unknown as W).clatter.project.kit.synth.params[p], PAR.FILTER_FREQ_1)).toBe(base);
  await expect(page.locator('[data-test=lcxl-strip]')).toContainText('LOCK · STEP 1 · FILTER CUTOFF');
  await expect(page.locator(`[data-lock="${PAR.FILTER_FREQ_1}"]`)).toBeVisible();
  await send(page, [0x88, 41, 64]);
  await page.locator('[data-test=play]').click();
  await expect.poll(() => led(page, 24)).toBe(13);
  await page.evaluate(() => (window as unknown as W).clatter.undo());
  expect(await lock()).toBeUndefined();
  expect(await page.evaluate(() => { const a = (window as unknown as W).clatter; return !!a.hitAt(a.ui.track, 0); })).toBe(true);
  await expect.poll(() => led(page, 24)).toBe(28);
  await page.evaluate(() => (window as unknown as W).clatter.redo()); expect(await lock()).toBe(91);
  await send(page, [0xb8, 13, 33]);
  expect(await page.evaluate(p => (window as unknown as W).clatter.project.kit.synth.params[p], PAR.FILTER_FREQ_1)).toBe(33);
  expect(await lock()).toBe(91);
  await page.locator(`[data-lock="${PAR.FILTER_FREQ_1}"]`).getByRole('button', { name: '×', exact: true }).click();
  await expect.poll(() => led(page, 24)).toBe(28);
  expect(errors).toEqual([]);
});

test('locks the held page and matching voice parameter, creates empty hits, and saves the locks', async ({ page }) => {
  await boot(page); await enable(page);
  await page.evaluate(() => (window as unknown as W).clatter.clearPattern());
  await mapKnob(page, `param:${PAR.FILTER_FREQ_1}`);
  await send(page, [0xb8, 105, 127]); await send(page, [0xb8, 105, 0]); // Snare track.
  await send(page, [0xb8, 107, 127]); await send(page, [0xb8, 107, 0]); // Second page.
  const before = await page.evaluate(() => [...(window as unknown as W).clatter.project.kit.synth.params]);
  await send(page, [0x98, 41, 127]); await send(page, [0xb8, 13, 47]); await send(page, [0x98, 41, 0]);
  const read = () => page.evaluate(p => { const a = (window as unknown as W).clatter; return { hit: !!a.hitAt(a.ui.track, 16), lock: a.stepSound(a.ui.track, 16)?.locks?.[p], first: a.stepSound(a.ui.track, 0) }; }, PAR.FILTER_FREQ_4);
  expect(await read()).toEqual({ hit: true, lock: 47, first: undefined });
  await page.evaluate(() => { const a = (window as unknown as W).clatter; a.setCursor({ track: a.ui.track, step: 17 }); a.setStepVoice(0); });
  await send(page, [0x98, 42, 127]); await send(page, [0xb8, 13, 55]); await send(page, [0x98, 42, 0]);
  expect(await page.evaluate(p => { const a = (window as unknown as W).clatter; return a.stepSound(a.ui.track, 17)?.locks?.[p]; }, PAR.FILTER_FREQ_1)).toBe(55);
  expect(await page.evaluate(() => [...(window as unknown as W).clatter.project.kit.synth.params])).toEqual(before);
  await expect.poll(() => led(page, 24)).toBe(13);
  await page.evaluate(() => (window as unknown as W).clatter.flushSave());
  await page.reload(); await page.waitForSelector('#transport');
  await page.evaluate(() => { const a = (window as unknown as W).clatter; a.selectTrack(a.project.tracks[1]!.id); });
  expect(await read()).toEqual({ hit: true, lock: 47, first: undefined });
});

test('unmapped and global knobs cannot accidentally delete held steps or change global values', async ({ page }) => {
  await boot(page); await enable(page);
  await page.evaluate(() => { const a = (window as unknown as W).clatter; a.clearPattern(); a.toggleCell(a.ui.track, 0); });
  await mapKnob(page, 'tempo');
  const tempo = await page.evaluate(() => (window as unknown as W).clatter.project.tempo);
  await send(page, [0x98, 41, 127]); await send(page, [0xb8, 13, 127]);
  await expect(page.locator('[data-test=lcxl-strip]')).toContainText('USE A KNOB MAPPED TO A VOICE SYNTH PARAMETER');
  await send(page, [0x98, 41, 0]);
  await send(page, [0x98, 41, 127]); await send(page, [0xb8, 14, 127]); await send(page, [0x98, 41, 0]);
  expect(await page.evaluate(() => (window as unknown as W).clatter.project.tempo)).toBe(tempo);
  expect(await page.evaluate(() => { const a = (window as unknown as W).clatter; return { hit: !!a.hitAt(a.ui.track, 0), sound: a.stepSound(a.ui.track, 0) }; })).toEqual({ hit: true, sound: undefined });
  await mapKnob(page, `param:${PAR.FILTER_FREQ_1}`);
  const base = await page.evaluate(p => { const a = (window as unknown as W).clatter; a.selectTrack(a.project.tracks[2]!.id); return a.project.kit.synth.params[p]; }, PAR.FILTER_FREQ_1);
  expect(await page.evaluate(() => (window as unknown as W).clatter.track.sound.mode)).toBe('sample');
  await send(page, [0x98, 41, 127]); await send(page, [0xb8, 13, 110]);
  await expect(page.locator('[data-test=lcxl-strip]')).toContainText('NOT AVAILABLE FOR THE HELD VOICE');
  await send(page, [0x98, 41, 0]);
  expect(await page.evaluate(p => (window as unknown as W).clatter.project.kit.synth.params[p], PAR.FILTER_FREQ_1)).toBe(base);
  expect(await page.evaluate(() => { const a = (window as unknown as W).clatter; return !!a.hitAt(a.ui.track, 0); })).toBe(false);
});

test('undo or a focus change while holding cancels further edits until release, and disconnect closes the gesture', async ({ page }) => {
  await boot(page); await enable(page);
  await page.evaluate(() => (window as unknown as W).clatter.clearPattern());
  await mapKnob(page, `param:${PAR.FILTER_FREQ_1}`);
  const base = await page.evaluate(p => (window as unknown as W).clatter.project.kit.synth.params[p], PAR.FILTER_FREQ_1);
  await send(page, [0x98, 41, 127]); await send(page, [0xb8, 13, 60]);
  await page.evaluate(() => (window as unknown as W).clatter.undo());
  await send(page, [0xb8, 13, 90]); await send(page, [0x98, 41, 0]);
  expect(await page.evaluate(() => { const a = (window as unknown as W).clatter; return !!a.hitAt(a.ui.track, 0); })).toBe(false);
  expect(await page.evaluate(p => (window as unknown as W).clatter.project.kit.synth.params[p], PAR.FILTER_FREQ_1)).toBe(base);
  await send(page, [0x98, 41, 127]);
  await page.evaluate(() => { const a = (window as unknown as W).clatter; a.selectTrack(a.project.tracks[1]!.id); });
  await send(page, [0xb8, 13, 90]); await send(page, [0x98, 41, 0]);
  expect(await page.evaluate(() => { const a = (window as unknown as W).clatter; return !!a.hitAt(a.ui.track, 0); })).toBe(false);
  await send(page, [0x98, 41, 127]); await send(page, [0xb8, 13, 60]);
  await page.evaluate(() => (window as unknown as W).lcxlTest.connection('input', false));
  await expect(page.locator('[data-test=lcxl-strip]')).toContainText('DISCONNECTED');
  await page.evaluate(() => (window as unknown as W).clatter.undo());
  expect(await page.evaluate(() => { const a = (window as unknown as W).clatter; return !!a.hitAt(a.ui.track, 0); })).toBe(false);
});

test('holding several steps applies locks as one undoable gesture', async ({ page }) => {
  await boot(page); await enable(page);
  await page.evaluate(() => (window as unknown as W).clatter.clearPattern());
  await mapKnob(page, `param:${PAR.FILTER_FREQ_1}`);
  await send(page, [0x98, 41, 127]); await send(page, [0x98, 42, 127]);
  await send(page, [0xb8, 13, 76]);
  await send(page, [0x98, 41, 0]); await send(page, [0x88, 42, 0]);
  expect(await page.evaluate(p => { const a = (window as unknown as W).clatter; return [0, 1].map(s => a.stepSound(a.ui.track, s)?.locks?.[p]); }, PAR.FILTER_FREQ_1)).toEqual([76, 76]);
  await page.evaluate(() => (window as unknown as W).clatter.undo());
  expect(await page.evaluate(() => { const a = (window as unknown as W).clatter; return [0, 1].some(s => a.hitAt(a.ui.track, s)); })).toBe(false);
});
