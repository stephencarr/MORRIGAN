"""Small, versioned LIRA control adapter. No hardware or GUI dependencies."""
from __future__ import annotations

import argparse
import json
import math
import socket
from typing import Any

PROTOCOL_VERSION = 1
PARAMETERS: dict[str, tuple[float, float]] = {}
for voice in range(1, 9):
    PARAMETERS[f"tune-{voice}"] = (0, 127)
    PARAMETERS[f"sensor-{voice}"] = (0, 1)
for pair in ("12", "34", "56", "78"):
    for name in ("sharp", "mod"):
        PARAMETERS[f"{name}-{pair}"] = (0, 127)
    PARAMETERS[f"fast-{pair}"] = (0, 1)
    PARAMETERS[f"source-{pair}"] = (0, 2)
for group in ("1234", "5678"):
    for name in ("pitch", "hold"):
        PARAMETERS[f"{name}-{group}"] = (0, 127)
for name in ("vibrato", "drv", "dst-mix", "vol", "f-a", "f-b", "time-1", "time-2", "feedback", "del-mix", "mod-1", "mod-2"):
    PARAMETERS[name] = (0, 127)
for name in ("switch", "total-fb", "andor", "link", "lfo-wav", "quantize"):
    PARAMETERS[name] = (0, 1)
PARAMETERS["del-mod"] = (0, 2)


def encode_event(event: dict[str, Any]) -> bytes:
    """Validate a MORRIGAN v1 absolute event before producing bounded Pd FUDI."""
    if not isinstance(event, dict) or set(event) != {"version", "device", "control", "value"}:
        raise ValueError("Event must contain exactly version, device, control, value")
    if type(event["version"]) is not int or event["version"] != PROTOCOL_VERSION:
        raise ValueError("Unsupported control protocol version")
    device = event["device"]
    if not isinstance(device, str) or not device or len(device) > 80 or not all(c.isalnum() or c in "-_.:" for c in device):
        raise ValueError("Invalid device identity")
    control = event["control"]
    if not isinstance(control, str) or control not in PARAMETERS:
        raise ValueError("Unknown LIRA control")
    value = event["value"]
    if type(value) not in (int, float) or (isinstance(value, float) and not math.isfinite(value)):
        raise ValueError("Control value must be a finite number")
    low, high = PARAMETERS[control]
    if not low <= value <= high:
        raise ValueError(f"{control} must be between {low} and {high}")
    if high <= 2 and int(value) != value:
        raise ValueError("Switch and sensor values must be discrete")
    return f"{control} {value:g};\n".encode("ascii")


def send_event(port: int, event: dict[str, Any]) -> None:
    payload = encode_event(event)
    if type(port) is not int or not 1024 <= port <= 65535:
        raise ValueError("Port must be in 1024..65535")
    with socket.create_connection(("127.0.0.1", port), timeout=2) as conn:
        conn.sendall(payload)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", required=True, type=int)
    parser.add_argument("--control", required=True, choices=sorted(PARAMETERS))
    parser.add_argument("--value", required=True, type=float)
    parser.add_argument("--device", default="virtual-controller")
    args = parser.parse_args()
    event = dict(version=1, device=args.device, control=args.control, value=args.value)
    send_event(args.port, event)
    print(json.dumps(event))


if __name__ == "__main__":
    main()
