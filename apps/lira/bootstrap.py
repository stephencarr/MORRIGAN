"""Fetch pinned source and build an unprivileged, no-device Pd proof runtime."""
from __future__ import annotations
import argparse
from pathlib import Path
import subprocess

LIRA_URL = "https://github.com/MikeMorenoDSP/LIRA-8.git"
LIRA_REVISION = "6a6b6cbc3359a20d7741c9270c7690ab6b21c92a"
PD_URL = "https://github.com/pure-data/pure-data.git"
PD_REVISION = "b1ff370c87b579f80130a9cafbf27cd890e90882"  # 0.56-2


def checkout(url: str, revision: str, destination: Path) -> None:
    if not destination.exists():
        destination.mkdir(parents=True)
        subprocess.run(["git", "init", "-q", str(destination)], check=True)
        subprocess.run(["git", "-C", str(destination), "fetch", "--depth", "1", url, revision], check=True, timeout=180)
        subprocess.run(["git", "-C", str(destination), "checkout", "--detach", "FETCH_HEAD"], check=True)
    head = subprocess.check_output(["git", "-C", str(destination), "rev-parse", "HEAD"], text=True).strip()
    dirty = subprocess.check_output(["git", "-C", str(destination), "diff", "HEAD", "--name-only"], text=True).strip()
    if head != revision or dirty:
        raise RuntimeError(f"Refusing to modify unexpected source checkout: {destination}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", type=Path, default=Path(".cache/upstream"))
    parser.add_argument("--jobs", type=int, default=2)
    args = parser.parse_args()
    if not 1 <= args.jobs <= 32:
        parser.error("--jobs must be 1..32")
    root = args.directory.resolve()
    checkout(LIRA_URL, LIRA_REVISION, root / "LIRA-8")
    checkout(PD_URL, PD_REVISION, root / "pure-data")
    # Explicit dummy MIDI avoids the GNU makefile's unconditional legacy OSS
    # MIDI source (which does not compile cleanly with current C compilers).
    subprocess.run(["make", "-f", "makefile.gnu", f"-j{args.jobs}", "ALSA=false", "OSS=false",
                    "SYSSRC=s_midi_dummy.c s_file.c s_audio_dummy.c", "bin"],
                   cwd=root / "pure-data/src", check=True, timeout=600)
    print(f"Pd: {root / 'pure-data/bin/pd'}")
    print(f"LIRA: {root / 'LIRA-8'}")
    print("This build has dummy audio/MIDI backends; it validates DSP to WAV, not physical audio or MIDI.")


if __name__ == "__main__":
    main()
