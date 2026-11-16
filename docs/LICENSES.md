# Licensing and distribution inventory

Evidence date: 2026-11-16. This is an engineering inventory of the pinned sources below, not a complete distribution clearance. No upstream software, binary package, proprietary ROM, or extracted Macintosh asset is bundled in this repository. Fetches are separate development checkouts.

Original MORRIGAN implementation code retains the previous repository's **GPL-3.0-only** terms; see the root `LICENSE` and [DECISIONS.md](DECISIONS.md). That choice does not relicense upstream code. Source commits/branches are distinct from distributing a runtime image or binary build.

## Pinned projects

| Project / revision | Observed terms | Consequences for a future distribution | Status |
| --- | --- | --- | --- |
| [LIRA-8](https://github.com/MikeMorenoDSP/LIRA-8/tree/6a6b6cbc3359a20d7741c9270c7690ab6b21c92a) `6a6b6cbc3359a20d7741c9270c7690ab6b21c92a` | [`License.txt`](https://github.com/MikeMorenoDSP/LIRA-8/blob/6a6b6cbc3359a20d7741c9270c7690ab6b21c92a/License.txt), copyright Miguel Moreno, “Standard Improved BSD License”: three-clause BSD terms, covering associated files unless individually disclaimed. | Retain copyright, conditions, disclaimer in source; reproduce them in binary distribution documentation/materials. Author's name cannot imply endorsement. Modified local Pd patch material retains those notices when distributed. | VERIFIED: read full grant; no conflicting license text found in the standalone Pd patch search. |
| [Pure Data](https://github.com/pure-data/pure-data/tree/b1ff370c87b579f80130a9cafbf27cd890e90882) `b1ff370c87b579f80130a9cafbf27cd890e90882` | [`LICENSE.txt`](https://github.com/pure-data/pure-data/blob/b1ff370c87b579f80130a9cafbf27cd890e90882/LICENSE.txt), Miller Puckette and others; same three-clause BSD structure with per-file exceptions. | Preserve notices and disclaimers; no author endorsement. Audit enabled libraries and externals separately. | VERIFIED: top-level license read. |
| [ZacOS 9](https://github.com/chromasystemprofessional/Zac-OS-9/tree/205cf6dcf80fd7a600a1fcfed56878eba69d241a) `205cf6dcf80fd7a600a1fcfed56878eba69d241a` | GPL-3.0-or-later per `README.md`, `meson.build`, `debian/copyright`; GPLv3 text in `LICENSE`. | Preserve notices, mark modifications, supply complete corresponding source/build and installation material as required for the method of distribution. A locked-down consumer instrument may also trigger GPLv3 Installation Information obligations; avoid signing arrangements that prevent users installing modified GPL software. | VERIFIED: project declarations and license text. |
| [Clatter](https://github.com/clickysteve/clatter/tree/f9ddb05bd6d7f8a9c2a0a5b73a4ab8a50a59eae6) `f9ddb05bd6d7f8a9c2a0a5b73a4ab8a50a59eae6` | GPL-3.0-only, including LXR GPLv3 §7 trademark and modified-version notices. See `LICENSE`, `NOTICE.md`, `THIRD_PARTY_NOTICES.md`. | Keep notices and clear modified-version attribution. Distributing browser JS/WASM also requires an appropriate corresponding-source provision, including LXR bridge/build scripts and dependency versions. Preserve build identification and About/source links. | VERIFIED: notices and build notice-copying plugin read. |

LIRA's license filename is **`License.txt`**, with that exact case. There is no missing-license blocker for the inspected standalone source.

## Dependencies and assets

| Component | Evidence / obligations | Verification boundary |
| --- | --- | --- |
| Pd's bundled PortAudio and PortMidi | `portaudio/portaudio/LICENSE.txt` and `portmidi/portmidi/license.txt` carry MIT-style grants; retain notices. | VERIFIED source license text. Whether either is enabled in a given build must come from its configure/build evidence. |
| Pd GUI fonts | `font/LICENSE`: Bitstream Vera, DejaVu/public-domain changes, Arev, and included mathematical font notices have distinct conditions, including reserved names and notices. | VERIFIED license inventory. Headless proof does not need GUI fonts; do not assume BSD covers them if later bundled. |
| Clatter LXR firmware | Vendored revision `a43cd4fcda23ec3d577dc425261c3eb28bd5abff`, `lxr/upstream/LICENSE`, `lxr/upstream/NOTICE.md`; GPL-3.0-only with §7(c) marking and §7(e) trademark terms. Hardware schematics, enclosure and appearance are explicitly outside that grant. | VERIFIED vendored notices; firmware source provenance recorded by upstream. |
| Clatter reused code / library | `THIRD_PARTY_NOTICES.md`: DOWNBEAT, The Breakery, Slop Factory Core and Core's Good Bits dependency are MIT. Core is pinned at `f567d817e12f09b5a2b62985524e40378a670fb5` in `package.json`. Preserve MIT notices alongside GPL distribution. | PARTIALLY VERIFIED: upstream's detailed inventory inspected; full transitive package/license audit not performed here. |
| Clatter fonts | Tiny5, Silkscreen, VT323, IBM Plex Sans: OFL-1.1 declarations and full license in `THIRD_PARTY_NOTICES.md`. Keep font copyright/license, respect reserved names for modifications, no font-only sale. | PARTIALLY VERIFIED: declared package licenses; exact downloaded package contents require checking in a release dependency inventory. |
| Clatter demo sounds | `public/samples/README.md` and `THIRD_PARTY_NOTICES.md`: generated by `scripts/make-samples.mjs`, dedicated CC0-1.0. | VERIFIED upstream declarations and generation script exist; do not apply this status to user-imported samples. |
| ZacOS fonts/icons/cursors/patterns/sounds | `debian/copyright` declares original project work, GPL-3.0-or-later. `tools/fonts/build_ttf.py` embeds that license. `assets/fonts/*.pfont` and generated assets are present. | PARTIALLY VERIFIED: upstream provenance statement and source generators inspected; not an independent originality/trademark assessment of every asset. |
| ZacOS protocol XML | `debian/copyright` preserves HPND-sell-variant notices for layer-shell / foreign-toplevel and MIT for virtual keyboard / pointer protocols. | VERIFIED packaged license inventory; preserve separate notices. |
| ZacOS optional emulation | `emulation/afterdark/LICENSE` is MIT; Musashi MIT notice in `LICENSE-musashi.txt`. **SoftFloat Release 2b is separate:** its `vendor/softfloat/README.txt` and `softfloat.c` contain custom responsibility/indemnification and derivative-notice language. `ad-m68k/build.rs` compiles it. `packaging/emulators/copyright` declares macemu/bridge GPL-2.0-or-later and accompanies packages with source. | PARTIALLY VERIFIED: exact notices read; not cleared as a complete redistributable combination. Prefer `-Dafterdark=disabled` initially and review that helper before bundling. No emulation is needed for MORRIGAN's first instrument. |
| Linux / Debian runtime packages, Qt, wlroots, Wayland, Mesa, PipeWire, ALSA | ZacOS `debian/control` declares a substantial dependency set. Exact package versions, copyright files and linked-component boundaries depend on the eventual image. Qt's mixed licensing/private APIs need an actual configured-build inventory. Linux distribution firmware may have separate redistribution terms. | PROPOSED inventory work before any image/build distribution. Do not infer whole-image compliance from the top-level GPL/BSD licenses. |
| Development toolchain and Python | System/package-provided Python, compiler and build dependencies are not copied into this source repository. A future bundled SDK/image must preserve their package notices and inventory. | PROPOSED release dependency scan. |

## Compatibility and boundary decisions

- BSD/MIT components can generally be used in a GPLv3-covered combined work while retaining their notices. ZacOS's GPL-3.0-or-later and Clatter's GPL-3.0-only overlap at GPLv3; this does not mean every other dependency has been reviewed or that all independently launched programs become one licensed work.
- Prefer separate processes and documented messages for adapters. A process boundary is a sound engineering choice, not an automatic exemption from applicable licensing obligations.
- Fetch pinned originals into ignored development storage. Record local transformations, preserve original notices, and provide reproducible build steps rather than checking opaque binaries into MORRIGAN.
- A locally generated recording/control wrapper is development output. If it embeds or transforms the LIRA patch, its derivative portions still carry LIRA's BSD notice requirements when copied or distributed; generating it at runtime does not remove those obligations. Keep upstream notices with the separately fetched source and include them in any later packaged/generated distribution.
- An upstream download URL alone is not a permanent source-distribution strategy for a shipped image. Archive the matching complete sources/notices and choose a compliant source-offer mechanism before release.
- This phase does not redistribute precompiled Camomile/VST builds. Standalone Pd avoids needing that plugin distribution path; it does not grant extra rights to the plugin's other dependencies.

## Names and proprietary material

MORRIGAN is independent and must not imply endorsement by Mike Moreno DSP, SOMA, Erica Synths, Apple, ZacOS authors, or other upstream authors. Product names in technical documentation identify interoperability/source provenance only. LIRA's own README disclaims SOMA affiliation; Clatter's firmware notices explicitly reserve Erica Synths/LXR trademarks; ZacOS's README disclaims Apple endorsement.

ZacOS includes tooling to import user-supplied classic Mac themes and emulated software. That feature is **not** a redistribution grant for imported Apple fonts, icons, sounds, ROMs, system images, commercial applications or After Dark modules. MORRIGAN must not prepopulate those inputs. The first-sound proof uses none of them.

## Release gate (not a blocker for this local proof)

Before distributing an OS image/application bundle: lock the exact package set, collect every copyright/license file, check source and modification notices, include corresponding sources/build recipes and any required installation information, review assets/trademarks, and audit optional extras separately. No public build or image release is part of the present task.
