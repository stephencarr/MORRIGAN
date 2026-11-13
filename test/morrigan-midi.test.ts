import { afterEach, describe, expect, it, vi } from 'vitest';
import { Instrument } from '../src/morrigan/instrument';
import { MIDI_DRUMS } from '../src/morrigan/midi';
import { createInstrumentProject } from '../src/morrigan/instrument';
import { newLxr } from './helpers';
import { readKit } from '../src/sound/kitcheck';

afterEach(() => vi.unstubAllGlobals());

function setup(denied = false) {
  const port = { id: 'pads', name: 'Test pads', type: 'input', state: 'connected', onmidimessage: null as null | ((e: {data: Uint8Array; timeStamp: number}) => void) };
  const access = { inputs: new Map([['pads', port]]), outputs: new Map(), onstatechange: null as null | ((e: {port: typeof port}) => void) };
  const request = vi.fn(async () => { if (denied) throw new Error('Permission denied'); return access; });
  vi.stubGlobal('navigator', { requestMIDIAccess: request });
  const i = new Instrument(); i.app.project = createInstrumentProject(readKit(newLxr()));
  vi.spyOn(i.app.host, 'start').mockImplementation(async () => { i.app.host.state = 'running'; });
  const send = vi.spyOn(i.app.host, 'send');
  const emit = (data: number[], timeStamp = 1) => port.onmidimessage?.({ data: Uint8Array.from(data), timeStamp });
  return {i, port, access, request, send, emit};
}

describe('MORRIGAN MIDI input', () => {
  it('requests no SysEx, selects the sole input and routes all seven drum triggers with velocity', async () => {
    const {i, request, send, emit} = setup(); await i.midi.enable(); send.mockClear();
    expect(request).toHaveBeenCalledWith({sysex:false});
    expect(i.midi.controller.access.inputReady).toBe(true);
    for (const d of MIDI_DRUMS) emit([0x99, d.note, 73]);
    expect(send.mock.calls.map(([msg]) => msg.type === 'hits' ? [msg.hits[0]!.track, msg.hits[0]!.trig, msg.hits[0]!.vel] : [])).toEqual(MIDI_DRUMS.map(d => [d.voice, d.trigger, 73]));
    expect(i.app.pattern.grids['voice-0']!.every(h => !h)).toBe(true);
    expect(i.midi.controller.out.device).toBeFalsy();
  });
  it('filters channels and ignores note-off, zero velocity, CC and unmapped notes', async () => {
    const {i, send, emit} = setup(); await i.midi.enable(); send.mockClear(); i.midi.setChannel(10);
    for (const msg of [[0x90,36,100],[0x89,36,80],[0x99,36,0],[0xb9,36,100],[0x99,70,100]]) emit(msg);
    expect(send).not.toHaveBeenCalled(); emit([0x99,36,127]); expect(send).toHaveBeenCalledTimes(1);
  });
  it('detaches a lost input and reconnects without duplicate triggers', async () => {
    const {i, port, access, send, emit} = setup(); await i.midi.enable(); send.mockClear();
    port.state = 'disconnected'; access.onstatechange?.({port}); emit([0x99,36,100]); expect(send).not.toHaveBeenCalled();
    port.state = 'connected'; access.onstatechange?.({port}); emit([0x99,36,100]); expect(send).toHaveBeenCalledTimes(1);
    i.midi.disconnect(); emit([0x99,36,100]); expect(send).toHaveBeenCalledTimes(1);
  });
  it('handles denied permission and retries without blocking internal sound', async () => {
    const {i, request} = setup(true); await i.midi.enable();
    expect(i.midi.controller.state).toBe('denied'); expect(i.app.host.state).toBe('running');
    request.mockResolvedValueOnce({inputs:new Map(),outputs:new Map(),onstatechange:null});
    await i.midi.enable(); expect(i.midi.controller.state).toBe('ready');
  });
  it('follows tempo and transport only when explicitly enabled', async () => {
    const {i, emit} = setup(); await i.midi.enable();
    const play = vi.spyOn(i.app, 'play').mockResolvedValue(); const stop = vi.spyOn(i.app, 'stop').mockImplementation(() => {});
    i.app.setTempo(90); emit([0xfa]); expect(play).not.toHaveBeenCalled();
    for(let n=0;n<30;n++) emit([0xf8], 100+n*(60000/120/24));
    expect(i.app.project.tempo).toBe(90);
    i.midi.setClock(true); expect(i.app.project.tempo).toBeCloseTo(120);
    emit([0xfa]); emit([0xfc]); expect(play).toHaveBeenCalledTimes(1); expect(stop).toHaveBeenCalledTimes(1);
    i.midi.setClock(false); emit([0xfb]); expect(play).toHaveBeenCalledTimes(1);
  });
});
