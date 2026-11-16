# Decisions

2026-11-16. These decisions apply to the first-sound checkpoint, not a frozen hardware specification.

| Decision | Reason | Revisit when |
| --- | --- | --- |
| Start from reset commit `da68b3e` on `morrigan-os/first-sound` | Keep the old browser workstation out of the new Linux architecture; preserve its history and the open reset PR | The user chooses how to merge the reset and new branch |
| Prove LIRA headlessly before desktop work | Explicit user acceptance criterion; eliminates GUI and compositor dependencies from the audio proof | The first-sound gate passes |
| Use upstream standalone LIRA in vanilla Pure Data | Reuses the actual engine and its eight voices; avoids ARM plugin-binary assumptions | A measured requirement justifies a different host |
| Use ordinary unprivileged Linux processes and an offline WAV sink for the first test | This Debian x86-64 host has no exposed sound device or Raspberry Pi; inspectable audio is possible without one | Hardware-backed ALSA/PipeWire tests become available |
| Keep a small, explicit, local control adapter | Test control-to-audio causality before designing a general app platform or hardware wire protocol | A second real application or physical controller exposes additional requirements |
| Treat ZacOS as preferred, with a separate ARM64 investigation | Desktop-port uncertainty must not delay sound and control work | A real ARM64 build and Pi graphics test can run |
| Pin fetched upstream source and keep it outside tracked project files | Reproducible experiments without bundling desktop assets, binaries or unknown transitive dependencies | Distribution packaging and licence audit are ready |
| Retain the previous MORRIGAN repository's GPL-3.0-only licence for original project code | Maintains the existing project's open-source terms after the reset; upstream components retain their own licences | Any licensing change is separately considered |
| No releases, deployments, service installation or upstream pushes | User's execution constraints; source commits and the previously requested new branch are sufficient | Explicit authorization and deployment acceptance tests |

The canonical handoff is product input, not proof that a milestone is complete. Evidence and limitations belong in the reports beside the implementation.
