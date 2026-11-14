/** Mouse-accessible setup and feedback for the fixed Mk2 sequencer profile.
 * SPDX-License-Identifier: GPL-3.0-only
 */
import type { App } from '../app/app';
import { buttons, closeDialog, dialog } from './dialogs';
import { h } from './widgets';

const refreshDialogs = new WeakMap<App, () => void>();
export function lcxlDialog(app: App): void {
  const c = app.lcxl;
  const box = dialog('LAUNCH CONTROL XL MK2', 620);
  box.dataset.test = 'lcxl-dialog';
  h('p', '', box, 'A built-in sequencer profile: no button learning. Enable it to select the Mk2’s Factory Template 1. Allow MIDI and SysEx access when your browser asks.');
  const makeSelect = (label: string) => {
    const row = h('label', 'col', box, label);
    const select = h('select', 'num', row);
    select.setAttribute('aria-label', label);
    return select;
  };
  const input = makeSelect('LCXL input'), output = makeSelect('LCXL LED output');
  h('p', '', box, 'SEND SELECT ↑/↓ moves track focus. TRACK SELECT ←/→ pages through the pattern. The upper row edits steps 1–8; the lower row edits 9–16. Tap and release to add/remove a hit. Hold a step and turn a learned synth knob to write a parameter lock.');
  h('p', 'hint', box, 'Locks use the held step’s voice; matching parameters work across voices. An empty step gets a hit when locked. Release returns knobs to normal control. Tempo, mixer and global FX are not step-lock targets. Inspect or remove locks in STEP SOUND.');
  h('p', 'hint', box, 'OFF: empty · GREEN: hit · AMBER: modifier/condition · RED: parameter lock/rule. The current step becomes brighter; an empty current step is yellow. Mouse edits and undo update the LEDs too.');
  h('p', 'hint', box, 'The editing page stays where you choose during playback. FOLLOW is optional. Knobs, faders and mode buttons are available to MIDI learn; the 16 step buttons and navigation arrows keep their sequencer functions. The LCXL output is used for LEDs only.');
  const message = h('p', 'hint', box);
  message.setAttribute('role', 'status');
  const row = h('div', 'btnrow', box);
  const connect = h('button', 'mbutton', row, 'ENABLE MK2 PROFILE');
  const template = h('button', 'mbutton', row, 'RETURN TO FACTORY 1');
  const disable = h('button', 'mbutton', row, 'DISABLE PROFILE');
  let busy = false;
  const refresh = () => {
    if (!box.isConnected) { refreshDialogs.delete(app); return; }
    const fill = (el: HTMLSelectElement, ports: { id: string; name: string; connected: boolean }[], id: string | null) => {
      const chosen = el.value || id;
      el.replaceChildren();
      h('option', '', el, 'AUTO-DETECT LCXL').value = '';
      for (const port of ports.filter((p) => p.connected)) h('option', '', el, port.name).value = port.id;
      el.value = ports.some((p) => p.id === chosen) ? chosen! : '';
    };
    fill(input, app.midi.inputs(), c.inputId); fill(output, app.midi.outputs(), c.outputId);
    message.textContent = !app.midi.supported ? 'This browser has no Web MIDI. Use Chrome or Edge over HTTPS.' : c.message;
    connect.disabled = busy || !app.midi.supported;
    connect.textContent = busy ? 'CONNECTING…' : c.enabled ? 'RECONNECT PROFILE' : 'ENABLE MK2 PROFILE';
    template.disabled = !c.connected;
    disable.disabled = !c.enabled;
  };
  connect.addEventListener('click', async () => {
    const inId = input.value || null, outId = output.value || null;
    busy = true; refresh();
    try { await c.enable(inId, outId); }
    finally { busy = false; refresh(); }
  });
  template.addEventListener('click', () => c.activateTemplate());
  disable.addEventListener('click', () => c.disable());
  refreshDialogs.set(app, refresh); refresh();
  buttons(box, [['DONE', closeDialog, true]]);
}

export function installLcxl(app: App, chrome: HTMLElement): void {
  const c = app.lcxl;
  const strip = h('div', 'row lcxl-strip');
  strip.dataset.test = 'lcxl-strip';
  const text = h('span', 'grow', strip);
  const button = (name: string, label: string, action: () => void) => {
    const b = h('button', 'btn small', strip, label); b.setAttribute('aria-label', name);
    b.addEventListener('click', () => { action(); refresh(); }); return b;
  };
  const previousTrack = button('LCXL previous track', '↑ TRACK', () => c.surface.moveTrack(-1));
  const nextTrack = button('LCXL next track', '↓ TRACK', () => c.surface.moveTrack(1));
  const previousPage = button('LCXL previous page', '← PAGE', () => c.surface.movePage(-1));
  const nextPage = button('LCXL next page', 'PAGE →', () => c.surface.movePage(1));
  const follow = button('LCXL follow playhead', 'FOLLOW', () => { c.surface.follow = !c.surface.follow; c.frame(); });
  button('LCXL setup', 'LCXL SETUP', () => lcxlDialog(app));
  const refresh = () => {
    if (c.enabled) chrome.insertBefore(strip, chrome.querySelector('#transport'));
    else strip.remove();
    if (c.enabled) {
      const s = c.surface.state(), start = c.surface.page * 16;
      text.textContent = `LCXL · ${s.track + 1}: ${s.trackName} · STEPS ${start + 1}–${Math.min(start + 16, s.steps)}${!c.connected ? ' · DISCONNECTED' : !c.templateReady ? ' · SELECT FACTORY 1' : ''}${c.heldMessage ? ' · ' + c.heldMessage : ''}`;
      previousTrack.disabled = s.track <= 0; nextTrack.disabled = s.track >= s.tracks - 1;
      previousPage.disabled = start <= 0; nextPage.disabled = start + 16 >= s.steps;
      follow.classList.toggle('on', c.surface.follow); follow.setAttribute('aria-pressed', String(c.surface.follow));
    }
    refreshDialogs.get(app)?.();
  };
  c.onChange(refresh);
  app.on('midi', refresh);
  for (const topic of ['selection', 'pattern', 'project', 'transport'] as const) app.on(topic, refresh);
  window.addEventListener('pagehide', () => c.disable());
  refresh();
}
