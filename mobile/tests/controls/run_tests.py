#!/usr/bin/env python3
"""Verify the Java panel catalog against the actual pinned Pd GUI and preset."""
from pathlib import Path
import re
import shutil
import subprocess
import tempfile

mobile = Path(__file__).resolve().parents[2]
patch = mobile / '.cache/LIRA-8/LIRA-8_Pd_Standalone'
source = (patch / '_LIRA-8.pd').read_text()
values = [float(row.strip().rstrip(';')) for row in (patch / 'parameters.txt').read_text().splitlines()]
ids = {name: int(index) for index, name in re.findall(r'gui.link \\\$0 (\d+) ([\w-]+);', source)}
with tempfile.TemporaryDirectory(prefix='morrigan-control-tests-') as build:
    compiler = ['javac'] if shutil.which('javac') else ['java', 'com.sun.tools.javac.Main']
    subprocess.run([*compiler, '-d', build, str(mobile / 'app/src/main/java/org/morrigan/mobile/LiraControls.java'),
                    str(Path(__file__).with_name('ControlTests.java'))], check=True)
    output = subprocess.check_output(['java', '-cp', build, 'org.morrigan.mobile.ControlTests'], text=True)
observed = {}
for row in output.splitlines():
    if '=' in row:
        name, numbers = row.split('=')
        value, maximum = numbers.split(',')
        observed[name] = (float(value), int(maximum))
assert set(observed) == set(ids), 'Catalog must exactly cover upstream gui.link controls'
# Collapse wrapped Pd object statements before inspecting widgets.
statements = source.replace('\n', ' ').split(';')
for name, index in ids.items():
    actual, maximum = observed[name]
    assert abs(actual - values[index - 1]) < 0.00001, (name, actual, values[index - 1])
    widget = next(row for row in statements if '\\$0-r-' + name + ' ' in row and row.strip().startswith('#X obj')
                  and re.search(r'\b(vsl|hsl|tgl|hradio|vradio)\b', row))
    tokens = widget.split()
    kind = tokens[4]
    expected = 1 if kind == 'tgl' else int(tokens[8]) - 1 if kind in ('hradio', 'vradio') else 127
    assert maximum == expected, (name, kind, maximum, expected)
print(output.strip().splitlines()[-1])
print('PASS exact 47-control coverage, original preset values and native widget ranges from pinned Pd source')
