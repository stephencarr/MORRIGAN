/** MIDI learn adds a small setup dialog and a temporary control-picking strip. SPDX-License-Identifier: GPL-3.0-only */
import type { App } from '../app/app';
import { sourceLabel } from '../midi/learn';
import { buttons, closeDialog, confirmDialog, dialog } from './dialogs';
import { h } from './widgets';

const refreshDialogs = new WeakMap<App, () => void>();

export function midiLearnDialog(app: App): void {
  app.midiLearn.cancel();
  const box = dialog('MIDI LEARN', 620);
  box.dataset.test = 'midi-learn-dialog';
  h('p', '', box, 'Enable MIDI and select an input. Choose a control here or on screen, then move a CC knob/fader or press a MIDI button. Choosing and assigning a control never activates it.');
  const status = h('p', 'hint', box);
  const enable = h('button', 'mbutton', box, 'ENABLE MIDI');
  enable.addEventListener('click', () => void app.midi.enable());
  const inputLabel = h('label', 'col', box, 'MIDI INPUT');
  const input = h('select', 'num', inputLabel);
  input.setAttribute('aria-label', 'MIDI input');
  input.addEventListener('change', () => app.midi.selectInput(input.value || null));
  const targetLabel = h('label', 'col', box, 'CONTROL');
  const target = h('select', 'num', targetLabel);
  target.setAttribute('aria-label', 'MIDI learn control');
  for (const t of app.midiLearn.catalog()) {
    const option = h('option', '', target, t.label);
    option.value = t.id;
  }
  h('p', 'hint', box, 'Synthesis assignments edit the BASE kit, including its LXR FX. Mixer assignments stay with their track. They are saved in this browser, separately from projects. Tempo follows external clock while FOLLOW INCOMING CLOCK is enabled.');
  h('p', 'hint', box, 'Play/Stop, Play and Stop accept Note or momentary CC buttons. After assigning, release and press again to perform the action. Continuous controls use absolute CC knobs/faders. One assignment per source and destination; relative encoders and CC 120–127 are not supported.');
  const actions = h('div', 'btnrow', box);
  const pick = h('button', 'mbutton', actions, 'CHOOSE ON SCREEN');
  const learn = h('button', 'mbutton default', actions, 'LEARN CONTROL');
  const ready = () => app.midi.state === 'ready' && app.midi.access.inputReady;
  pick.addEventListener('click', () => { if (ready()) { closeDialog(); app.midiLearn.start(); } });
  learn.addEventListener('click', () => { if (ready()) { closeDialog(); app.midiLearn.start(target.value); } });
  h('h3', '', box, 'ASSIGNMENTS');
  const assignments = h('div', 'midi-assignments', box);
  const [clear] = buttons(box, [
    ['CLEAR ALL', () => confirmDialog('CLEAR MIDI ASSIGNMENTS', 'Remove all saved MIDI learn assignments?', 'CLEAR', () => { app.midiLearn.clear(); midiLearnDialog(app); })],
    ['DONE', closeDialog, true],
  ]);
  const refresh = () => {
    if (!box.isConnected) { refreshDialogs.delete(app); return; }
    const m = app.midi;
    status.textContent = !m.supported ? 'WEB MIDI IS UNAVAILABLE. USE CHROME OR EDGE OVER HTTPS.' : m.state === 'denied' ? 'MIDI PERMISSION WAS DENIED. ALLOW MIDI IN YOUR BROWSER’S SITE SETTINGS AND TRY AGAIN.' : m.state === 'ready' ? (m.access.inputReady ? 'INPUT CONNECTED' : 'CONNECT AND SELECT A MIDI INPUT') : 'MIDI MUST BE ENABLED FOR THIS SESSION';
    enable.hidden = m.state === 'ready';
    enable.disabled = !m.supported || m.state === 'pending';
    input.replaceChildren();
    h('option', '', input, 'NONE').value = '';
    for (const port of m.inputs()) {
      const option = h('option', '', input, port.name + (port.connected ? '' : ' (disconnected)'));
      option.value = port.id;
    }
    input.value = m.prefs.inId ?? '';
    pick.disabled = learn.disabled = !ready();
    clear!.disabled = app.midiLearn.bindings.length === 0;
    assignments.replaceChildren();
    const targets = app.midiLearn.catalog();
    if (!app.midiLearn.bindings.length) h('p', 'hint', assignments, 'NO ASSIGNMENTS YET');
    for (const b of app.midiLearn.bindings) {
      const row = h('div', 'row', assignments);
      const name = m.inputs().find((p) => p.id === b.device)?.name ?? 'Saved device (not connected)';
      h('span', 'grow', row, `${targets.find((t) => t.id === b.target)?.label ?? 'Unavailable track/control'} ← ${name} · ${sourceLabel(b)}`);
      const remove = h('button', 'mbutton', row, 'REMOVE');
      remove.setAttribute('aria-label', `Remove ${b.target}`);
      remove.addEventListener('click', () => app.midiLearn.remove(b.target));
    }
  };
  refreshDialogs.set(app, refresh);
  refresh();
}

