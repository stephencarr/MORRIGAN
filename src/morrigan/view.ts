import { Instrument } from './instrument';
import { midiPanel } from './midiView';
import { type PanelDocument, type PanelControl, type VoiceModule, defaultPanel, loadPanel, savePanel, repairPanel, serializePanel, parameterChoices, updateControl, reassignControl, findOverlaps, controlValue } from './panel';
import { configureEffects, silence, setDelaySend, setReverbSend, setDelay, setReverb, setInsert, getInsert, type InsertType } from './effects';
import { PAR } from '../sound/lxrParamIds';
import { formatValue, paramDef, VOICES } from '../sound/lxrParams';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag); node.className = cls; node.textContent = text; return node;
}
function button(text: string, action: () => void, cls = ''): HTMLButtonElement {
  const b = el('button', cls, text); b.type = 'button'; b.onclick = action; return b;
}
function labelled(text: string, input: HTMLElement): HTMLLabelElement {
  const l = el('label', 'field'); l.append(el('span', '', text), input); return l;
}
function numberInput(value: number, min: number, max: number, change: (value: number) => void): HTMLInputElement {
  const i = el('input'); i.type = 'number'; i.value = String(value); i.min = String(min); i.max = String(max);
  i.onchange = () => { const n = Number(i.value); if (Number.isFinite(n)) change(Math.max(min, Math.min(max, n))); }; return i;
}

