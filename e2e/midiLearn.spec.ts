import { expect, test, type Page } from '@playwright/test';
import type { App } from '../src/app/app';
type W = Window & { clatter: App; sendMidi(bytes: number[]): void };

async function boot(page: Page) {
  await page.addInitScript(() => {
    const port = { id: 'test-controller', name: 'Test controller', type: 'input', state: 'connected', onmidimessage: null as ((event: { data: Uint8Array; timeStamp: number }) => void) | null };
    Object.defineProperty(navigator, 'requestMIDIAccess', { configurable: true, value: async () => ({ inputs: new Map([[port.id, port]]), outputs: new Map(), onstatechange: null }) });
    (window as unknown as W).sendMidi = (bytes) => port.onmidimessage?.({ data: new Uint8Array(bytes), timeStamp: performance.now() });
  });
  await page.goto('./clatter.html');
  await page.waitForSelector('#transport');
}
async function openLearn(page: Page) {
  await page.getByRole('menuitem', { name: 'MIDI', exact: true }).click();
  await page.getByText('MIDI learn…', { exact: true }).click();
}
async function enable(page: Page) {
  await openLearn(page);
  await page.getByRole('button', { name: 'ENABLE MIDI', exact: true }).click();
  const pick = page.getByRole('button', { name: 'CHOOSE ON SCREEN', exact: true });
  await expect(pick).toBeDisabled();
  await expect(pick).toHaveCSS('opacity', '0.35');
  await expect(pick).toHaveCSS('cursor', 'default');
  await expect(page.getByRole('button', { name: 'LEARN CONTROL', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'CLEAR ALL', exact: true })).toBeDisabled();
  await page.getByLabel('MIDI input', { exact: true }).selectOption('test-controller');
  await expect(pick).toBeEnabled();
  await expect(pick).toHaveCSS('opacity', '1');
  await expect(pick).toHaveCSS('cursor', 'pointer');
}
const cc = (page: Page, value: number, number = 74, channel = 0) => page.evaluate(({ value, number, channel }) => (window as unknown as W).sendMidi([0xb0 + channel, number, value]), { value, number, channel });

test('learns from the stock UI, preserves capture value, persists, removes, and plays the real engine', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', (e) => errors.push(e.message));
  await boot(page); await enable(page);
  const original = await page.evaluate(() => (window as unknown as W).clatter.project.tempo);
  await page.getByRole('button', { name: 'CHOOSE ON SCREEN' }).click();
  await page.locator('[data-test=bpm]').click();
  await expect(page.locator('[data-test=midi-learn-strip]')).toContainText('MOVE A MIDI KNOB → TEMPO');
  expect(await page.evaluate(() => (window as unknown as W).clatter.project.tempo)).toBe(original);
  await cc(page, 0);
  expect(await page.evaluate(() => (window as unknown as W).clatter.project.tempo)).toBe(original);
  await expect(page.locator('[data-test=midi-learn-strip]')).toBeHidden();
  await cc(page, 64);
  expect(await page.evaluate(() => (window as unknown as W).clatter.project.tempo)).toBe(166);
  await page.reload(); await page.waitForSelector('#transport');
  await openLearn(page); await page.getByRole('button', { name: 'ENABLE MIDI', exact: true }).click();
  await expect(page.getByLabel('MIDI input', { exact: true })).toHaveValue('test-controller');
  await expect(page.locator('.midi-assignments')).toContainText('CH1 CC74');
  await expect(page.getByRole('button', { name: 'CLEAR ALL', exact: true })).toBeEnabled();
  await cc(page, 20);
  expect(await page.evaluate(() => (window as unknown as W).clatter.project.tempo)).toBe(73);
  await page.getByRole('button', { name: 'Remove tempo', exact: true }).click();
  await expect(page.getByRole('button', { name: 'CLEAR ALL', exact: true })).toBeDisabled();
  await cc(page, 127); expect(await page.evaluate(() => (window as unknown as W).clatter.project.tempo)).toBe(73);
  await page.getByRole('button', { name: 'DONE', exact: true }).click();
  await page.locator('[data-test=play]').click();
  await expect.poll(() => page.evaluate(() => (window as unknown as W).clatter.meters?.masterL ?? 0)).toBeGreaterThan(0.01);
  expect(errors).toEqual([]);
});

test('synth and track mappings keep their destination after selection changes; Escape cancels', async ({ page }) => {
  await boot(page); await enable(page);
  const info = await page.evaluate(() => {
    const a = (window as unknown as W).clatter;
    const param = a.midiLearn.catalog().find((t) => t.id.startsWith('param:') && t.max === 127)!;
    return { param: param.id, id: Number(param.id.split(':')[1]), track: a.project.tracks[0]!.id, other: a.project.tracks[1]!.id };
  });
  await page.getByLabel('MIDI learn control').selectOption(info.param);
  await page.getByRole('button', { name: 'LEARN CONTROL', exact: true }).click();
  await cc(page, 0); await page.evaluate((id) => (window as unknown as W).clatter.selectTrack(id), info.other);
  await cc(page, 19);
  expect(await page.evaluate((id) => (window as unknown as W).clatter.project.kit.synth.params[id], info.id)).toBe(19);
  await openLearn(page); await page.getByLabel('MIDI learn control').selectOption(`track:${info.track}:volume`);
  await page.getByRole('button', { name: 'LEARN CONTROL', exact: true }).click(); await cc(page, 0, 7); await cc(page, 0, 7);
  expect(await page.evaluate((id) => (window as unknown as W).clatter.project.tracks.find((t) => t.id === id)!.mix.volume, info.track)).toBe(0);
  await openLearn(page); await page.getByLabel('MIDI learn control').selectOption('master:volume');
  await page.getByRole('button', { name: 'LEARN CONTROL', exact: true }).click(); await page.keyboard.press('Escape');
  await cc(page, 127, 2);
  expect(await page.evaluate(() => (window as unknown as W).clatter.midiLearn.bindings.length)).toBe(2);
  await expect(page.locator('[data-test=midi-learn-strip]')).toBeHidden();
});

test('click learn picks a base synth control without changing it or editing a variation', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => (window as unknown as W).clatter.setView('sound'));
  await enable(page); await page.getByRole('button', { name: 'CHOOSE ON SCREEN' }).click();
  const control = page.locator('[data-midi-target^="param:"]:visible').first();
  const id = Number((await control.getAttribute('data-midi-target'))!.split(':')[1]);
  const before = await page.evaluate((id) => (window as unknown as W).clatter.project.kit.synth.params[id], id);
  await control.click(); await cc(page, 0);
  expect(await page.evaluate((id) => (window as unknown as W).clatter.project.kit.synth.params[id], id)).toBe(before);
  expect(await page.evaluate(() => (window as unknown as W).clatter.midiLearn.bindings[0]?.target)).toBe(`param:${id}`);
  await page.evaluate(() => (window as unknown as W).clatter.setSlot(0));
  await expect(page.locator(`[data-param="${id}"]:visible`)).not.toHaveAttribute('data-midi-target');
});
