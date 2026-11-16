#!/usr/bin/env python3
"""Read-only upstream probe; fixtures test packaging logic, not ARM execution.

Run: python3 experiments/zacos/probe.py /path/to/Zac-OS-9 --output /tmp/zacos-probe
Optional --packages points to Debian trixie/main/binary-arm64/Packages.xz.
No desktop, privileged helpers, installer, or real Meson build is executed.
"""
import argparse
import difflib
import hashlib
import json
import lzma
import os
from pathlib import Path
import platform
import subprocess
import sys
import tempfile

COMMIT = "205cf6dcf80fd7a600a1fcfed56878eba69d241a"
SCRIPT = "tests/baseline/test_installed_files.py"
BASELINE = "tests/baseline/installed-files.txt"
PACKAGES = "libwlroots-0.18-dev qt6-base-dev qt6-base-private-dev qt6-wayland liblayershellqtinterface-dev libwayland-dev libinput-dev libdrm-dev libegl-mesa0 libgl1-mesa-dri mesa-vulkan-drivers libfribidi-dev libappmenu-gtk3-parser-dev libgcrypt20-dev libfuse3-dev meson ninja-build wayvnc seatd".split()


def run(args, **kwargs):
    result = subprocess.run(args, text=True, capture_output=True, timeout=60, **kwargs)
    return {"command": args, "returncode": result.returncode, "stdout": result.stdout, "stderr": result.stderr}


def candidate(source, baseline):
    # A candidate patch only. The cloned upstream checkout is never modified.
    patched = source.replace('\n\ndef relative(path):', '\nlibdir = options["libdir"]\nif not libdir.startswith("/"):\n    libdir = f"{prefix}/{libdir}"\n\n\ndef relative(path):\n    if path.startswith(libdir + "/"):\n        return "{libdir}" + path[len(libdir):]')
    patched = patched.replace('expected = [line for line in baseline.read_text().splitlines() if line]', 'expected = [relative(line.replace("{prefix}", prefix)\n                     .replace("{sysconfdir}", sysconfdir).replace("{libdir}", libdir))\n            for line in baseline.read_text().splitlines() if line]\n# This optional Intel Mac helper is absent on ARM and when gnu-efi is missing.\nif not any(target["name"] == "setos.efi" for target in introspect("--targets")):\n    expected = [path for path in expected if not path.endswith("/setos.efi")]')
    patched_baseline = baseline.replace('{prefix}/lib/x86_64-linux-gnu/', '{libdir}/')
    return patched, patched_baseline


