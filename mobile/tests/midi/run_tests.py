#!/usr/bin/env python3
"""Compile and run dependency-free MIDI tests using the host JDK."""
from pathlib import Path
import shutil
import subprocess
import tempfile

root = Path(__file__).resolve().parents[2]
source = root / "app/src/main/java/org/morrigan/mobile/midi"
with tempfile.TemporaryDirectory(prefix="morrigan-midi-tests-") as build:
    compiler = ["javac"] if shutil.which("javac") else ["java", "com.sun.tools.javac.Main"]
    subprocess.run([
        *compiler, "-encoding", "UTF-8", "-d", build,
        str(source / "MidiStreamParser.java"),
        str(source / "LiraMidiMapper.java"),
        str(Path(__file__).with_name("MidiTests.java")),
    ], check=True)
    subprocess.run(["java", "-cp", build, "org.morrigan.mobile.midi.MidiTests"], check=True)
