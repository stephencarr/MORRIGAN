"""Opt-in real-engine acceptance test; set MORRIGAN_PD and MORRIGAN_LIRA_SOURCE."""
import os
from pathlib import Path
import tempfile
import unittest
from apps.lira.first_sound import run, running_pd


@unittest.skipUnless(os.getenv("MORRIGAN_PD") and os.getenv("MORRIGAN_LIRA_SOURCE"),
                     "Requires explicitly configured real Pd and pinned LIRA source")
class LiraIntegration(unittest.TestCase):
    def test_engine_crash_cannot_be_reported_as_success(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "crash"
            with self.assertRaisesRegex(RuntimeError, "did not exit cleanly"):
                with running_pd(Path(os.environ["MORRIGAN_PD"]).resolve(),
                                Path(os.environ["MORRIGAN_LIRA_SOURCE"]).resolve(), output) as (_, process, _, _):
                    process.terminate()
                    process.wait(timeout=2)

    def test_eight_voices_control_and_recording(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "first-sound"
            report = run(Path(os.environ["MORRIGAN_PD"]).resolve(),
                         Path(os.environ["MORRIGAN_LIRA_SOURCE"]).resolve(), output)
            self.assertEqual(report["status"], "VERIFIED")
            self.assertTrue(all(report["audio"]["checks"].values()))
            self.assertGreater(report["pd_control_messages_observed"], len(report["controls_sent"]))
            self.assertGreater((output / "output.wav").stat().st_size, 100_000)
            self.assertTrue((output / "report.json").exists())
            self.assertTrue((output / "events.jsonl").exists())


if __name__ == "__main__":
    unittest.main()
