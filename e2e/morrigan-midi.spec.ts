import { expect, test } from '@playwright/test';
import type { Instrument } from '../src/morrigan/instrument';

declare global { interface Window { morrigan: Instrument; midiTestSend(bytes:number[]):void; midiTestPlug(connected:boolean):void } }

test('MIDI device events feed real audio, filter channels and reconnect', async ({page}) => {
  await page.addInitScript(() => {
    const port = {id:'test-pad',name:'Test drum controller',type:'input',state:'connected',onmidimessage:null as null|((e: {data:Uint8Array;timeStamp:number})=>void)};
    const access = {inputs:new Map([['test-pad',port]]),outputs:new Map(),onstatechange:null as null|((e:{port:typeof port})=>void)};
    Object.defineProperty(navigator,'requestMIDIAccess',{value:async()=>access,configurable:true});
    window.midiTestSend = bytes => port.onmidimessage?.({data:Uint8Array.from(bytes),timeStamp:performance.now()});
    window.midiTestPlug = connected => {port.state=connected?'connected':'disconnected';access.onstatechange?.({port});};
  });
  await page.goto('/morrigan.html');
  await page.getByText('MIDI input',{exact:true}).click();
  await page.getByRole('button',{name:'Enable MIDI',exact:true}).click();
  await expect(page.getByLabel('MIDI input device',{exact:true})).toHaveValue('test-pad');
  await expect.poll(()=>page.evaluate(()=>window.morrigan.app.host.state)).toBe('running');
  await page.evaluate(()=>window.midiTestSend([0x99,36,120]));
  await expect.poll(()=>page.evaluate(()=>window.morrigan.app.meters?.masterL??0),{intervals:[20]}).toBeGreaterThan(.001);
  await page.getByLabel('MIDI input channel',{exact:true}).selectOption('10');
  await page.evaluate(()=>window.midiTestSend([0x90,46,90]));
  await expect(page.locator('.midi-status')).toContainText('NOTE 36');
  await page.evaluate(()=>window.midiTestSend([0x99,46,90]));
  await expect(page.locator('.midi-status')).toContainText('NOTE 46 VEL 90');
  await page.evaluate(()=>window.midiTestPlug(false));
  await expect(page.locator('.midi-status')).toContainText('No MIDI input connected');
  await page.evaluate(()=>window.midiTestPlug(true));
  await expect(page.locator('.midi-status')).toContainText('Connected');
  expect(await page.evaluate(()=>Object.values(window.morrigan.app.pattern.grids).flat().some(Boolean))).toBe(false);
});

test('permission refusal leaves the internal instrument playable',async({page})=>{
  await page.addInitScript(()=>Object.defineProperty(navigator,'requestMIDIAccess',{value:async()=>{throw new Error('Permission denied');},configurable:true}));
  await page.goto('/morrigan.html');
  await page.getByText('MIDI input',{exact:true}).click();
  await page.getByRole('button',{name:'Enable MIDI',exact:true}).click();
  await expect(page.locator('.midi-status')).toContainText('refused');
  await page.getByTestId('step-0').click();await page.getByTestId('transport-play').click();
  await expect.poll(()=>page.evaluate(()=>window.morrigan.app.meters?.masterL??0),{intervals:[30]}).toBeGreaterThan(.001);
});

test('browsers without Web MIDI show a useful unsupported state',async({page})=>{
  await page.addInitScript(()=>Object.defineProperty(navigator,'requestMIDIAccess',{value:undefined,configurable:true}));
  await page.goto('/morrigan.html');await page.getByText('MIDI input',{exact:true}).click();
  await expect(page.getByRole('button',{name:'Enable MIDI',exact:true})).toBeDisabled();
  await expect(page.locator('.midi-status')).toContainText('no Web MIDI');
});