def fixture(script, baseline, upstream_baseline, *, libdir, efi, omit=None):
    with tempfile.TemporaryDirectory(prefix="morrigan-zacos-fixture-") as temp:
        root = Path(temp)
        (root / "check.py").write_text(script)
        (root / "baseline.txt").write_text(baseline)
        installed = []
        for line in upstream_baseline.splitlines():
            if not line or (not efi and line.endswith('/setos.efi')) or (omit and line.endswith('/' + omit)):
                continue
            installed.append(line.replace('{prefix}', '/usr').replace('{sysconfdir}', '/etc').replace('/usr/lib/x86_64-linux-gnu/', '/usr/' + libdir + '/'))
        data = {
            '--buildoptions': [{'name': 'prefix', 'value': '/usr'}, {'name': 'sysconfdir', 'value': '/etc'}, {'name': 'libdir', 'value': libdir}, {'name': 'afterdark', 'value': 'enabled'}],
            '--installed': {str(i): path for i, path in enumerate(installed)},
            '--targets': [{'name': 'setos.efi'}] if efi else [],
        }
        (root / "meson-data.json").write_text(json.dumps(data))
        stub = root / "meson"
        stub.write_text(f'#!{sys.executable}\nimport json,sys\nfrom pathlib import Path\ndata = json.loads(Path(__file__).with_name("meson-data.json").read_text())\nprint(json.dumps(data[sys.argv[-1]]))\n')
        stub.chmod(0o755)
        return run([sys.executable, str(root / 'check.py'), str(root), str(root / 'baseline.txt')], env={**os.environ, 'PATH': str(root) + os.pathsep + os.environ.get('PATH', '')})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--packages', type=Path)
    args = parser.parse_args()
    source = args.source.resolve()
    commit = run(['git', '-C', str(source), 'rev-parse', 'HEAD'])['stdout'].strip()
    if commit != COMMIT:
        raise SystemExit(f'Expected pinned upstream {COMMIT}, found {commit}')
    original = (source / SCRIPT).read_text()
    original_baseline = (source / BASELINE).read_text()
    patched, patched_baseline = candidate(original, original_baseline)
    args.output.mkdir(parents=True, exist_ok=True)
    patch = ''.join(difflib.unified_diff(original.splitlines(True), patched.splitlines(True), fromfile='a/' + SCRIPT, tofile='b/' + SCRIPT))
    patch += ''.join(difflib.unified_diff(original_baseline.splitlines(True), patched_baseline.splitlines(True), fromfile='a/' + BASELINE, tofile='b/' + BASELINE))
    (args.output / 'arm64-installed-files.patch').write_text(patch)
    cases = [
        ('original_amd64_efi', False, 'lib/x86_64-linux-gnu', True, None, 0),
        ('original_arm64_no_efi', False, 'lib/aarch64-linux-gnu', False, None, 1),
        ('candidate_arm64_no_efi', True, 'lib/aarch64-linux-gnu', False, None, 0),
        ('candidate_amd64_efi', True, 'lib/x86_64-linux-gnu', True, None, 0),
        ('candidate_amd64_no_efi', True, 'lib/x86_64-linux-gnu', False, None, 0),
        ('candidate_plain_lib', True, 'lib', False, None, 0),
        ('candidate_missing_compositor', True, 'lib/aarch64-linux-gnu', False, 'zacos9-wm', 1),
    ]
    results = []
    for name, use_patch, libdir, efi, omit, expected in cases:
        result = fixture(patched if use_patch else original, patched_baseline if use_patch else original_baseline, original_baseline, libdir=libdir, efi=efi, omit=omit)
        results.append({'name': name, 'expected_exit': expected, 'returncode': result['returncode'], 'passed': result['returncode'] == expected, 'stdout': result['stdout'], 'stderr': result['stderr']})
    result = {'upstream': 'https://github.com/chromasystemprofessional/Zac-OS-9', 'commit': commit, 'host_machine': platform.machine(), 'scope': 'Source and synthetic Meson metadata fixture tests; NOT an ARM64 build or Pi test', 'fixtures': results}
    if args.packages:
        packages = {}
        with lzma.open(args.packages, 'rt') as stream:
            block = {}
            for line in stream:
                if line == '\n':
                    if block.get('Package') in PACKAGES:
                        packages[block['Package']] = {key: block.get(key) for key in ('Version', 'Architecture')}
                    block = {}
                elif ':' in line and not line.startswith(' '):
                    key, value = line.split(':', 1)
                    block[key] = value.strip()
        result['arm64_index'] = {'url': 'https://deb.debian.org/debian/dists/trixie/main/binary-arm64/Packages.xz', 'sha256': hashlib.sha256(args.packages.read_bytes()).hexdigest(), 'packages': packages, 'missing': sorted(set(PACKAGES) - set(packages))}
    result['upstream_static_tests'] = [run([sys.executable, str(source / test), str(source)]) for test in ['tests/baseline/test_packaging.py', 'tests/privacy/test_no_tracking.py']]
    (args.output / 'report.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result, indent=2))
    return 0 if all(case['passed'] for case in results) and all(test['returncode'] == 0 for test in result['upstream_static_tests']) else 1


if __name__ == '__main__':
    raise SystemExit(main())