export function mountInstrument(root: HTMLElement, instrument: Instrument): void {
  const app = instrument.app;
  configureEffects(app);
  let panel: PanelDocument = loadPanel();
  let design = false;
  let selectedControl: string | null = null;
  let latched = false;
  let gesture: { step: number; voice: number; used: boolean; pointer: number } | null = null;
  let lastMeter = 0;
  let frame = 0;
  const updates: (() => void)[] = [];
  const globalUpdates: (() => void)[] = [];
  const designUndo: PanelDocument[] = [];
  root.replaceChildren(); root.dataset.testid = 'morrigan';
  const shell = el('main', 'instrument'); root.append(shell);
  const header = el('header', 'masthead');
  const identity = el('div', 'identity');
  identity.append(el('span', 'eyebrow', 'SIX VOICE DRUM INSTRUMENT'), el('h1', '', 'MORRIGAN'), el('p', 'subtitle', 'Switch on. Make a little noise.'));
  const mode = button('Design panel', () => {
    design = !design; releaseEdit(); mode.textContent = design ? 'Play instrument' : 'Design panel';
    mode.setAttribute('aria-pressed', String(design)); shell.classList.toggle('designing', design); renderPanel(); renderInspector();
  }, 'mode-button'); mode.dataset.testid = 'design-mode'; mode.setAttribute('aria-pressed', 'false');
  header.append(identity, mode); shell.append(header);
  const transport = el('section', 'transport'); transport.setAttribute('aria-label', 'Transport');
  const play = button('▶ PLAY', () => {
    if (app.ui.playing) app.stop(); else void app.play().catch(report);
  }, 'play-button'); play.dataset.testid = 'transport-play';
  const tempo = numberInput(app.project.tempo, 30, 300, n => app.setTempo(n)); tempo.dataset.testid = 'tempo'; tempo.setAttribute('aria-label', 'Tempo');
  const swing = numberInput(app.project.swing, 50, 75, n => app.setSwing(n)); swing.dataset.testid = 'swing'; swing.setAttribute('aria-label', 'Swing');
  const undo = button('↶ Undo', () => app.undo(), 'quiet'); const redo = button('↷ Redo', () => app.redo(), 'quiet');
  const panic = button('Silence', () => silence(app), 'quiet'); panic.title = 'Stop all sounding voices and effect tails';
  const meter = el('div', 'meter'); meter.setAttribute('aria-label', 'Output level'); meter.append(el('i'));
  const status = el('span', 'status', 'Ready to play'); status.setAttribute('role', 'status');
  transport.append(play, labelled('TEMPO', tempo), labelled('SWING %', swing), undo, redo, panic, meter, status); shell.append(transport);
  const notice = el('div', 'notice'); notice.setAttribute('role', 'status'); shell.append(notice);
  function report(error: unknown): void { notice.textContent = error instanceof Error ? error.message : String(error); }
  app.host.onState(state => { if (state === 'failed') report(`Audio could not start: ${app.host.error}. Press Play or Hit to retry.`); });
  const midi = midiPanel(instrument.midi); shell.append(midi.element); globalUpdates.push(midi.refresh);
  function persist(next: PanelDocument): void {
    designUndo.push(panel); if (designUndo.length > 40) designUndo.shift();
    panel = repairPanel(next);
    if (!savePanel(panel)) report('The panel is active, but browser storage is unavailable. Export the panel to keep it.');
    renderPanel(); renderInspector();
  }
  const workspace = el('div', 'workspace');
  const panelScroll = el('div', 'panel-scroll');
  const voices = el('section', 'voices'); voices.setAttribute('aria-label', 'Six synthesis voices'); panelScroll.append(voices);
  const inspector = el('aside', 'inspector'); inspector.dataset.testid = 'panel-inspector';
  workspace.append(panelScroll, inspector); shell.append(workspace);
  const sequence = el('section', 'sequencer'); sequence.setAttribute('aria-label', '16 step sequencer');
  const seqHead = el('div', 'sequence-head');
  const seqTitle = el('div'); seqTitle.append(el('span', 'eyebrow', 'ONE PATTERN. SIX VOICES.'));
  const selectedLabel = el('h2', '', 'DRUM 1'); seqTitle.append(selectedLabel);
  const voiceButtons = el('div', 'voice-select');
  const selectors = Array.from({ length: 6 }, (_, v) => {
    const b = button(VOICES[v]!, () => { releaseEdit(); instrument.selectVoice(v); }, 'voice-button');
    b.dataset.testid = `voice-${v}`; b.setAttribute('aria-label', `Select ${VOICES[v]}`); voiceButtons.append(b); return b;
  });
  seqHead.append(seqTitle, voiceButtons); sequence.append(seqHead);
  const row = el('div', 'steps');
  const steps = Array.from({ length: 16 }, (_, step) => {
    const b = button(String(step + 1).padStart(2, '0'), () => {}, 'step'); b.dataset.testid = `step-${step}`;
    b.setAttribute('aria-label', `Step ${step + 1}`);
    b.onpointerdown = e => {
      if (e.button !== 0 || design) return;
      if (gesture) { gesture.used = true; return; }
      const wasLatched = latched;
      if (latched) releaseEdit();
      instrument.holdStep(step);
      gesture = { step, voice: instrument.selectedVoice, used: false, pointer: e.pointerId };
      if (e.shiftKey || wasLatched) { latched = true; gesture.used = true; }
      b.setPointerCapture(e.pointerId);
    };
    b.onpointerup = e => {
      if (!gesture || gesture.pointer !== e.pointerId) return;
      const g = gesture; gesture = null;
      if (!g.used && g.voice === instrument.selectedVoice) instrument.toggleStep(g.step);
      if (!latched) instrument.releaseStep();
    };
    b.onpointercancel = () => { gesture = null; if (!latched) instrument.releaseStep(); };
    b.onkeydown = e => {
      if (design) return;
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault();
        if (e.shiftKey) { instrument.holdStep(step); latched = true; } else instrument.toggleStep(step);
      }
    };
    // Pointer actions happen on release; keyboard actions are handled above.
    b.onclick = e => e.preventDefault(); row.append(b); return b;
  });
  sequence.append(row);
  const editBar = el('div', 'edit-bar');
  const edit = button('Edit step: off', () => {
    if (design) return;
    if (instrument.heldStep !== null) releaseEdit();
    else { instrument.holdStep(0); latched = true; }
  }, 'edit-button'); edit.dataset.testid = 'step-edit';
  const stepStatus = el('span', 'step-status', 'Tap a step to add a hit.');
  const velocity = numberInput(100, 1, 127, n => { if (!design && instrument.heldStep !== null) { consume(); instrument.setVelocity(instrument.heldStep, n); } });
  velocity.dataset.testid = 'velocity'; velocity.setAttribute('aria-label', 'Step velocity');
  const hat = el('input'); hat.type = 'checkbox'; hat.dataset.testid = 'hat-open'; hat.setAttribute('aria-label', 'Open hi-hat');
  hat.onchange = () => { if (!design && instrument.heldStep !== null) { consume(); instrument.setHatOpen(instrument.heldStep, hat.checked); } };
  const hatLabel = labelled('OPEN HAT', hat);
  editBar.append(edit, stepStatus, labelled('VELOCITY', velocity), hatLabel); sequence.append(editBar);
  sequence.append(el('p', 'gesture-help', 'Tap steps to write a beat. Shift-click a step to latch editing; turn a control to lock it. Push its × to clear. Esc releases editing. Hold + wheel or multitouch works too.'));
  shell.append(sequence);
  const masterFx = el('section', 'master-fx'); masterFx.setAttribute('aria-label', 'Global effects');
  masterFx.append(el('span', 'eyebrow', 'SHARED SPACE / LIVE CONTROLS'));
  masterFx.append(fxRange('Delay time', () => app.project.kit.synth.params[PAR.FX_P1] ?? 48, v => setDelay(app, { time: v }), 127), fxRange('Feedback', () => app.project.kit.synth.params[PAR.FX_P4] ?? 45, v => setDelay(app, { feedback: v }), 110), fxRange('Room', () => app.project.master.out?.reverb?.room ?? .55, v => setReverb(app, { room: v })), fxRange('Damping', () => app.project.master.out?.reverb?.damping ?? .45, v => setReverb(app, { damping: v })));
  shell.append(masterFx);
  const footer = el('footer');
  footer.append(el('span', '', 'Your session is temporary. Your panel stays.'));
  const credits = el('span'); credits.append('Modified CLATTER / LXR engine · ');
  const source = el('a', '', 'Source & GPL-3.0'); source.href = 'https://github.com/stephencarr/MORRIGAN';
  const original = el('a', '', 'CLATTER workspace'); original.href = './clatter.html';
  credits.append(source, ' · ', original); footer.append(credits); shell.append(footer);

  function releaseEdit(): void { gesture = null; latched = false; instrument.releaseStep(); }
  function consume(): void { if (gesture) gesture.used = true; }
  function write(v: number, control: PanelControl, value: number): void {
    if (design) return;
    consume(); instrument.setValue(v, control.param, controlValue(control, value));
  }
  function renderPanel(): void {
    updates.length = 0; voices.replaceChildren();
    const width = Math.max(24, ...panel.modules.map(m => m.x + m.width));
    const height = Math.max(15, ...panel.modules.map(m => m.y + m.height));
    voices.style.setProperty('--panel-columns', String(width));
    voices.style.height = `${height * 50}px`;
    for (const m of panel.modules) {
      const strip = el('article', 'voice-strip'); strip.dataset.voice = String(m.voice);
      strip.style.left = `${m.x / width * 100}%`; strip.style.width = `${m.width / width * 100}%`;
      strip.style.top = `${m.y * 50}px`; strip.style.height = `${m.height * 50}px`;
      const stripHead = el('div', 'strip-head');
      const voiceId = el('span', 'voice-number', String(m.voice + 1).padStart(2, '0'));
      const name = button(m.label, () => { if (design) return; releaseEdit(); instrument.selectVoice(m.voice); }, 'strip-name');
      stripHead.append(voiceId, name);
      const hit = button('● Hit', () => { void instrument.audition(m.voice).catch(report); }, 'hit-button'); hit.setAttribute('aria-label', `Audition ${VOICES[m.voice]}`);
      const mute = button('M', () => { if (design) return; const t = app.project.tracks[m.voice]!; app.setTrackMix(t.id, { mute: !t.mix.mute }); }, 'mute-button'); mute.setAttribute('aria-label', `Mute ${VOICES[m.voice]}`);
      stripHead.append(hit, mute); strip.append(stripHead);
      const controlArea = el('div', 'control-area'); strip.append(controlArea);
      for (const c of m.controls) controlArea.append(renderControl(m, c));
      strip.append(renderVoiceFx(m.voice));
      voices.append(strip);
      updates.push(() => { strip.classList.toggle('selected', instrument.selectedVoice === m.voice); mute.setAttribute('aria-pressed', String(app.project.tracks[m.voice]!.mix.mute)); });
    }
  }

  function fxRange(label: string, get: () => number, set: (value: number) => void, max = 1, voice?: number): HTMLLabelElement {
    const input = el('input'); input.type = 'range'; input.min = '0'; input.max = String(max); input.step = max === 1 ? '.01' : '1'; input.value = String(get());
    input.setAttribute('aria-label', voice === undefined ? label : `${VOICES[voice]} ${label}`);
    input.oninput = () => { if (!design) { consume(); set(Number(input.value)); } };
    input.onpointerdown = () => { if (!design) app.beginDrag(label); };
    input.onpointerup = input.onpointercancel = () => { if (!design) app.endDrag(); };
    const update = () => { input.disabled = design; if (document.activeElement !== input) input.value = String(get()); };
    (voice === undefined ? globalUpdates : updates).push(update);
    return labelled(label.toUpperCase(), input);
  }
  function renderVoiceFx(voice: number): HTMLElement {
    const fx = el('div', 'fx-strip');
    const type = el('select'); type.setAttribute('aria-label', `${VOICES[voice]} Insert`);
    for (const [value, label] of [['off', 'INSERT / OFF'], ['saturation', 'SATURATION'], ['crush', 'BIT CRUSH'], ['transient', 'TRANSIENT']]) {
      const o = el('option', '', label); o.value = value!; type.append(o);
    }
    type.onchange = () => { if (!design) { const cur = getInsert(app, voice); consume(); setInsert(app, voice, type.value as InsertType, cur.a, cur.b); } };
    fx.append(type);
    const a = fxRange('Insert A', () => getInsert(app, voice).a, v => { const cur = getInsert(app, voice); setInsert(app, voice, cur.type, v, cur.b); }, 1, voice);
    const b = fxRange('Insert B', () => getInsert(app, voice).b, v => { const cur = getInsert(app, voice); setInsert(app, voice, cur.type, cur.a, v); }, 1, voice);
    fx.append(a, b, fxRange('Delay send', () => app.project.tracks[voice]!.mix.send ?? 0, v => setDelaySend(app, voice, v), 1, voice), fxRange('Reverb send', () => app.project.tracks[voice]!.mix.reverbSend ?? 0, v => setReverbSend(app, voice, v), 1, voice));
    updates.push(() => {
      const current = getInsert(app, voice); type.value = current.type; type.disabled = design;
      const labels = current.type === 'saturation' ? ['DRIVE', 'MIX'] : current.type === 'crush' ? ['BITS', 'RATE'] : current.type === 'transient' ? ['ATTACK', 'SUSTAIN'] : ['INSERT A', 'INSERT B'];
      a.querySelector('span')!.textContent = labels[0]!; b.querySelector('span')!.textContent = labels[1]!;
      a.querySelector('input')!.disabled = b.querySelector('input')!.disabled = design || current.type === 'off';
    });
    fx.title = 'Live mixer controls: these do not create step locks.';
    return fx;
  }

  function renderControl(m: VoiceModule, c: PanelControl): HTMLElement {
    const def = paramDef(c.param)!;
    const box = el('div', `control control-${c.type}`); box.dataset.testid = `panel-control-${c.id}`;
    box.style.left = `${c.x / m.width * 100}%`; box.style.top = `${c.y / m.height * (m.height * 50 - 235)}px`;
    box.style.width = `${c.width / m.width * 100}%`; box.style.height = `${c.height / m.height * (m.height * 50 - 235)}px`;
    const title = el('span', 'control-label', c.label); const readout = el('output', 'control-value');
    const label = `${VOICES[m.voice]} ${c.label}`;
    let input: HTMLElement;
    let refreshInput: (v: number) => void;
    if (c.type === 'select') {
      const select = el('select', 'parameter-select');
      const values = def.options ? def.options.map((label, value) => ({ value, label })).filter(o => o.value >= c.min && o.value <= c.max) : Array.from({ length: Math.floor((c.max - c.min) / c.step) + 1 }, (_, i) => ({ value: c.min + i * c.step, label: String(c.min + i * c.step) }));
      for (const option of values) { const o = el('option', '', option.label); o.value = String(option.value); select.append(o); }
      select.onchange = () => write(m.voice, c, Number(select.value)); input = select;
      refreshInput = v => { select.value = String(v); select.disabled = design; };
    } else if (c.type === 'toggle') {
      const toggle = button('OFF', () => write(m.voice, c, instrument.value(m.voice, c.param) >= (c.max + c.min) / 2 ? c.min : c.max), 'parameter-toggle'); input = toggle;
      refreshInput = v => { toggle.textContent = v >= (c.max + c.min) / 2 ? 'ON' : 'OFF'; toggle.setAttribute('aria-pressed', String(v >= (c.max + c.min) / 2)); };
    } else if (c.type === 'slider') {
      const range = el('input', 'parameter-range'); range.type = 'range'; range.min = String(c.min); range.max = String(c.max); range.step = String(c.step);
      range.oninput = () => write(m.voice, c, c.inverted ? c.max + c.min - Number(range.value) : Number(range.value));
      range.onpointerdown = () => { if (!design) app.beginDrag(c.label); };
      range.onpointerup = range.onpointercancel = () => { if (!design) app.endDrag(); };
      input = range; refreshInput = v => { range.value = String(c.inverted ? c.max + c.min - v : v); range.disabled = design; };
    } else {
      const knob = el('div', 'knob'); knob.tabIndex = 0; knob.setAttribute('role', 'slider');
      knob.setAttribute('aria-valuemin', String(c.min)); knob.setAttribute('aria-valuemax', String(c.max));
      knob.append(el('i', 'knob-mark'));
      let drag: { y: number; value: number; pointer: number } | null = null;
      const delta = (n: number) => write(m.voice, c, Math.max(c.min, Math.min(c.max, instrument.value(m.voice, c.param) + n * c.step * (c.inverted ? -1 : 1))));
      knob.onwheel = e => { if (design) return; e.preventDefault(); delta(e.deltaY < 0 ? 1 : -1); };
      knob.onkeydown = e => {
        if (design) return;
        if (['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft', 'Home', 'End', 'Delete', 'Backspace'].includes(e.key)) {
          e.preventDefault();
          if (e.key === 'Delete' || e.key === 'Backspace') { consume(); instrument.clearLock(m.voice, c.param); }
          else if (e.key === 'Home' || e.key === 'End') write(m.voice, c, e.key === 'Home' ? c.min : c.max);
          else delta((e.key === 'ArrowUp' || e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 8 : 1));
        }
      };
      knob.onpointerdown = e => { if (e.button !== 0 || design) return; e.preventDefault(); knob.focus(); knob.setPointerCapture(e.pointerId); drag = { y: e.clientY, value: instrument.value(m.voice, c.param), pointer: e.pointerId }; app.beginDrag(c.label); };
      knob.onpointermove = e => { if (!drag || e.pointerId !== drag.pointer) return;
        const movement = Math.round((drag.y - e.clientY) / 3) * c.step * (c.inverted ? -1 : 1);
        write(m.voice, c, Math.max(c.min, Math.min(c.max, drag.value + movement)));
      };
      const finish = () => { if (drag) { drag = null; app.endDrag(); } };
      knob.onpointerup = knob.onpointercancel = knob.onlostpointercapture = finish;
      knob.ondblclick = () => { if (!design) { consume(); instrument.clearLock(m.voice, c.param); } };
      input = knob;
      refreshInput = v => { knob.style.setProperty('--angle', `${-135 + Math.max(0, Math.min(1, (v - c.min) / Math.max(1, c.max - c.min))) * 270}deg`); knob.setAttribute('aria-valuenow', String(v)); knob.setAttribute('aria-valuetext', formatValue(def, v)); };
    }
    input.setAttribute('aria-label', label);
    const clear = button('×', () => { if (!design) { consume(); instrument.clearLock(m.voice, c.param); } }, 'clear-lock'); clear.setAttribute('aria-label', `Clear ${label} lock`); clear.title = 'Push encoder: clear this step lock';
    box.append(title, input, readout, clear);
    box.addEventListener('click', e => { if (!design) return; e.preventDefault(); selectedControl = c.id; renderInspector(); for (const b of voices.querySelectorAll('.control')) b.classList.toggle('chosen', b === box); }, true);
    updates.push(() => {
      const value = instrument.value(m.voice, c.param); readout.value = formatValue(def, value); refreshInput(value);
      const step = instrument.heldStep; const track = app.project.tracks[m.voice]!;
      const locked = step !== null && instrument.selectedVoice === m.voice && app.stepSound(track.id, step)?.locks?.[c.param] !== undefined;
      box.classList.toggle('locked', locked); box.classList.toggle('chosen', design && selectedControl === c.id);
      clear.disabled = !locked || design; clear.hidden = design;
    });
    return box;
  }

  function renderInspector(): void {
    inspector.replaceChildren(); inspector.hidden = !design; if (!design) return;
    inspector.append(el('span', 'eyebrow', 'DESIGN MODE'), el('h2', '', 'Make it yours'));
    inspector.append(el('p', 'inspector-help', 'Select a control to change its assignment, type or footprint. Your panel saves automatically.'));
    const module = panel.modules.find(m => m.controls.some(c => c.id === selectedControl));
    const control = module?.controls.find(c => c.id === selectedControl);
    if (module && control) {
      const c = control;
      inspector.append(el('h3', '', `${module.label} / ${c.label}`));
      const label = el('input'); label.value = c.label; label.maxLength = 24; label.setAttribute('aria-label', 'Control label');
      label.onchange = () => persist(updateControl(panel, c.id, { label: label.value })); inspector.append(labelled('LABEL', label));
      const assignment = el('select'); assignment.setAttribute('aria-label', 'Parameter assignment');
      for (const p of parameterChoices(module.voice)) { const o = el('option', '', `${p.group} · ${p.label}`); o.value = String(p.id); assignment.append(o); }
      assignment.value = String(c.param); assignment.onchange = () => persist(reassignControl(panel, c.id, Number(assignment.value))); inspector.append(labelled('PARAMETER', assignment));
      const type = el('select'); type.setAttribute('aria-label', 'Control type');
      for (const t of ['encoder', 'slider', 'toggle', 'select'] as const) { const o = el('option', '', t); o.value = t; o.disabled = t === 'select' && !paramDef(c.param)?.options; type.append(o); }
      type.value = c.type; type.onchange = () => persist(updateControl(panel, c.id, { type: type.value as PanelControl['type'] })); inspector.append(labelled('CONTROL TYPE', type));
      const dimensions = el('div', 'dimensions');
      for (const key of ['x', 'y', 'width', 'height'] as const) { const n = numberInput(c[key], key === 'width' || key === 'height' ? 1 : 0, key === 'x' || key === 'width' ? module.width : module.height, value => persist(updateControl(panel, c.id, { [key]: value }))); n.setAttribute('aria-label', `Control ${key}`); dimensions.append(labelled(key.toUpperCase(), n)); }
      inspector.append(dimensions);
      const bounds = el('div', 'dimensions');
      for (const key of ['min', 'max', 'step'] as const) { const n = numberInput(c[key], key === 'step' ? 1 : 0, paramDef(c.param)!.max, value => persist(updateControl(panel, c.id, { [key]: value }))); n.setAttribute('aria-label', `Control ${key}`); bounds.append(labelled(key.toUpperCase(), n)); }
      inspector.append(bounds);
      const inverted = el('input'); inverted.type = 'checkbox'; inverted.checked = c.inverted; inverted.disabled = c.type === 'toggle' || c.type === 'select'; inverted.onchange = () => persist(updateControl(panel, c.id, { inverted: inverted.checked })); inspector.append(labelled('REVERSE DIRECTION', inverted));
      const move = el('div', 'module-move');
      const moveModule = (direction: -1 | 1) => {
        const index = panel.modules.indexOf(module); const other = panel.modules[index + direction]; if (!other) return;
        const next = structuredClone(panel); const a = next.modules[index]!; const b = next.modules[index + direction]!;
        [a.x, b.x] = [b.x, a.x]; [a.y, b.y] = [b.y, a.y]; [next.modules[index], next.modules[index + direction]] = [b, a]; persist(next);
      };
      move.append(button('← Move strip', () => moveModule(-1)), button('Move strip →', () => moveModule(1))); inspector.append(move);
    }
    const overlap = findOverlaps(panel); if (overlap.length) inspector.append(el('p', 'overlap-warning', `${overlap.length} control overlap${overlap.length === 1 ? '' : 's'} — adjust positions for comfortable playing.`));
    const actions = el('div', 'design-actions');
    actions.append(button('Undo design', () => { const previous = designUndo.pop(); if (previous) { panel = previous; if (!savePanel(panel)) report('Panel restored, but browser storage is unavailable. Export to keep it.'); renderPanel(); renderInspector(); } }), button('Export panel', () => {
      const url = URL.createObjectURL(new Blob([serializePanel(panel)], { type: 'application/json' })); const a = el('a'); a.href = url; a.download = 'morrigan-panel.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    }));
    const file = el('input'); file.type = 'file'; file.accept = '.json,application/json'; file.hidden = true;
    file.onchange = async () => { const f = file.files?.[0]; if (!f) return; try { const data = JSON.parse(await f.text()); if (data?.format !== 'morrigan-panel' || data?.version !== 1) throw new Error('Choose a MORRIGAN panel file (version 1).'); persist(repairPanel(data)); } catch (e) { report(e); } };
    actions.append(button('Import panel', () => file.click()), file, button('Reset layout', () => { persist(defaultPanel()); selectedControl = null; renderInspector(); })); inspector.append(actions);
  }

  renderPanel(); renderInspector();
  const keydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { releaseEdit(); return; }
    if (e.target instanceof HTMLElement && (e.target.matches('input,select,textarea,[role="slider"],button') || e.target.isContentEditable)) return;
    if (e.code === 'Space') { e.preventDefault(); play.click(); }
    if (e.key >= '1' && e.key <= '6') { releaseEdit(); instrument.selectVoice(Number(e.key) - 1); }
  };
  document.addEventListener('keydown', keydown);
  const cancelHeld = () => { if (gesture) { gesture = null; if (!latched) instrument.releaseStep(); } };
  window.addEventListener('blur', cancelHeld);
  const refresh = () => {
    play.textContent = app.ui.playing ? '■ STOP' : '▶ PLAY'; play.setAttribute('aria-pressed', String(app.ui.playing));
    if (document.activeElement !== tempo) tempo.value = String(app.project.tempo);
    if (document.activeElement !== swing) swing.value = String(app.project.swing);
    undo.disabled = !app.history.canUndo; redo.disabled = !app.history.canRedo;
    status.textContent = app.ui.playing ? 'Playing / live' : 'Ready to play';
    selectedLabel.textContent = VOICES[instrument.selectedVoice]!;
    selectors.forEach((b, v) => b.setAttribute('aria-pressed', String(instrument.selectedVoice === v)));
    const held = instrument.heldStep;
    edit.textContent = held !== null ? `Editing step ${held + 1} · release` : 'Edit step: off'; edit.setAttribute('aria-pressed', String(held !== null));
    stepStatus.textContent = held !== null ? 'Turn to lock · push × to clear' : 'Tap a step to add a hit.';
    edit.disabled = design; velocity.disabled = held === null || design; hat.disabled = held === null || design; hatLabel.hidden = instrument.selectedVoice !== 5;
    if (held !== null) {
      if (document.activeElement !== velocity) velocity.value = String(app.hitAt(instrument.track.id, held)?.vel ?? 100);
      hat.checked = app.stepSound(instrument.track.id, held)?.voice === 6;
    }
    const playhead = app.playhead();
    steps.forEach((b, step) => {
      const hit = app.hitAt(instrument.track.id, step); const snd = app.stepSound(instrument.track.id, step);
      b.classList.toggle('active', !!hit); b.classList.toggle('current', !!playhead && Math.floor(playhead.step) === step);
      b.classList.toggle('editing', held === step); b.classList.toggle('has-lock', !!snd?.locks && Object.keys(snd.locks).length > 0);
      b.setAttribute('aria-pressed', String(!!hit)); b.title = `Step ${step + 1}${hit ? ` · velocity ${hit.vel}` : ' · empty'}${snd?.voice === 6 ? ' · open hat' : ''}`;
    });
    const level = Math.max(app.meters?.masterL ?? 0, app.meters?.masterR ?? 0); lastMeter = Math.max(level, lastMeter * .88);
    (meter.firstChild as HTMLElement).style.width = `${Math.min(100, Math.sqrt(lastMeter) * 100)}%`;
    for (const update of [...updates, ...globalUpdates]) update();
    frame = requestAnimationFrame(refresh);
  };
  frame = requestAnimationFrame(refresh);
  window.addEventListener('pagehide', () => { cancelAnimationFrame(frame); app.stop(); document.removeEventListener('keydown', keydown); }, { once: true });
}