export function installMidiLearn(app: App, chrome: HTMLElement): void {
  const strip = h('div', 'row midi-learn-strip', chrome);
  strip.dataset.test = 'midi-learn-strip';
  const status = h('span', 'grow', strip);
  status.setAttribute('role', 'status');
  const cancel = h('button', 'mbutton', strip, 'CANCEL (ESC)');
  cancel.addEventListener('click', () => app.midiLearn.cancel());
  let hovered: HTMLElement | null = null;
  const highlight = () => {
    const learn = app.midiLearn;
    for (const control of document.querySelectorAll<HTMLElement>('[data-midi-target], [data-midi-selected]')) {
      control.toggleAttribute('data-midi-selected', learn.active && !!learn.pending && control.dataset.midiTarget === learn.pending);
    }
  };
  const observer = new MutationObserver(highlight);
  const describe = () => {
    const learn = app.midiLearn, catalog = learn.catalog();
    const selected = catalog.find((t) => t.id === learn.pending);
    const pointed = hovered?.isConnected && catalog.find((t) => t.id === hovered!.dataset.midiTarget);
    const instruction = selected ? `${selected.trigger ? 'PRESS A MIDI BUTTON' : 'MOVE A MIDI KNOB'} → ${selected.label}` : 'MIDI LEARN · CLICK AN OUTLINED CONTROL';
    status.textContent = pointed && pointed !== selected ? `${instruction} · POINTING AT ${pointed.label} (CLICK TO SELECT)` : instruction;
  };
  const refresh = () => {
    const learn = app.midiLearn;
    if (learn.active) chrome.insertBefore(strip, chrome.querySelector('#transport'));
    else strip.remove();
    document.body.classList.toggle('midi-learning', learn.active);
    if (learn.active) observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-midi-target'] });
    else observer.disconnect();
    if (!learn.active) hovered = null;
    highlight(); describe();
    refreshDialogs.get(app)?.();
  };
  app.on('midi', refresh);
  refresh();
  const controlAt = (target: EventTarget | null) => target instanceof Element ? target.closest<HTMLElement>('[data-midi-target]') : null;
  for (const event of ['pointerover', 'focusin'] as const) document.addEventListener(event, (e) => {
    if (!app.midiLearn.active) return;
    hovered = controlAt(e.target); describe();
  }, true);
  document.addEventListener('pointerout', (e) => {
    if (!app.midiLearn.active) return;
    hovered = controlAt(e.relatedTarget); describe();
  }, true);
  let captured = false;
  for (const event of ['pointerdown', 'pointerup', 'click', 'dblclick', 'contextmenu', 'wheel'] as const) {
    document.addEventListener(event, (e) => {
      const control = controlAt(e.target);
      if (event === 'pointerdown') captured = !!(app.midiLearn.active && control);
      if (!captured && !(app.midiLearn.active && control)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if ((event === 'pointerdown' || event === 'click') && control && app.midiLearn.active) app.midiLearn.start(control.dataset.midiTarget);
      if (event === 'click') captured = false;
    }, { capture: true, passive: false });
  }
  document.addEventListener('pointercancel', () => { captured = false; }, true);
  document.addEventListener('keydown', (e) => {
    if (!app.midiLearn.active) return;
    if (e.key === 'Escape') {
      e.preventDefault(); e.stopImmediatePropagation(); app.midiLearn.cancel();
    } else if ((e.target as Element).closest('[data-midi-target]')) {
      e.preventDefault(); e.stopImmediatePropagation();
      if (e.key === 'Enter' || e.key === ' ') app.midiLearn.start((e.target as Element).closest<HTMLElement>('[data-midi-target]')!.dataset.midiTarget);
    }
  }, true);
}
