#!/usr/bin/env python3
"""Run the native acceptance test on an isolated copy: LIRA autosaves its preset."""
import argparse
from pathlib import Path
import shutil
import subprocess
import tempfile

MOBILE=Path(__file__).resolve().parents[2]

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source',type=Path,default=MOBILE/'.cache/LIRA-8/LIRA-8_Pd_Standalone')
    parser.add_argument('--binary',type=Path,default=MOBILE/'.cache/host-build/morrigan_native_test')
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args()
    output=args.output.resolve()
    if output.exists(): raise SystemExit('Choose a new output WAV path')
    output.parent.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='morrigan-native-test-') as temporary:
        patch=Path(temporary)/'lira'
        shutil.copytree(args.source,patch)
        subprocess.run([str(args.binary.resolve()),str(patch),str(output)],check=True,timeout=60)
