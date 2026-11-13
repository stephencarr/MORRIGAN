import { MIDI_DRUMS, type InstrumentMidi } from './midi';

/** A small optional connection panel, keeping performance controls immediately available. */
export function midiPanel(midi: InstrumentMidi): { element: HTMLElement; refresh(): void } {
  const element = document.createElement('details'); element.className = 'midi-panel';
  const summary = document.createElement('summary'); summary.textContent = 'MIDI input';
  const row = document.createElement('div'); row.className = 'midi-row';
  const connect = document.createElement('button'); connect.textContent = 'Enable MIDI'; connect.type = 'button';
  const ports = document.createElement('select'); ports.setAttribute('aria-label', 'MIDI input device');
  const channel = document.createElement('select'); channel.setAttribute('aria-label', 'MIDI input channel');
  for (let n = 0; n <= 16; n++) channel.add(new Option(n ? `Channel ${n}` : 'All channels', String(n)));
  const clockLabel = document.createElement('label');
  const clock = document.createElement('input'); clock.type = 'checkbox'; clock.setAttribute('aria-label', 'Follow MIDI clock');
  clockLabel.append(clock, ' Follow MIDI clock / Start / Stop');
  const status = document.createElement('p'); status.className = 'midi-status'; status.setAttribute('role', 'status');
  const mapping = document.createElement('p'); mapping.className = 'midi-help';
  mapping.textContent = MIDI_DRUMS.map(d => `${d.label}: ${d.note}`).join(' · ');
  const help = document.createElement('p'); help.className = 'midi-help';
  help.textContent = 'Connect a MIDI keyboard or drum controller, enable access, then select its input. Notes trigger drums with velocity; they do not record steps. Numbers above are MIDI notes. Clock follows tempo; it is not phase-locked sync. Controller knobs (CC) are not assigned yet.';
  row.append(connect, ports, channel, clockLabel); element.append(summary, row, status, mapping, help);
  const c = midi.controller;
  let busy = false, portKey = '';
  connect.onclick = async () => { busy = true; refresh(); try { await midi.enable(); } finally { busy = false; refresh(); } };
  ports.onchange = () => { if (ports.value) c.selectInput(ports.value); else midi.disconnect(); refresh(); };
  channel.onchange = () => midi.setChannel(Number(channel.value));
  clock.onchange = () => midi.setClock(clock.checked);
  function refresh(): void {
    const inputs = c.inputs();
    const key = JSON.stringify([inputs, c.prefs.inId]);
    if (key !== portKey) {
      portKey = key; ports.replaceChildren(new Option('No MIDI input', ''));
      for (const p of inputs) { const o = new Option(p.name + (p.connected ? '' : ' (disconnected)'), p.id); o.disabled = !p.connected; ports.add(o); }
      if (c.prefs.inId && !inputs.some(p => p.id === c.prefs.inId)) ports.add(new Option('Selected device disconnected', c.prefs.inId));
      ports.value = c.prefs.inId ?? '';
    }
    c.follower.check(performance.now());
    connect.disabled = busy || !c.supported;
    connect.textContent = busy ? 'Connecting…' : c.state === 'ready' ? 'Reconnect MIDI' : 'Enable MIDI';
    ports.disabled = c.state !== 'ready'; channel.disabled = c.state !== 'ready'; clock.disabled = !c.access.inputReady;
    channel.value = String(c.prefs.inChannel); clock.checked = c.prefs.clockIn;
    const message = midi.error || (c.state !== 'ready' ? c.access.message : c.access.inputReady ? `Connected · ${c.log.at(-1) ?? 'Waiting for notes'}${c.prefs.clockIn ? ` · Clock ${c.follower.status}` : ''}` : inputs.some(p => p.connected) ? 'Select a MIDI input.' : 'No MIDI input connected. Plug in your controller.');
    if (status.textContent !== message) status.textContent = message;
  }
  refresh(); return { element, refresh };
}
