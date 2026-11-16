"""Run the original LIRA DSP headlessly, control it over loopback, verify WAV output."""
from __future__ import annotations
import argparse
import array
from contextlib import contextmanager
import hashlib
import json
import math
from pathlib import Path
import platform
import re
import shutil
import socket
import subprocess
import sys
import time
import wave

try:
    from .adapter import PARAMETERS, encode_event
    from .bootstrap import LIRA_REVISION, PD_REVISION
except ImportError:
    from adapter import PARAMETERS, encode_event
    from bootstrap import LIRA_REVISION, PD_REVISION

SAMPLE_RATE = 48_000


def instrument_patch(source: str, port: int) -> str:
    """Append bounded controls + recorder to a generated copy; preserve DSP graph."""
    if not 1024 <= port <= 65535:
        raise ValueError("Invalid loopback port")
    dac = "#X obj 32 714 dac~ 1 2;"
    tail = "#X connect 0 0 6 0;\n#X connect 0 0 6 1;\n"
    if source.count(dac) != 1 or not source.endswith(tail):
        raise ValueError("Unexpected upstream patch structure; inspect before adapting")
    source = source.replace(dac, "#X obj 32 714 writesf~ 2;")
    prefix = source[:-len(tail)]
    objects: list[str] = []
    connections: list[str] = []
    def obj(text: str) -> int:
        number = 10 + len(objects)  # original top-level canvas has ten objects
        objects.append(text)
        return number
    def wire(a: int, outlet: int, b: int, inlet: int = 0) -> None:
        connections.append(f"#X connect {a} {outlet} {b} {inlet};")
    keys = sorted(PARAMETERS)
    receiver = obj(f"#X obj 500 800 netreceive -f {port} 127.0.0.1;")
    route = obj("#X obj 500 830 route " + " ".join(keys + ["start", "stop", "mark", "quit"]) + ";")
    wire(receiver, 0, route)
    control_log = obj("#X obj 700 800 print MORRIGAN_CONTROL;")
    wire(receiver, 0, control_log)
    for index, name in enumerate(keys):
        dest = obj(f"#X obj 500 860 s \\$0-r-{name};")
        wire(route, index, dest)
    load = obj("#X obj 500 890 loadbang;")
    open_file = obj("#X msg 500 920 open output.wav;")
    ready = obj("#X obj 700 920 print MORRIGAN_READY;")
    wire(load, 0, open_file)
    wire(open_file, 0, 6)
    wire(load, 0, ready)
    timer = obj("#X obj 500 950 timer;")
    start = obj("#X obj 500 980 t b b;")
    start_message = obj("#X msg 500 1010 start;")
    stop_message = obj("#X msg 600 1010 stop;")
    wire(route, len(keys), start)
    wire(start, 1, timer)
    wire(start, 0, start_message)
    wire(start_message, 0, 6)
    wire(route, len(keys) + 1, stop_message)
    wire(stop_message, 0, 6)
    marker = obj("#X obj 700 950 t f b;")
    pack = obj("#X obj 700 980 pack f f;")
    marker_log = obj("#X obj 700 1010 print MORRIGAN_MARK;")
    wire(route, len(keys) + 2, marker)
    wire(marker, 1, timer, 1)
    wire(timer, 0, pack, 1)
    wire(marker, 0, pack)
    wire(pack, 0, marker_log)
    quit_message = obj("#X msg 800 1010 \\; pd quit;")
    wire(route, len(keys) + 3, quit_message)
    return prefix + "\n".join(objects + connections) + "\n" + tail


def source_revision(source: Path) -> str:
    revision = subprocess.check_output(["git", "-C", str(source), "rev-parse", "HEAD"], text=True).strip()
    changed = subprocess.check_output(["git", "-C", str(source), "status", "--porcelain", "--", "LIRA-8_Pd_Standalone", "License.txt"], text=True).strip()
    if revision != LIRA_REVISION or changed:
        raise ValueError("LIRA source must be the clean pinned revision; run bootstrap.py")
    return revision


