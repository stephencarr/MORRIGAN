#!/usr/bin/env python3
"""Compare production bridge with independent direct-libpd original-patch renders."""
from __future__ import annotations
import argparse
import array
import hashlib
import json
import math
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import wave

ROOT=Path(__file__).resolve().parents[3]
MOBILE=ROOT/'mobile'


def original_parameters(source):
    patch=(source/'_LIRA-8.pd').read_text()
    indices={int(index):name for index,name in re.findall(r'gui\.link [^ ]+ (\d+) ([\w-]+);',patch)}
    values=[float(value.strip(';')) for value in (source/'parameters.txt').read_text().splitlines()]
    assert sorted(indices)==list(range(1,48)) and len(values)==47
    factory={indices[index]:values[index-1] for index in range(1,48)}
    ranges={}
    for kind,body in re.findall(r'#X obj \S+ \S+ (tgl|hradio|vradio|hsl|vsl) ([^;]+);',patch):
        words=body.split()
        receiver=next((word for word in words if word.startswith(r'\$0-r-')),None)
        if receiver:
            name=receiver[6:]
            ranges[name]=1 if kind=='tgl' else int(words[3])-1 if kind.endswith('radio') else float(words[3])
    assert all(name in ranges for name in factory),set(factory)-set(ranges)
    return factory,ranges


def calibration(factory):
    result={name:0 for name in factory}
    for voice in range(1,9): result[f'tune-{voice}']=64
    for pair in ('12','34','56','78'): result[f'fast-{pair}']=result[f'source-{pair}']=1
    result['pitch-1234']=result['pitch-5678']=result['vol']=64
    return result


def write_defaults(path,values):
    path.write_text(''.join(f'{name} {value:.9g}\n' for name,value in values.items())+
                    ''.join(f'sensor-{voice} 0\n' for voice in range(1,9)))


def load(path):
    values=array.array('f'); values.frombytes(path.read_bytes())
    if sys.byteorder!='little': values.byteswap()
    return values


def wav(path,values):
    pcm=array.array('h',(round(max(-1,min(1,value))*32767) for value in values))
    if sys.byteorder!='little': pcm.byteswap()
    with wave.open(str(path),'wb') as out:
        out.setparams((2,2,48000,0,'NONE','not compressed')); out.writeframes(pcm.tobytes())


def stats(values):
    if not values or not all(math.isfinite(value) for value in values): raise AssertionError('Empty/nonfinite recording')
    return {'frames':len(values)//2,'rms':math.sqrt(sum(value*value for value in values)/len(values)),
            'peak':max(abs(value) for value in values)}


def render(binary,source,output,name,backend,defaults,events,ticks):
    defaults_file=output/f'{name}-defaults.txt'; write_defaults(defaults_file,defaults)
    events_file=output/f'{name}-events.txt'
    events_file.write_text(''.join(f'{tick} {control} {value:.9g}\n' for tick,control,value in events))
    raw=output/f'{name}.f32'
    with tempfile.TemporaryDirectory(prefix='morrigan-audio-reference-') as temp:
        patch=Path(temp)/'lira'; shutil.copytree(source,patch)
        command=[str(binary),backend,str(patch),str(defaults_file),str(events_file),str(ticks),str(raw),str(output/f'{name}-meta.txt')]
        with (output/f'{name}.log').open('w') as log:
            subprocess.run(command,stdout=log,stderr=subprocess.STDOUT,check=True,timeout=60)
    values=load(raw); wav(output/f'{name}.wav',values)
    return values


def difference(left,right):
    assert len(left)==len(right)
    diff=[a-b for a,b in zip(left,right)]
    return {'max_absolute_difference':max(abs(x) for x in diff),
            'rms_difference':math.sqrt(sum(x*x for x in diff)/len(diff)),
            'identical_samples':sum(a==b for a,b in zip(left,right)), 'total_samples':len(left)}


def texture(values):
    """Gain-independent adjacent-sample energy; a modest texture diagnostic."""
    mono=values[::2]
    rms=math.sqrt(sum(value*value for value in mono)/len(mono))
    derivative=math.sqrt(sum((right-left)**2 for left,right in zip(mono,mono[1:]))/(len(mono)-1))
    return {'rms':rms,'normalized_first_difference':derivative/rms if rms else 0}


