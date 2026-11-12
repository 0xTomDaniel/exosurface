#!/usr/bin/env python3
"""Exact source integrity. Owner ruling 2026-11-11: source-inventory.json owns literal classifications.

Integrity-pinned sources are verified against their existing source-pin metadata; --exempt lists them for the TS/JS
gate. Unclassified Python sources default maintained; --maintained lists them for the manual check-python recipe.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
from typing import TypedDict


class Entry(TypedDict):
    classification: str
    pin: str
    format: str
    key: str


def table_value(pin: Path, key: str) -> str:
    rows = [
        parts
        for line in pin.read_text().splitlines()
        if len(parts := [value.strip().strip("`") for value in line.split("|")]) >= 4
        and parts[1] == key
    ]
    if len(rows) != 1:
        raise ValueError(f"{pin}: expected exactly one source-pin row for {key}")
    return rows[0][-2]


def verify(root: Path, name: str, entry: Entry) -> None:
    source, pin = root / name, root / entry["pin"]
    content = source.read_bytes()
    kind = entry["format"]
    if kind in {"legacy-fixtures", "json-files"}:
        expected = json.loads(pin.read_text())["files"][entry["key"]]
    elif kind == "sha256sum":
        matches = [
            parts[0]
            for line in pin.read_text().splitlines()
            if len(parts := line.split(maxsplit=1)) == 2 and parts[1].lstrip("*") == entry["key"]
        ]
        if len(matches) != 1:
            raise ValueError(f"{pin}: missing or duplicate source pin {entry['key']}")
        expected = matches[0]
    elif kind in {"sanitized-table", "audit-table"}:
        expected = table_value(pin, entry["key"])
    elif kind == "reverse-patch":
        expected = table_value(pin, entry["key"])
        with tempfile.TemporaryDirectory(prefix="vendor-source-integrity-") as temporary:
            copied = Path(temporary) / "check.py"
            shutil.copyfile(source, copied)
            subprocess.run(
                ["git", "apply", "--reverse", str((source.parent / "relocation.patch").resolve())],
                cwd=temporary,
                check=True,
                capture_output=True,
            )
            content = copied.read_bytes()
    else:
        raise ValueError(f"{name}: unknown integrity format {kind}")
    if (
        not isinstance(expected, str)
        or len(expected) != 64
        or hashlib.sha256(content).hexdigest() != expected
    ):
        raise ValueError(
            f"{name}: source integrity mismatch; preserve the existing pin and restore the source bytes"
        )


def strict_json(text: str) -> object:
    def pairs(items: list[tuple[str, object]]) -> dict:
        result = {}
        for key, value in items:
            if key in result:
                raise ValueError("duplicate native/schema key")
            result[key] = value
        return result

    def constant(value: str) -> None:
        raise ValueError(f"nonfinite JSON number: {value}")

    return json.loads(text, object_pairs_hook=pairs, parse_constant=constant)


def load_registry(root: Path) -> dict:
    registry = strict_json((root / "scripts/source-inventory.json").read_text())
    if (
        not isinstance(registry, dict)
        or set(registry) != {"version", "integrity"}
        or type(registry["version"]) is not int
        or registry["version"] != 1
    ):
        raise ValueError("unknown source inventory schema")
    if not isinstance(registry["integrity"], dict):
        raise ValueError("invalid inventory collections")
    for name, entry in registry["integrity"].items():
        if set(entry) != {"classification", "pin", "format", "key"} or not all(
            isinstance(v, str) for v in entry.values()
        ):
            raise ValueError(f"invalid integrity entry: {name}")
    return registry


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parent.parent)
    parser.add_argument("--maintained", action="store_true")
    parser.add_argument("--exempt", action="store_true")
    args = parser.parse_args()
    root = args.root.resolve()
    registry = load_registry(root)
    entries: dict[str, Entry] = registry["integrity"]
    for name, entry in entries.items():
        if entry["classification"] not in {
            "fixture-integrity",
            "capture-integrity",
            "vendored-dependency",
        }:
            raise ValueError(f"{name}: unknown classification {entry['classification']}")
        try:
            verify(root, name, entry)
        except (FileNotFoundError, ValueError, KeyError, subprocess.CalledProcessError) as error:
            parser.exit(
                1,
                f"source-inventory: {name}: {error}; restore existing source/pin/relocation patch\n",
            )
    tracked = subprocess.check_output(
        ["git", "-C", str(root), "ls-files", "--cached", "--others", "--exclude-standard", "-z"],
        text=True,
    )
    python = sorted({name for name in tracked.split("\0") if name.endswith(".py")})
    if args.exempt:
        print("\n".join(sorted(entries)))
    elif args.maintained:
        print("\n".join(name for name in python if name not in entries))
    else:
        print(
            json.dumps(
                {
                    "python": len(python),
                    "maintained": [name for name in python if name not in entries],
                    "integrity": entries,
                    "verified": len(entries),
                },
                indent=2,
            )
        )


if __name__ == "__main__":
    main()
