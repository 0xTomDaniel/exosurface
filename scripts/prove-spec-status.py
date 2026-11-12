#!/usr/bin/env python3
"""Differential CLI proof against a supplied audit reference, using disposable copies of real target inputs.

Never writes real specs/status/calls or the reference tree. Not a runtime dependency of the local gate.
"""
from __future__ import annotations

import argparse
import copy
import json
import os
import shutil
from pathlib import Path
import subprocess
import sys
import tempfile
from html.parser import HTMLParser


class FirstCriterion(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.tag = ""
        self.anchor = ""

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        if not self.tag and "data-acceptance-criterion" in values:
            self.tag = self.get_starttag_text()
            self.anchor = values["data-anchor"] or ""


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--reference", type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--expected-results", type=Path, help="Replay previously captured original CLI results without the reference executable")
    args = parser.parse_args()
    root = Path(__file__).resolve().parent.parent
    local = root / "scripts/vendor/spec-status/check.py"
    reference = args.reference.resolve() if args.reference else None
    common = subprocess.check_output(["git", "rev-parse", "--git-common-dir"], cwd=root, text=True).strip()
    objects = (root / common / "objects").resolve()
    args.output.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="spec-status-proof-") as temporary:
        corpus = Path(temporary)
        subprocess.run(["git", "init", "-q", str(corpus)], check=True)
        (corpus / ".git/objects/info/alternates").write_text(str(objects) + "\n")
        specs = corpus / "docs/specs"
        specs.mkdir(parents=True)
        originals = {p.name: p.read_bytes() for p in (root / "docs/specs").iterdir()
                     if p.name.endswith((".status.json", ".spec.html", ".calls.jsonl"))}
        status_name = "page-bounds.status.json"
        html_name = "page-bounds.spec.html"
        calls_name = "page-bounds.calls.jsonl"
        base_status = json.loads(originals[status_name])
        base_html = originals[html_name].decode()
        first = FirstCriterion()
        first.feed(base_html)
        assert first.anchor in base_status["criteria"]
        base_call = {"at": "2026-11-11T00:00:00Z", "lane": "gh218", "role": "supervisor",
                     "kind": "clarifies", "anchors": [first.anchor], "criteria": [first.anchor],
                     "what": "Disposable differential fixture", "why": "Exercise actual CLI semantics",
                     "passes_as_written": False, "evidence": "Disposable fixture, not an acceptance record"}
        results = []

        def case(name: str, expected: int, *, status=None, html=None, call=None, raw=None) -> None:
            for path in specs.iterdir():
                path.unlink()
            for filename, data in originals.items():
                (specs / filename).write_bytes(data)
            if status is not None:
                (specs / status_name).write_text(json.dumps(status))
            if raw is not None:
                (specs / status_name).write_text(raw)
            if html is not None:
                (specs / html_name).write_text(html)
            if call is not None:
                (specs / calls_name).write_text(json.dumps(call) + "\n")
            outputs = []
            commands = [("local", local)] if reference is None else [("reference", reference), ("local", local)]
            for label, executable in commands:
                run = subprocess.run([sys.executable, "-B", str(executable), "check", "docs/specs"],
                                     cwd=corpus, env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"},
                                     text=True, capture_output=True, timeout=20)
                outputs.append((run.returncode, run.stdout, run.stderr))
                if expected == 1:
                    assert run.stderr.startswith("docs/specs/"), (name, "not a normal spec-status diagnostic", run.stderr)
                (args.output / f"{name}-{label}.json").write_text(json.dumps({
                    "rc": run.returncode, "stdout": run.stdout, "stderr": run.stderr}))
            if reference is not None:
                assert outputs[0] == outputs[1], (name, outputs)
            if args.expected_results is not None:
                recorded = json.loads((args.expected_results / f"{name}-reference.json").read_text())
                assert outputs[-1] == (recorded["rc"], recorded["stdout"], recorded["stderr"]), (name, "recorded reference differs", outputs[-1])
            assert outputs[-1][0] == expected, (name, outputs[-1])
            comparison = "live-reference" if reference is not None else "recorded-reference" if args.expected_results is not None else "not-requested"
            results.append({"case": name, "rc": expected, "comparison": comparison, "exact_cli_equal": True if comparison != "not-requested" else None})
            print(json.dumps(results[-1]), flush=True)

        case("real-three-set-baseline", 0)
        case("duplicate-key", 1, raw='{"spec":"duplicate",' + originals[status_name].decode().lstrip()[1:])
        changed = copy.deepcopy(base_status)
        changed["criteria"][first.anchor]["status"] = "accepted"
        case("invalid-status", 1, status=changed)
        changed = copy.deepcopy(base_status)
        del changed["criteria"][first.anchor]
        case("missing-criterion", 1, status=changed)
        changed = copy.deepcopy(base_status)
        changed["criteria"]["unknown"] = {"status": "planned", "pr": None}
        case("extra-criterion", 1, status=changed)
        changed = copy.deepcopy(base_status)
        changed["criteria"][first.anchor] = {"status": "built", "pr": 218, "record": "invalid"}
        case("incomplete-evidence-link", 1, status=changed)
        changed["criteria"][first.anchor].update(commit="f" * 40, tests=["fixture"])
        case("invalid-evidence-record", 1, status=changed)
        changed = copy.deepcopy(base_status)
        changed["accepted_commit"] = "f" * 40
        case("missing-accepted-object", 1, status=changed)
        for lane, expected in (("gh218", 0), ("eng-218", 0), ("GH218", 1), ("ENG-218", 1),
                               ("#218", 1), ("218", 1), ("eng-218/", 1), ("not-a-lane", 1)):
            case("lane-" + lane.replace("/", "slash").replace("#", "hash"), expected,
                 call={**base_call, "lane": lane})
        for field, value in (("role", "implementer"), ("passes_as_written", True), ("kind", "invalid"),
                             ("at", "yesterday"), ("criteria", ["unknown"]), ("denied", {"at": "now"})):
            case("bad-call-" + field, 1, call={**base_call, field: value})
        added_anchor = base_html + '<p data-anchor="fixture-anchor">fixture</p>'
        case("unnamed-anchor", 1, html=added_anchor)
        anchored_call = {**base_call, "anchors": ["(page)", "fixture-anchor"]}
        case("named-anchor", 0, html=added_anchor, call=anchored_call)
        case("denied-call-cannot-cover", 1, html=added_anchor,
             call={**anchored_call, "denied": {"at": "2026-11-11T00:00:00Z", "note": "denied"}})
        added = base_html + '<p data-anchor="fixture-criterion" data-acceptance-criterion>fixture</p>'
        changed = copy.deepcopy(base_status)
        changed["criteria"]["fixture-criterion"] = {"status": "planned", "pr": None}
        addition = {**base_call, "anchors": ["(page)", "fixture-criterion"], "criteria": ["fixture-criterion"]}
        case("adds-needs-kind", 1, html=added, status=changed, call=addition)
        case("adds-correct-kind", 0, html=added, status=changed, call={**addition, "kind": "adds"})
        removed = base_html.replace(first.tag, first.tag.replace("data-acceptance-criterion", "", 1), 1)
        changed = copy.deepcopy(base_status)
        del changed["criteria"][first.anchor]
        case("weakens-needs-kind", 1, html=removed, status=changed, call=base_call)
        case("weakens-correct-kind", 0, html=removed, status=changed, call={**base_call, "kind": "weakens"})
        # Packaging failure, not a replacement lane grammar. Even a GitHub call requires both shipped helpers.
        for missing in ("github-issues.sh", "linear.sh"):
            packaged = corpus / missing.removesuffix(".sh")
            packaged.mkdir()
            for name in ("check.py", "github-issues.sh", "linear.sh"):
                shutil.copy2(local.parent / name, packaged / name)
            (packaged / missing).unlink()
            (specs / status_name).write_bytes(originals[status_name])
            (specs / html_name).write_bytes(originals[html_name])
            (specs / calls_name).write_text(json.dumps(base_call) + "\n")
            run = subprocess.run([sys.executable, "-B", str(packaged / "check.py"), "check", "docs/specs"],
                                 cwd=corpus, env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"},
                                 text=True, capture_output=True, timeout=20)
            assert run.returncode != 0, missing
            assert "FileNotFoundError" in run.stderr, (missing, run.stderr)
            assert f"required packaged lane normalizer missing: {packaged / missing}" in run.stderr, run.stderr
            (args.output / f"missing-{missing}.json").write_text(json.dumps({
                "rc": run.returncode, "stdout": run.stdout, "stderr": run.stderr}))
            results.append({"case": "missing-" + missing, "rc": run.returncode, "comparison": "not-requested", "exact_cli_equal": None})
        (args.output / "summary.json").write_text(json.dumps(results, indent=2) + "\n")
        assert all((root / "docs/specs" / name).read_bytes() == data for name, data in originals.items())
        mode = "live-reference" if reference is not None else "recorded-reference" if args.expected_results is not None else "not-requested"
        print(f"PASS: {len(results)} CLI cases; comparison={mode}; real metadata unchanged")


if __name__ == "__main__":
    main()