def cross_modulation(binary,source,output,safe_factory):
    pairs=('12','34','56','78')
    # Keep held voices, tunes and source routes identical. Bypass the output
    # effects so the demonstration exposes voice cross-modulation itself.
    initial=[(0,name,value) for name,value in
             {'vol':32,'drv':0,'dst-mix':0,'del-mix':0,'feedback':0,'vibrato':0,'switch':0,'total-fb':0}.items()]
    initial += [(0,f'source-{pair}',0) for pair in pairs]
    initial += [(0,f'mod-{pair}',0) for pair in pairs]
    initial += [(0,f'sensor-{voice}',1) for voice in range(1,9)]
    events=list(initial)
    for tick,value in ((1500,48),(3000,96),(4500,0)):
        events += [(tick,f'mod-{pair}',value) for pair in pairs]
    events += [(6000,f'sensor-{voice}',0) for voice in range(1,9)]
    baseline=[(tick,name,0 if name.startswith('mod-') else value) for tick,name,value in events]
    production=render(binary,source,output,'cross-modulation-morrigan','production',safe_factory,events,6375)
    reference=render(binary,source,output,'cross-modulation-reference','reference',safe_factory,events,6375)
    dry=render(binary,source,output,'cross-modulation-mod-zero-baseline','reference',safe_factory,baseline,6375)
    match=difference(production,reference)
    assert match['max_absolute_difference']<1e-6,match
    prefix=difference(production[:2*48000*2],dry[:2*48000*2])
    assert prefix['max_absolute_difference']==0,'Control and baseline must start sample-identical'
    sections=[]
    for start,end,value in ((0,2,0),(2,4,48),(4,6,96),(6,8,0)):
        first=round((start+0.15)*48000)*2; last=round((end-0.05)*48000)*2
        observed=production[first:last]; original_dry=dry[first:last]
        delta=difference(observed,original_dry)
        active_texture=texture(observed); dry_texture=texture(original_dry)
        if value:
            assert delta['rms_difference']>0.0001,('MOD must measurably affect the held voices',value,delta)
        sections.append({'seconds':[start,end],'mod_all_four_pairs':value,
                         'difference_from_identically_timed_mod_zero_baseline':delta,
                         'production_texture':active_texture,'baseline_texture':dry_texture})
    strongest=sections[2]
    roughness_change=abs(strongest['production_texture']['normalized_first_difference']-
                         strongest['baseline_texture']['normalized_first_difference'])
    relative_change=roughness_change/strongest['baseline_texture']['normalized_first_difference']
    assert relative_change>0.05,('High MOD should change normalized waveform texture by over 5%, not merely gain',relative_change)
    return {'production':stats(production),'original_reference':stats(reference),'difference':match,
            'first_two_seconds_match_baseline':prefix,'sections':sections,
            'normalized_texture_change_at_mod_96':roughness_change,
            'normalized_texture_relative_change_at_mod_96':relative_change,
            'settings':{'held_voices':'all eight','source_all_pairs':0,'source_labels':['34','12','78','56'],
                        'switch':0,'total-fb':0,'master_vol':32,'drv':0,'dst-mix':0,'del-mix':0,
                        'feedback':0,'vibrato':0,'other_parameters':'original factory'},
            'release_seconds':[8,8.5],
            'interpretation':'Only MOD changes at 2, 4 and 6 seconds; the control run holds MOD=0 throughout. No normalization. This proves original-Pd voice cross-modulation, not an exact SOMA hardware model.'}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source',type=Path,default=MOBILE/'.cache/LIRA-8/LIRA-8_Pd_Standalone')
    parser.add_argument('--binary',type=Path,default=MOBILE/'.cache/host-build/morrigan_audio_compare')
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args(); source=args.source.resolve(); output=args.output.resolve()
    if output.exists(): raise SystemExit('Choose a new output directory')
    output.mkdir(parents=True)
    factory,ranges=original_parameters(source)
    header=(MOBILE/'app/src/main/cpp/lira_factory.h').read_text()
    table={name:(int(maximum),float(value.removesuffix('f'))) for name,maximum,value in
           re.findall(r'\{"([\w-]+)",(\d+),([\d.]+f?)\}',header)}
    assert len(table)==47
    assert all(table[name]==(ranges[name],value) for name,value in factory.items()),'Native table must match actual original preset/ranges'
    assert ranges['vibrato']==1
    safe_factory={**factory,'vol':64}
    old=calibration(factory)
    events=[]; tick=375
    for voice in range(1,9):
        events.extend([(tick,f'sensor-{voice}',1),(tick+375,f'sensor-{voice}',0)])
        tick+=750
    for voice in range(1,9): events.append((tick,f'sensor-{voice}',1))
    tick+=750
    for voice in range(1,9): events.append((tick,f'sensor-{voice}',0))
    ticks=tick+1500
    production=render(args.binary.resolve(),source,output,'factory-production','production',safe_factory,events,ticks)
    reference=render(args.binary.resolve(),source,output,'factory-original-reference','reference',safe_factory,events,ticks)
    old_audio=render(args.binary.resolve(),source,output,'previous-dry-calibration','reference',old,events,ticks)
    factory_difference=difference(production,reference)
    assert factory_difference['max_absolute_difference']<1e-6, factory_difference
    old_difference=difference(old_audio,reference)
    assert old_difference['rms_difference']>0.005,'Calibration preset must demonstrate actual tonal change'
    # Every exposed module parameter is exercised against the raw original engine.
    sweep=[(0,'vol',32)]+[(0,f'sensor-{voice}',1) for voice in range(1,9)]
    tick=375
    for name,value in factory.items():
        if name=='vol': replacement=48
        elif ranges[name]<=2: replacement=(int(value)+1)%(int(ranges[name])+1)
        else: replacement=96 if value<64 else 24
        sweep.extend([(tick,name,replacement),(tick+150,name,32 if name=='vol' else value)])
        tick+=300
    sweep.sort(key=lambda event:event[0])
    production_sweep=render(args.binary.resolve(),source,output,'modules-production','production',safe_factory,sweep,tick+375)
    reference_sweep=render(args.binary.resolve(),source,output,'modules-original-reference','reference',safe_factory,sweep,tick+375)
    module_difference=difference(production_sweep,reference_sweep)
    assert module_difference['max_absolute_difference']<1e-6,module_difference
    crossmod=cross_modulation(args.binary.resolve(),source,output,safe_factory)
    # Convenient, unnormalised listening pairs. The original and restored
    # production pair should sound identical; old-dry exposes the preset error.
    for original,alias in [('factory-original-reference.wav','reference.wav'),
                           ('factory-production.wav','morrigan.wav'),
                           ('factory-production.wav','restored-factory.wav'),
                           ('previous-dry-calibration.wav','old-dry.wav')]:
        shutil.copy2(output/original,output/alias)
    result={'status':'VERIFIED','scope':'Independent direct-libpd original-patch reference versus production native adapter; same pinned Pd/source/settings/sample schedule on host, not Pixel hardware or standalone-GUI comparison',
            'source_patch_sha256':hashlib.sha256((source/'_LIRA-8.pd').read_bytes()).hexdigest(),
            'source_parameters_sha256':hashlib.sha256((source/'parameters.txt').read_bytes()).hexdigest(),
            'factory_parameters':factory,'application_deviation':{'vol':64,'sensors':'released'},
            'factory':{'production':stats(production),'original_reference':stats(reference),'difference':factory_difference},
            'all_47_parameters':{'production':stats(production_sweep),'original_reference':stats(reference_sweep),'difference':module_difference},
            'previous_dry_calibration':{'metrics':stats(old_audio),'difference_from_factory':old_difference},
            'cross_modulation':crossmod,
            'vibrato_is_binary':True,
            'listening_files':{'original_reference':'reference.wav','production':'morrigan.wav',
                               'previous_dry_preset':'old-dry.wav','restored_factory_preset':'restored-factory.wav',
                               'cross_modulation_reference':'cross-modulation-reference.wav',
                               'cross_modulation_production':'cross-modulation-morrigan.wav',
                               'cross_modulation_control_baseline':'cross-modulation-mod-zero-baseline.wav'},
            'listening_note':'No loudness normalization. Factory/dry listening pairs use master vol=64; the isolated cross-modulation demonstration uses vol=32 and bypasses output effects.'}
    (output/'report.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(result,indent=2))


if __name__=='__main__': main()
