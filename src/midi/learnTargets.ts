/** Stable targets use the existing CLATTER setters and audio engine. SPDX-License-Identifier: GPL-3.0-only */
import type { App } from '../app/app';
import { VOICE_PARAMS, FX_PARAMS, VOICES } from '../sound/lxrParams';
import type { LearnTarget } from './learn';

export function learnTargets(app: App): LearnTarget[] {
  const targets: LearnTarget[] = [
    { id: 'tempo', label: 'TEMPO', min: 30, max: 300, step: 1, get: () => app.project.tempo, set: (v) => { if (!app.midi.prefs.clockIn) app.setTempo(v); } },
    { id: 'master:volume', label: 'MASTER · VOLUME', min: 0, max: 1, step: 0.001, get: () => app.project.master.volume, set: (v) => app.setMaster({ volume: v }, 'MIDI MASTER') },
  ];
  const seen = new Set<number>();
  for (const p of [...VOICE_PARAMS.flat(), ...FX_PARAMS]) {
    if (seen.has(p.id) || p.kind === 'target') continue;
    seen.add(p.id);
    targets.push({
      id: `param:${p.id}`, label: `${p.voice === undefined ? 'LXR FX' : VOICES[p.voice]} · ${p.group} · ${p.label} (BASE)`,
      min: 0, max: p.max, step: 1, get: () => app.project.kit.synth.params[p.id] ?? 0,
      set: (v) => app.setParam(p.id, v, `MIDI ${p.label}`),
    });
  }
  for (const track of app.project.tracks) {
    for (const key of ['volume', 'pan', 'filter', 'send'] as const) {
      targets.push({
        id: `track:${track.id}:${key}`, label: `${track.name} · ${key.toUpperCase()}`,
        min: key === 'pan' || key === 'filter' ? -1 : 0, max: 1, step: 0.001,
        get: () => track.mix[key] ?? 0, set: (v) => app.setTrackMix(track.id, { [key]: v }, `MIDI ${key.toUpperCase()}`),
      });
    }
  }
  return targets;
}