@contextmanager
def running_pd(pd: Path, source: Path, output: Path):
    """Bound lifetime to this caller, and never write to the upstream checkout."""
    if output.exists():
        raise ValueError(f"Output directory already exists (choose a fresh path): {output}")
    output.mkdir(parents=True)
    runtime = output / "runtime"
    shutil.copytree(source / "LIRA-8_Pd_Standalone", runtime)
    shutil.copy2(source / "License.txt", runtime / "LIRA-LICENSE.txt")
    with socket.socket() as reservation:
        reservation.bind(("127.0.0.1", 0))
        port = reservation.getsockname()[1]
    original = (runtime / "_LIRA-8.pd").read_text()
    (runtime / "morrigan-runtime.pd").write_text(instrument_patch(original, port))
    command = [str(pd), "-nogui", "-noprefs", "-noaudio", "-nomidi", "-nrt", "-r", str(SAMPLE_RATE),
               "-open", str(runtime / "morrigan-runtime.pd")]
    log = output / "pd.log"
    conn = None
    with log.open("w") as stream:
        process = subprocess.Popen(command, cwd=runtime, stdout=stream, stderr=subprocess.STDOUT)
        try:
            deadline = time.monotonic() + 10
            while True:
                if process.poll() is not None:
                    raise RuntimeError(f"Pd exited during startup: {log.read_text()}")
                try:
                    conn = socket.create_connection(("127.0.0.1", port), timeout=0.1)
                    break
                except OSError:
                    if time.monotonic() >= deadline:
                        raise RuntimeError(f"Pd did not open loopback control port: {log.read_text()}")
                    time.sleep(0.02)
            conn.settimeout(2)
            time.sleep(0.1)  # let loadbang / preset initialization complete
            yield conn, process, command, port
        finally:
            if conn is not None:
                try:
                    conn.sendall(b"stop 0;\nquit 0;\n")
                except OSError:
                    pass
                conn.close()
            try:
                process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                process.terminate()
                try:
                    process.wait(timeout=2)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=2)
    if process.returncode != 0:
        raise RuntimeError(f"Pd did not exit cleanly (code {process.returncode}); inspect {log}")
    shutil.copy2(runtime / "output.wav", output / "output.wav")


def audio_metrics(samples: list[float], rate: int) -> dict:
    if not samples:
        raise ValueError("Cannot measure empty audio segment")
    rms = math.sqrt(sum(v * v for v in samples) / len(samples))
    peak = max(abs(v) for v in samples)
    upcrossings = sum(a <= 0 < b for a, b in zip(samples, samples[1:]))
    return {"frames": len(samples), "rms": rms, "peak": peak,
            "near_full_scale_samples": sum(abs(v) >= 0.999 for v in samples),
            "upcrossing_hz": upcrossings * rate / len(samples)}


def verify_audio(path: Path, log: str, stages: list[str]) -> dict:
    marks = {int(i): float(ms) for i, ms in re.findall(r"MORRIGAN_MARK: (\d+) ([0-9.e+-]+)", log)}
    if sorted(marks) != list(range(len(stages) + 1)):
        raise RuntimeError("Missing or unexpected Pd logical-time markers")
    with wave.open(str(path), "rb") as wav:
        if (wav.getnchannels(), wav.getsampwidth(), wav.getframerate()) != (2, 2, SAMPLE_RATE):
            raise RuntimeError("Unexpected WAV format")
        frames = wav.getnframes()
        pcm = array.array("h", wav.readframes(frames))
    if sys.byteorder != "little":
        pcm.byteswap()
    left, right = pcm[0::2], pcm[1::2]
    whole_file_peak = max((abs(value) for value in pcm), default=0) / 32768
    whole_file_near_full_scale = sum(abs(value) >= 0.999 * 32768 for value in pcm)
    metrics = {}
    # Ignore envelope settling and the message boundary; markers use Pd logical
    # time, not wall-clock time, so scheduler load cannot shift analysis windows.
    for index, name in enumerate(stages):
        start = round((marks[index] / 1000 + 0.22) * SAMPLE_RATE)
        end = round((marks[index + 1] / 1000 - 0.03) * SAMPLE_RATE)
        if not 0 <= start < end <= frames:
            raise RuntimeError(f"Invalid analysis window for {name}: {start}..{end}/{frames}")
        metrics[name] = audio_metrics([x / 32768 for x in left[start:end]], SAMPLE_RATE)
    checks = {
        "headless_patch_loaded": "MORRIGAN_READY: bang" in log,
        "no_pd_errors": not re.search(r"error:|couldn't create|connection failed|can't load", log, re.IGNORECASE),
        "eight_individual_voices_non_silent": all(metrics[f"voice-{i}"]["rms"] > 0.005 for i in range(1, 9)),
        "eight_individual_releases_silent": all(metrics[f"release-{i}"]["rms"] < 0.0001 for i in range(1, 9)),
        "initial_silence": metrics["silence-before"]["rms"] < 0.0001,
        "release_silence": metrics["silence-after"]["rms"] < 0.0001,
        "control_changes_pitch": metrics["tune-high"]["upcrossing_hz"] > 2 * metrics["tune-low"]["upcrossing_hz"],
        "all_eight_simultaneous": metrics["all-eight"]["rms"] > 0.005,
        "no_observed_clipping": whole_file_peak < 0.95 and whole_file_near_full_scale == 0,
        "two_channels_match_upstream_mono_duplication": left == right,
    }
    return {"sample_rate": SAMPLE_RATE, "channels": 2, "sample_width_bits": 16,
            "frames": frames, "duration_seconds": frames / SAMPLE_RATE,
            "whole_file_peak": whole_file_peak,
            "whole_file_near_full_scale_samples": whole_file_near_full_scale,
            "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            "channel_layout": "upstream mono duplicated to left and right",
            "segments": metrics, "checks": checks, "passed": all(checks.values())}


