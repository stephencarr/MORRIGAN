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
