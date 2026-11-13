import { chromium, expect, test, type Page } from '@playwright/test';
import type { Instrument } from '../src/morrigan/instrument';

declare global { interface Window { morrigan: Instrument } }

async function boot(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/morrigan.html');
  await expect(page.getByTestId('transport-play')).toBeEnabled();
  await expect(page.getByTestId('voice-5')).toBeVisible();
  return errors;
}

test('six real voices start with a blank jam and produce audio on the shared sequencer', async ({ page }) => {
  const errors = await boot(page);
  expect(await page.evaluate(() => window.morrigan.project.tracks.map(t => t.sound.trigger))).toEqual([0, 1, 2, 3, 4, 5]);
  expect(await page.evaluate(() => window.morrigan.app.pattern.steps)).toBe(16);
  await page.getByTestId('step-0').click();
  await page.getByTestId('transport-play').click();
  await expect.poll(() => page.evaluate(() => window.morrigan.app.host.state)).toBe('running');
  await expect.poll(() => page.evaluate(() => window.morrigan.app.meters?.masterL ?? 0), { intervals: [30], timeout: 5000 }).toBeGreaterThan(0.001);
  await page.getByTestId('transport-play').click();
  await expect.poll(() => page.evaluate(() => window.morrigan.app.ui.playing)).toBe(false);
  expect(errors).toEqual([]);
});

test('voice selection keeps independent patterns and reload discards the jam', async ({ page }) => {
  await boot(page);
  await page.getByTestId('step-0').click();
  await page.getByTestId('voice-3').click();
  await page.getByTestId('step-4').click();
  const patterns = await page.evaluate(() => window.morrigan.project.tracks.map(t => window.morrigan.app.pattern.grids[t.id]!.map(h => !!h)));
  expect(patterns[0]![0]).toBe(true);
  expect(patterns[0]![4]).toBe(false);
  expect(patterns[3]![4]).toBe(true);
  expect(patterns[3]![0]).toBe(false);
  await page.reload();
  await expect(page.getByTestId('transport-play')).toBeEnabled();
  expect(await page.evaluate(() => Object.values(window.morrigan.app.pattern.grids).flat().some(Boolean))).toBe(false);
});

test('browser audio permission can be granted by the first user gesture', async () => {
  // The normal suite enables autoplay; this separate browser exercises actual gesture policy.
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined });
  const context = await browser.newContext({ baseURL: 'http://localhost:4174' });
  const page = await context.newPage();
  await boot(page);
  await page.getByTestId('step-0').click();
  await page.getByTestId('transport-play').click();
  await expect.poll(() => page.evaluate(() => window.morrigan.app.host.state)).toBe('running');
  await context.close();
  await browser.close();
});

test('latched step editing creates and clears only the intended lock', async ({ page }) => {
  await boot(page);
  await page.getByTestId('step-0').click();
  await page.getByTestId('step-0').click({ modifiers: ['Shift'] });
  const control = page.getByTestId('panel-control-v0-c0');
  const knob = control.getByRole('slider');
  const base = Number(await knob.getAttribute('aria-valuenow'));
  await knob.focus();
  await page.keyboard.press(base >= 127 ? 'ArrowDown' : 'ArrowUp');
  expect(await page.evaluate(() => Object.keys(window.morrigan.app.stepSound('voice-0', 0)?.locks ?? {}).length)).toBe(1);
  expect(await page.evaluate(() => !!window.morrigan.app.hitAt('voice-0', 0))).toBe(true);
  await control.getByRole('button', { name: /Clear .* lock/ }).click();
  expect(await page.evaluate(() => window.morrigan.app.stepSound('voice-0', 0)?.locks)).toBeUndefined();
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => window.morrigan.heldStep)).toBeNull();
  await expect(knob).toHaveAttribute('aria-valuenow', String(base));
});

test('design controls persist independently and do not alter the musical parameters', async ({ page }) => {
  await boot(page);
  const before = await page.evaluate(() => [...window.morrigan.project.kit.synth.params]);
  await page.getByTestId('design-mode').click();
  for (const [voice, name] of ['DRUM 1', 'DRUM 2', 'DRUM 3', 'SNARE', 'CYMBAL', 'HIHAT'].entries()) {
    await page.getByRole('button', { name: `Audition ${name}`, exact: true }).click();
    await expect.poll(() => page.evaluate(v => window.morrigan.app.meters?.tracks[v] ?? 0, voice), { intervals: [20] }).toBeGreaterThan(0.001);
  }
  expect(await page.evaluate(() => window.morrigan.app.ui.playing)).toBe(false);
  await page.getByTestId('panel-control-v0-c0').click();
  await page.getByRole('textbox', { name: 'Control label' }).fill('My pitch');
  await page.getByRole('textbox', { name: 'Control label' }).press('Tab');
  await page.getByLabel('Control type', { exact: true }).selectOption('slider');
  expect(await page.evaluate(() => window.morrigan.project.kit.synth.params)).toEqual(before);
  await page.reload();
  await expect(page.getByTestId('panel-control-v0-c0').getByRole('slider')).toHaveAttribute('type', 'range');
  await expect(page.getByTestId('panel-control-v0-c0')).toContainText('My pitch');
});

test('holding an empty step and turning an encoder consumes the tap without creating a trigger', async ({ page }) => {
  await boot(page);
  const step = page.getByTestId('step-2');
  await step.scrollIntoViewIfNeeded();
  const box = (await step.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.getByTestId('panel-control-v0-c0').getByRole('slider').focus();
  await page.keyboard.press('ArrowUp');
  await page.mouse.up();
  const result = await page.evaluate(() => ({ hit: window.morrigan.app.hitAt('voice-0', 2), locks: window.morrigan.app.stepSound('voice-0', 2)?.locks, held: window.morrigan.heldStep }));
  expect(result.hit).toBeFalsy();
  expect(Object.keys(result.locks ?? {})).toHaveLength(1);
  expect(result.held).toBeNull();
});

test('inserts and independent sends are live controls and Silence stops audio', async ({ page }) => {
  await boot(page);
  await page.getByLabel('DRUM 1 Insert', { exact: true }).selectOption('crush');
  await page.getByLabel('DRUM 1 Delay send', { exact: true }).focus();
  await page.keyboard.press('End');
  await page.getByLabel('DRUM 1 Reverb send', { exact: true }).focus();
  await page.keyboard.press('End');
  const mix = await page.evaluate(() => window.morrigan.project.tracks[0]!.mix);
  expect(mix.send).toBe(1);
  expect(mix.reverbSend).toBe(1);
  expect(mix.fx?.crush.on).toBe(true);
  expect(mix.fx?.sat.on).toBe(false);
  await page.getByTestId('step-0').click();
  await page.getByTestId('transport-play').click();
  await expect.poll(() => page.evaluate(() => window.morrigan.app.meters?.masterL ?? 0), { intervals: [30] }).toBeGreaterThan(0.001);
  await page.getByRole('button', { name: 'Silence', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.morrigan.app.ui.playing)).toBe(false);
  await expect.poll(() => page.evaluate(() => window.morrigan.app.meters?.masterL ?? 1)).toBeLessThan(0.001);
});
