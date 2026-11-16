"""Control-boundary tests do not require Pd or third-party source."""
import math
import socket
import unittest
from unittest.mock import patch
from apps.lira.adapter import PARAMETERS, encode_event, send_event
from apps.lira.first_sound import audio_metrics, instrument_patch


class ControlTests(unittest.TestCase):
    def event(self, **changes):
        return dict(version=1, device="virtual-controller", control="sensor-1", value=1, **changes)

    def test_sensor_and_potentiometer_ranges(self):
        for control, (low, high) in PARAMETERS.items():
            for value in (low, high):
                event = dict(version=1, device="virtual-controller", control=control, value=value)
                self.assertEqual(encode_event(event), f"{control} {value:g};\n".encode())
            event["value"] = high + 0.01
            with self.assertRaises(ValueError):
                encode_event(event)

    def test_exact_versioned_event_shape(self):
        for event in (None, [], "sensor-1 1;", {}, {**self.event(), "extra": 1}):
            with self.subTest(event=event), self.assertRaises(ValueError):
                encode_event(event)
        for value in (0, 2, True, 1.0, "1"):
            event = self.event()
            event["version"] = value
            with self.subTest(value=value), self.assertRaises(ValueError):
                encode_event(event)

    def test_reject_nonfinite_and_out_of_bounds(self):
        for value in (math.nan, math.inf, -math.inf, 10**1000, -(10**1000), True, None, "1", -0.01, 1.01, 0.5):
            event = self.event()
            event["value"] = value
            with self.subTest(value=str(value)[:20]), self.assertRaises(ValueError):
                encode_event(event)

    def test_reject_fudi_injection_and_non_parameter_controls(self):
        for control in ("sensor-1; pd quit", "sensor-1\n", "record", "quit", "vol 127", [], None):
            event = self.event()
            event["control"] = control
            with self.subTest(control=control), self.assertRaises(ValueError):
                encode_event(event)
        for device in ("", "a" * 81, "a; pd quit", "has space", None):
            event = self.event()
            event["device"] = device
            with self.subTest(device=device), self.assertRaises(ValueError):
                encode_event(event)

    def test_only_loopback_is_used_and_payload_checked_before_connect(self):
        with patch("apps.lira.adapter.socket.create_connection") as create:
            send_event(45001, self.event())
            create.assert_called_once_with(("127.0.0.1", 45001), timeout=2)
            create.return_value.__enter__.return_value.sendall.assert_called_once_with(b"sensor-1 1;\n")
            create.reset_mock()
            with self.assertRaises(ValueError):
                send_event(45001, {**self.event(), "value": math.nan})
            create.assert_not_called()

    def test_connection_failure_is_visible(self):
        with patch("apps.lira.adapter.socket.create_connection", side_effect=ConnectionRefusedError):
            with self.assertRaises(ConnectionRefusedError):
                send_event(45001, self.event())
        for port in (80, 65536, True, "45001"):
            with self.assertRaises(ValueError):
                send_event(port, self.event())

    def test_known_measurements_and_empty_input(self):
        measured = audio_metrics([0, 0.5, 0, -0.5] * 10, 48000)
        self.assertAlmostEqual(measured["rms"], math.sqrt(0.125))
        self.assertEqual(measured["peak"], 0.5)
        self.assertEqual(measured["near_full_scale_samples"], 0)
        with self.assertRaises(ValueError):
            audio_metrics([], 48000)

    def test_unknown_patch_structure_fails_closed(self):
        with self.assertRaises(ValueError):
            instrument_patch("#N canvas 0 0 10 10 10;\n", 45001)
        with self.assertRaises(ValueError):
            instrument_patch("", 80)


class RecordingFailureTests(unittest.TestCase):
    def test_clipping_in_untrimmed_right_channel_is_rejected(self):
        import array
        from pathlib import Path
        import tempfile
        import wave
        from apps.lira.first_sound import verify_audio
        stages = (["silence-before"] + [f"voice-{i}" for i in range(1, 9)]
                  + [f"release-{i}" for i in range(1, 9)]
                  + ["tune-low", "tune-high", "all-eight", "silence-after"])
        log = "MORRIGAN_READY: bang\n" + "".join(f"MORRIGAN_MARK: {i} {i * 1000}\n" for i in range(len(stages) + 1))
        pcm = array.array("h", [0]) * (48000 * 2 * len(stages))
        pcm[1] = 32767  # first right-channel sample, outside every analysis window
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "clipped.wav"
            with wave.open(str(path), "wb") as wav:
                wav.setparams((2, 2, 48000, 0, "NONE", "not compressed"))
                wav.writeframes(pcm.tobytes())
            result = verify_audio(path, log, stages)
        self.assertFalse(result["checks"]["no_observed_clipping"])
        self.assertEqual(result["whole_file_near_full_scale_samples"], 1)

    def test_malformed_wav_and_missing_markers_fail(self):
        from pathlib import Path
        import tempfile
        import wave
        from apps.lira.first_sound import verify_audio
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "bad.wav"
            path.write_bytes(b"not a wave file")
            with self.assertRaises(RuntimeError):
                verify_audio(path, "", ["silence-before"])
            with self.assertRaises(wave.Error):
                verify_audio(path, "MORRIGAN_MARK: 0 0\nMORRIGAN_MARK: 1 1000\n", ["silence-before"])


if __name__ == "__main__":
    unittest.main()
