#!/usr/bin/env python3
"""Fetch exact libpd/LIRA source and generate Android assets without patching DSP."""
from __future__ import annotations
import argparse
import json
from pathlib import Path
import shutil
import subprocess

MOBILE = Path(__file__).resolve().parents[1]
LIRA_REVISION = "6a6b6cbc3359a20d7741c9270c7690ab6b21c92a"
LIBPD_REVISION = "ba0dc63262901d658af8bbda5e619a60fa975e78"
PD_REVISION = "f009fd8d7b537e209e09898d487fdf1bf547da2b"


def git(path: Path, *args: str) -> str:
    return subprocess.check_output(["git", "-C", str(path), *args], text=True, timeout=180).strip()


def checkout(url: str, revision: str, path: Path) -> None:
    if not path.exists():
        path.mkdir(parents=True)
        subprocess.run(["git", "init", "-q", str(path)], check=True)
        subprocess.run(["git", "-C", str(path), "fetch", "--depth", "1", url, revision], check=True, timeout=180)
        subprocess.run(["git", "-C", str(path), "checkout", "--detach", "FETCH_HEAD"], check=True)
    if git(path, "rev-parse", "HEAD") != revision or git(path, "diff", "HEAD", "--name-only"):
        raise RuntimeError(f"Expected clean pinned source at {path}; refusing to modify it")


def prepare(cache: Path, assets: Path) -> None:
    libpd = cache / "libpd"
    lira = cache / "LIRA-8"
    checkout("https://github.com/libpd/libpd.git", LIBPD_REVISION, libpd)
    if not (libpd / "pure-data/src/m_pd.h").exists():
        subprocess.run(["git", "-C", str(libpd), "submodule", "update", "--init", "--depth", "1", "pure-data"], check=True, timeout=180)
    if git(libpd / "pure-data", "rev-parse", "HEAD") != PD_REVISION or git(libpd / "pure-data", "diff", "HEAD", "--name-only"):
        raise RuntimeError("Unexpected or modified libpd Pure Data submodule")
    checkout("https://github.com/MikeMorenoDSP/LIRA-8.git", LIRA_REVISION, lira)
    if git(lira, "status", "--porcelain", "--", "LIRA-8_Pd_Standalone", "License.txt"):
        raise RuntimeError("Modified or additional LIRA runtime source files")
    assets = assets.resolve()
    if assets.is_relative_to(cache.resolve()):
        raise ValueError("Generated assets must be outside the upstream source cache")
    assets.mkdir(parents=True, exist_ok=True)
    shutil.copytree(lira / "LIRA-8_Pd_Standalone", assets / "lira", dirs_exist_ok=True)
    licenses = assets / "licenses"
    licenses.mkdir(exist_ok=True)
    for src, dest in [(lira / "License.txt", "LIRA-LICENSE.txt"),
                      (libpd / "LICENSE.txt", "libpd-LICENSE.txt"),
                      (libpd / "pure-data/LICENSE.txt", "PureData-LICENSE.txt")]:
        shutil.copy2(src, licenses / dest)
    shutil.copy2(lira / "License.txt", assets / "lira/LIRA-LICENSE.txt")
    provenance = {"lira": LIRA_REVISION, "libpd": LIBPD_REVISION, "pure_data": PD_REVISION,
                  "patch": "lira/_LIRA-8.pd", "dsp_modifications": "none",
                  "channel_layout": "upstream mono duplicated to two DAC channels"}
    (assets / "sources.json").write_text(json.dumps(provenance, indent=2) + "\n")
    print(json.dumps({"libpd_source": str(libpd), "assets": str(assets), **provenance}, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache", type=Path, default=MOBILE / ".cache")
    parser.add_argument("--assets", type=Path, default=MOBILE / "app/build/generated/liraAssets")
    args = parser.parse_args()
    prepare(args.cache.resolve(), args.assets)
