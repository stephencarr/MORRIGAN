#!/usr/bin/env python3
"""Inspect both packaged ELF/ZIP page alignment and required source/licence assets."""
import argparse
import hashlib
import json
from pathlib import Path
import struct
import zipfile

PATCH_SHA256 = "f0a7443e75140a16a44e46ce2957f99d751fe495dc8387c7a082f8f71dbf3392"


def verify(path):
    data = path.read_bytes()
    libraries = []
    with zipfile.ZipFile(path) as archive:
        for abi in ("arm64-v8a", "x86_64"):
            name = f"lib/{abi}/libmorrigan_lira.so"
            entry = archive.getinfo(name)
            assert entry.compress_type == zipfile.ZIP_STORED, f"{abi}: expected uncompressed native library"
            name_length, extra_length = struct.unpack_from("<HH", data, entry.header_offset + 26)
            offset = entry.header_offset + 30 + name_length + extra_length
            assert offset % 16384 == 0, f"{abi}: ZIP entry is not 16 KiB aligned"
            elf = archive.read(name)
            assert elf[:6] == b"\x7fELF\x02\x01", f"{abi}: not little-endian ELF64"
            program_offset = struct.unpack_from("<Q", elf, 32)[0]
            entry_size, count = struct.unpack_from("<HH", elf, 54)
            alignments = []
            for index in range(count):
                fields = struct.unpack_from("<IIQQQQQQ", elf, program_offset + index * entry_size)
                kind, _, file_offset, virtual_address, _, _, _, alignment = fields
                if kind == 1:
                    assert alignment >= 16384, f"{abi}: ELF LOAD alignment below 16 KiB"
                    assert file_offset % alignment == virtual_address % alignment, f"{abi}: incongruent ELF LOAD"
                    alignments.append(alignment)
            assert alignments, f"{abi}: missing ELF LOAD segments"
            libraries.append({"abi": abi, "zip_data_offset": offset, "elf_load_alignments": alignments})
        for licence in ("LIRA-LICENSE.txt", "libpd-LICENSE.txt", "PureData-LICENSE.txt", "MORRIGAN-COPYING.txt", "NOTICE.txt"):
            assert len(archive.read("assets/licenses/" + licence)) > 100, f"Missing licence: {licence}"
        patch = archive.read("assets/lira/_LIRA-8.pd")
        assert hashlib.sha256(patch).hexdigest() == PATCH_SHA256, "Packaged patch differs from pinned original"
        sources = json.loads(archive.read("assets/sources.json"))
        assert sources["lira"] == "6a6b6cbc3359a20d7741c9270c7690ab6b21c92a"
        assert sources["libpd"] == "ba0dc63262901d658af8bbda5e619a60fa975e78"
        assert sources["pure_data"] == "f009fd8d7b537e209e09898d487fdf1bf547da2b"
    return {"status": "PASS", "apk": str(path), "bytes": len(data),
            "sha256": hashlib.sha256(data).hexdigest(), "libraries": libraries,
            "original_lira_patch": True, "licence_assets": True,
            "scope": "static packaging checks; not physical Pixel or USB validation"}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("apk", type=Path)
    args = parser.parse_args()
    print(json.dumps(verify(args.apk), indent=2))