def run(pd: Path, source: Path, output: Path) -> dict:
    revision = source_revision(source)
    pd_version = subprocess.run([str(pd), "-version"], text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, check=True, timeout=5).stdout.strip()
    events = []
    stages = []
    with running_pd(pd, source, output) as (conn, process, command, port):
        def send(control: str, value: float) -> None:
            event = {"version": 1, "device": "morrigan.virtual.first-sound", "control": control, "value": value}
            conn.sendall(encode_event(event))
            events.append(event)
        def stage(name: str, duration: float = 0.65) -> None:
            index = len(stages)
            stages.append(name)
            conn.sendall(f"mark {index};\n".encode())
            time.sleep(duration)
            if process.poll() is not None:
                raise RuntimeError("Pd exited while rendering")
        # Deterministic, conservative test preset. Source preset is never changed.
        for key in PARAMETERS:
            send(key, 0)
        for pair in ("12", "34", "56", "78"):
            send(f"fast-{pair}", 1)
            send(f"source-{pair}", 1)  # disable cross-voice modulation
        for voice in range(1, 9):
            send(f"tune-{voice}", 64)
        send("pitch-1234", 64)
        send("pitch-5678", 64)
        send("vol", 64)
        time.sleep(0.2)
        conn.sendall(b"start 0;\n")
        stage("silence-before")
        for voice in range(1, 9):
            send(f"sensor-{voice}", 1)
            stage(f"voice-{voice}")
            send(f"sensor-{voice}", 0)
            stage(f"release-{voice}", 0.45)
        send("tune-1", 24)
        send("sensor-1", 1)
        stage("tune-low")
        send("tune-1", 96)
        stage("tune-high")
        for voice in range(1, 9):
            send(f"sensor-{voice}", 1)
        stage("all-eight")
        for voice in range(1, 9):
            send(f"sensor-{voice}", 0)
        stage("silence-after")
        conn.sendall(f"mark {len(stages)};\nstop 0;\n".encode())
        time.sleep(0.1)
    log = (output / "pd.log").read_text()
    report = {
        "status": "VERIFIED" ,
        "scope": "real Pure Data DSP and loopback control, rendered to WAV without an audio device",
        "capture_point": "original DAC input, after LIRA voice mix, delay/distortion and master volume",
        "host": {"system": platform.system(), "machine": platform.machine(), "python": platform.python_version()},
        "upstream": {"lira_revision": revision, "pd_version": pd_version, "bootstrap_pd_revision": PD_REVISION},
        "command": command,
        "process_exit_code": process.returncode,
        "transport": {"type": "Pd FUDI over TCP", "bind": "127.0.0.1", "port": port, "protocol_version": 1},
        "controls_sent": events,
        "pd_control_messages_observed": len(re.findall(r"^MORRIGAN_CONTROL:", log, re.MULTILINE)),
        "audio": verify_audio(output / "output.wav", log, stages),
        "limitations": ["Not Raspberry Pi hardware validation", "No physical audio or MIDI devices", "No DAC latency or underrun measurement", "Upstream output is mono duplicated to two channels", "Clipping check covers this conservative preset only", "Loopback developer transport is not a sandbox against other local users"],
    }
    if not report["audio"]["passed"]:
        report["status"] = "FAILED"
    (output / "events.jsonl").write_text("".join(json.dumps(e) + "\n" for e in events))
    (output / "report.json").write_text(json.dumps(report, indent=2) + "\n")
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pd", type=Path, default=Path(".cache/upstream/pure-data/bin/pd"))
    parser.add_argument("--source", type=Path, default=Path(".cache/upstream/LIRA-8"))
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    try:
        report = run(args.pd.resolve(), args.source.resolve(), args.output.resolve())
    except (ValueError, RuntimeError, OSError, wave.Error, subprocess.SubprocessError) as error:
        parser.exit(1, f"First-sound proof failed: {error}\n")
    print(json.dumps({"status": report["status"], "audio": report["audio"], "report": str(args.output / "report.json")}, indent=2))
    if report["status"] != "VERIFIED":
        raise SystemExit(1)


if __name__ == "__main__":
    main()
