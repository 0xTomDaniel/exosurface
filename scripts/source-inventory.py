#!/usr/bin/env python3
"""Exact source applicability. Owner ruling 2026-11-11: source-inventory.json owns literal classifications.

Unclassified sources default maintained; --maintained lists Python inputs for its native tools.
Integrity reads only named source bytes and existing source-pin metadata.
"""

from __future__ import annotations

import argparse
import ast
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


CASE_FIELDS = {
    "id",
    "file",
    "rule",
    "kind",
    "decisionRef",
    "reviewedSource",
    "sourceSha256",
    "manifest",
    "reviewedManifest",
    "toolVersion",
    "configSha256",
    "proofEvidence",
    "controls",
}
DECISIONS = {
    "structured-receipt": ("T201", "6821734163"),
    "bound-placeholder-count": ("S608", "6821734741"),
    "standalone-entry": ("INP001", "6821735431"),
    "explicit-public-bind": ("S104", "6823970279"),
    "human-startup": ("T201", "6824017278"),
}


def load_registry(root: Path) -> dict:
    registry = strict_json((root / "scripts/source-inventory.json").read_text())
    if (
        set(registry) != {"version", "integrity", "maintainedDiagnosticCases"}
        or type(registry["version"]) is not int
        or registry["version"] != 1
    ):
        raise ValueError("unknown source inventory schema")
    if not isinstance(registry["integrity"], dict) or not isinstance(
        registry["maintainedDiagnosticCases"], list
    ):
        raise ValueError("invalid inventory collections")
    for name, entry in registry["integrity"].items():
        if set(entry) != {"classification", "pin", "format", "key"} or not all(
            isinstance(v, str) for v in entry.values()
        ):
            raise ValueError(f"invalid integrity entry: {name}")
    seen = set()
    for case in registry["maintainedDiagnosticCases"]:
        if set(case) != CASE_FIELDS or case["kind"] not in DECISIONS:
            raise ValueError("unknown diagnostic case fields/kind")
        rule, comment = DECISIONS[case["kind"]]
        if (
            case["rule"] != rule
            or case["decisionRef"]
            != f"https://github.com/0xTomDaniel/exosurface/issues/216#issuecomment-{comment}"
        ):
            raise ValueError("missing or mismatched implementation decision")
        if case["id"] in seen or case["file"] in registry["integrity"]:
            raise ValueError("duplicate case or maintained case classified integrity")
        seen.add(case["id"])
        if not all(isinstance(case[k], str) for k in CASE_FIELDS - {"proofEvidence", "controls"}):
            raise ValueError("invalid diagnostic case value")
        if not isinstance(case["controls"], list) or any(
            set(c) != {"name", "replaceOld", "replaceNew", "mutateReviewedToo", "expectedSemantic"}
            for c in case["controls"]
        ):
            raise ValueError("unknown portable control data")
        for control in case["controls"]:
            if any(
                not isinstance(control[k], str) for k in ("name", "replaceOld", "replaceNew")
            ) or any(
                type(control[k]) is not bool for k in ("mutateReviewedToo", "expectedSemantic")
            ):
                raise ValueError("invalid typed portable control")
        # Initial source slice deliberately cannot activate unproved adaptations.
        if case["proofEvidence"] is not None:
            raise ValueError(
                "predicate proof admission not implemented; all cases remain governing"
            )
    return registry


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


def exact_keys(value: object, keys: set[str]) -> dict:
    if not isinstance(value, dict) or set(value) != keys:
        raise ValueError("unknown/missing native object fields")
    return value


def integer(value: object, minimum: int = 0) -> int:
    if type(value) is not int or value < minimum or value > 9007199254740991:
        raise ValueError("native integer required, never boolean/nonfinite/unsafe integer")
    return value


def location(value: object, nullable: bool = False) -> tuple[int, int] | None:
    if value is None and nullable:
        return None
    point = exact_keys(value, {"row", "column"})
    return integer(point["row"], 1), integer(point["column"], 1)


def diagnostic(value: object) -> dict:
    fields = {
        "cell",
        "code",
        "end_location",
        "filename",
        "fix",
        "location",
        "message",
        "name",
        "noqa_row",
        "severity",
        "url",
    }
    row = exact_keys(value, fields)
    for key in ("code", "filename", "name", "url"):
        if row[key] is not None and not isinstance(row[key], str):
            raise ValueError(f"invalid native nullable string {key}")
    if not isinstance(row["message"], str) or row["severity"] not in {
        "error",
        "warning",
        "information",
    }:
        raise ValueError("invalid native message/severity")
    for key in ("cell", "noqa_row"):
        if row[key] is not None:
            integer(row[key], 1)
    start, end = location(row["location"], True), location(row["end_location"], True)
    if (start is None) != (end is None) or (start is not None and end < start):
        raise ValueError("invalid native diagnostic range")
    if row["fix"] is not None:
        fix = exact_keys(row["fix"], {"applicability", "edits", "message"})
        # Ruff0.17.1 ruff_diagnostics/src/fix.rs serde(rename_all=lowercase).
        if (
            fix["applicability"] not in {"safe", "unsafe", "displayonly"}
            or (fix["message"] is not None and not isinstance(fix["message"], str))
            or not isinstance(fix["edits"], list)
            or not fix["edits"]
        ):
            raise ValueError("invalid native fix")
        for edit in fix["edits"]:
            edit = exact_keys(edit, {"content", "location", "end_location"})
            if not isinstance(edit["content"], str) or location(edit["end_location"]) < location(
                edit["location"]
            ):
                raise ValueError("invalid native edit content/range")
    return row


def ast_equal(left: ast.AST, right: ast.AST) -> bool:
    return ast.dump(left, include_attributes=False) == ast.dump(right, include_attributes=False)


def fingerprint_producer(function: ast.FunctionDef) -> bool:
    """Receipt-specific, closed known cursor/hash/count evaluation, not reviewed text."""
    if function.decorator_list or len(function.body) != 4:
        return False
    # The SQL text is an existing source fact, not a database schema/domain assumption.
    initialization = ast.parse("h = hashlib.sha256()\ncount = 0").body
    cursor = ast.parse(
        """c.execute("SELECT id,thread_id,sequence,type,data FROM events WHERE NOT(type='thread/extensionState/updated' AND COALESCE(json_extract(data,'$.kind'),'')=?) ORDER BY thread_id,sequence", (KIND,))""",
        mode="eval",
    ).body
    update = ast.parse('h.update(json.dumps(row, separators=(",", ":")).encode())\ncount += 1').body
    result = ast.parse('return {"rows": count, "sha256": h.hexdigest()}').body[0]
    loop = function.body[2]
    if not all(
        ast_equal(actual, expected)
        for actual, expected in zip(function.body[:2], initialization, strict=True)
    ):
        return False
    if (
        not isinstance(loop, ast.For)
        or loop.orelse
        or loop.type_comment
        or not isinstance(loop.target, ast.Name)
        or loop.target.id != "row"
        or not isinstance(loop.target.ctx, ast.Store)
    ):
        return False
    if (
        not ast_equal(loop.iter, cursor)
        or len(loop.body) != 2
        or not all(
            ast_equal(actual, expected) for actual, expected in zip(loop.body, update, strict=True)
        )
    ):
        return False
    return ast_equal(function.body[3], result)


def readonly_ids_bindings(function: ast.FunctionDef) -> bool:
    """SQL-specific finite identity audit of EVERY ids reference, entire shrink lifetime."""
    producer = ast.parse(
        """ids = {r[0] for r in c.execute("SELECT id FROM events WHERE type='thread/extensionState/updated' AND json_extract(data,'$.kind')=?", (KIND,))}"""
    ).body[0]
    query = ast.parse(
        """not c.execute("SELECT 1 FROM retained_event_outputs WHERE event_id IN (" + ",".join("?" for _ in ids) + ") LIMIT 1", list(ids)).fetchone() if ids else True""",
        mode="eval",
    ).body
    producers = [(i, n) for i, n in enumerate(function.body) if ast_equal(n, producer)]
    guards = [
        (i, n)
        for i, n in enumerate(function.body)
        if isinstance(n, ast.Assert) and ast_equal(n.test, query)
    ]
    if (
        function.decorator_list
        or len(function.body) != 6
        or len(producers) != 1
        or len(guards) != 1
        or producers[0][0] != 2
        or guards[0][0] != 3
    ):
        return False
    # Close the remaining known transaction region too: no opaque callback/frame/
    # dynamic rebind is accepted merely because it spells the name as a string.
    transaction = ast.parse('''with c:
    c.execute("PRAGMA foreign_keys=ON")
    n = c.execute(DELETE, (KIND, KIND, KIND)).rowcount
    assert fingerprint(c) == before, "Non-owned-state event changed"
    assert latest(c) == heads, "Latest state/high-water mark changed"''').body[0]
    if not ast_equal(function.body[4], transaction):
        return False
    # Identity membership, not counts/strings: assignment target, guard, qmark iterator,
    # list binding only. Any alias/escape/use/rebind BEFORE OR AFTER the query refuses.
    allowed = {
        n
        for region in (producers[0][1], guards[0][1].test)
        for n in ast.walk(region)
        if isinstance(n, ast.Name) and n.id == "ids"
    }
    actual = {n for n in ast.walk(function) if isinstance(n, ast.Name) and n.id == "ids"}
    return (
        len(allowed) == 4
        and actual == allowed
        and not any(isinstance(n, ast.arg) and n.arg == "ids" for n in ast.walk(function))
    )


def responsibility_contract(tree: ast.Module, kind: str) -> bool:
    """Finite independent producer/caller contract. Source text is never executed."""
    imports = []
    for node in tree.body:
        if isinstance(node, ast.Import):
            imports.extend((a.name, a.asname) for a in node.names)
        elif isinstance(node, ast.ImportFrom):
            imports.extend((node.module, node.level, a.name, a.asname) for a in node.names)
    if imports != [
        ("hashlib", None),
        ("json", None),
        ("sqlite3", None),
        ("sys", None),
        ("datetime", 0, "datetime", None),
        ("pathlib", 0, "Path", None),
    ]:
        return False
    protected = {"print", "json", "sqlite3", "hashlib", "list", "set", "Path", "datetime"}
    parents = {child: node for node in ast.walk(tree) for child in ast.iter_child_nodes(node)}
    for node in ast.walk(tree):
        if (
            isinstance(node, ast.Call)
            and isinstance(node.func, ast.Name)
            and node.func.id
            in {"exec", "eval", "globals", "locals", "setattr", "delattr", "__import__"}
        ):
            return False
        if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Load) and node.id == "result":
            parent = parents.get(node)
            dump_arg = (
                isinstance(parent, ast.Call)
                and isinstance(parent.func, ast.Attribute)
                and isinstance(parent.func.value, ast.Name)
                and parent.func.value.id == "json"
                and parent.func.attr == "dumps"
            )
            store_key = isinstance(parent, ast.Subscript) and isinstance(parent.ctx, ast.Store)
            if not dump_arg and not store_key:
                return False
        if (
            isinstance(node, ast.Name)
            and isinstance(node.ctx, (ast.Store, ast.Del))
            and node.id in protected
        ):
            return False
        if isinstance(node, ast.arg) and node.arg in protected:
            return False
        if isinstance(node, (ast.FunctionDef, ast.ClassDef)) and node.name in protected:
            return False
        if isinstance(node, ast.Attribute) and isinstance(node.ctx, (ast.Store, ast.Del)):
            return False
        if (
            isinstance(node, ast.Name)
            and isinstance(node.ctx, ast.Load)
            and node.id in {"shrink", "fingerprint", "latest"}
        ):
            parent = parents.get(node)
            if not isinstance(parent, ast.Call) or parent.func is not node:
                return False

    def statements(text: str) -> list[ast.stmt]:
        return ast.parse(text, type_comments=True).body

    def present(nodes: list[ast.stmt], text: str) -> bool:
        expected = statements(text)
        return all(sum(ast_equal(node, wanted) for node in nodes) == 1 for wanted in expected)

    functions = {n.name: n for n in tree.body if isinstance(n, ast.FunctionDef)}
    if set(functions) != {"fingerprint", "latest", "shrink"}:
        return False
    for fn in functions.values():
        if (
            len(fn.args.args) != 1
            or fn.args.args[0].arg != "c"
            or fn.args.defaults
            or fn.args.kwonlyargs
            or fn.args.vararg
            or fn.args.kwarg
            or fn.args.posonlyargs
        ):
            return False
    if kind == "structured-receipt" and not fingerprint_producer(functions["fingerprint"]):
        return False
    if not present(tree.body, "d = sqlite3.connect(copy)\ndry = shrink(d)"):
        return False
    shrink = functions["shrink"]
    if not present(
        shrink.body,
        'before = fingerprint(c)\nheads = latest(c)\nreturn {"removedSupersededOwnStatusSnapshots": n, "nonStatusEvents": before, "latestOwnStatePerThreadPreserved": True}',
    ):
        return False
    if kind == "bound-placeholder-count" and not readonly_ids_bindings(shrink):
        return False
    apply = """if "--apply" in sys.argv:
    live = sqlite3.connect(DB, timeout=5)
    actual = shrink(live)
    live.close()
    result["liveResult"] = actual
    result["applied"] = True"""
    if len(tree.body) < 3 or not ast_equal(tree.body[-3], statements(apply)[0]):
        return False
    calls = [
        n
        for n in ast.walk(tree)
        if isinstance(n, ast.Call) and isinstance(n.func, ast.Name) and n.func.id == "shrink"
    ]
    if len(calls) != 2 or {ast.dump(n, include_attributes=False) for n in calls} != {
        ast.dump(ast.parse(x, mode="eval").body, include_attributes=False)
        for x in ("shrink(d)", "shrink(live)")
    }:
        return False
    result = """result = {"captured": datetime.now().astimezone().isoformat(), "databaseBackup": str(backup), "backupSha256": hashlib.sha256(backup.read_bytes()).hexdigest(), "copyResult": dry, "applied": False, "scope": "Only exo-spike/pi-ui superseded latest-state metadata; all conversation/tool/foreign events preserved"}"""
    if not present(tree.body, result):
        return False
    writes = [
        n
        for n in ast.walk(tree)
        if isinstance(n, ast.Name) and n.id == "result" and isinstance(n.ctx, (ast.Store, ast.Del))
    ]
    subs = [
        n
        for n in ast.walk(tree)
        if isinstance(n, ast.Subscript)
        and isinstance(n.value, ast.Name)
        and n.value.id == "result"
        and isinstance(n.ctx, (ast.Store, ast.Del))
    ]
    if len(writes) != 1 or len(subs) != 2:
        return False
    return True


def reviewserve_sites(
    tree: ast.Module, kind: str
) -> tuple[bool, ast.AST | list[ast.AST] | None, str]:
    def statement(text: str) -> ast.stmt:
        return ast.parse(text).body[0]

    def unique(text: str) -> ast.stmt | None:
        matches = [n for n in tree.body if ast_equal(n, statement(text))]
        return matches[0] if len(matches) == 1 else None

    parser = """def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("root", nargs="?", default=".")
    parser.add_argument("port", nargs="?", type=int, default=None)
    parser.add_argument("--public", action="store_true", help="bind to all host interfaces")
    parser.add_argument("--bind", default=None, help="bind address (default: loopback)")
    parser.add_argument("--host", default=None, help="host name or address printed in the review URL")
    return parser.parse_args()"""
    mains = [
        n
        for n in tree.body
        if isinstance(n, ast.If)
        and ast_equal(n.test, ast.parse('__name__ == "__main__"', mode="eval").body)
    ]
    if (
        unique(parser) is None
        or unique("ARGS = parse_args()") is None
        or len(mains) != 1
        or mains[0].orelse
    ):
        return False, None, "unknown CLI argument or entry producer"
    protected = {
        "ARGS",
        "BIND",
        "ROOT",
        "HTTPServer",
        "parse_args",
        "print",
        "argparse",
        "os",
        "socket",
    }
    expected_imports = ast.parse("""from __future__ import annotations
import argparse
import json
import os
import re
import socket
import subprocess
import time
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from typing import TYPE_CHECKING, override
from urllib.parse import parse_qs, urlparse""").body
    actual_imports = [n for n in tree.body if isinstance(n, (ast.Import, ast.ImportFrom))]
    if len(actual_imports) != len(expected_imports) or not all(
        ast_equal(a, b) for a, b in zip(actual_imports, expected_imports, strict=True)
    ):
        return False, None, "unknown operator CLI/library import bindings"
    for node in ast.walk(tree):
        if isinstance(node, ast.arg) and node.arg in protected:
            return False, None, "shadowed CLI/output binding"
        if isinstance(node, (ast.FunctionDef, ast.ClassDef)) and node.name in protected - {
            "parse_args"
        }:
            return False, None, "shadowed CLI/output callable"
        if isinstance(node, ast.alias) and (node.asname or node.name) == "print":
            return False, None, "imported print is not builtin"
        if (
            isinstance(node, ast.Call)
            and isinstance(node.func, ast.Name)
            and node.func.id in {"exec", "eval", "globals", "locals", "setattr", "delattr"}
        ):
            return False, None, "unsupported dynamic binding"
        if isinstance(node, ast.Attribute) and isinstance(node.ctx, (ast.Store, ast.Del)):
            return False, None, "unsupported attribute rebinding"
    for node in ast.walk(tree):
        if (
            isinstance(node, ast.Name)
            and node.id in {"HTTPServer", "parse_args", "print", "argparse", "os", "socket"}
            and isinstance(node.ctx, (ast.Store, ast.Del))
        ):
            return False, None, "rebound CLI/output callable"
    imports = [
        n
        for n in tree.body
        if isinstance(n, ast.ImportFrom) and n.module == "http.server" and n.level == 0
    ]
    if len(imports) != 1 or [(a.name, a.asname) for a in imports[0].names] != [
        ("HTTPServer", None),
        ("SimpleHTTPRequestHandler", None),
    ]:
        return False, None, "unknown HTTPServer import"
    if sum(isinstance(n, ast.FunctionDef) and n.name == "parse_args" for n in ast.walk(tree)) != 1:
        return False, None, "redefined argument parser"
    for name in {"ARGS", "BIND", "ROOT"}:
        if (
            sum(
                isinstance(n, ast.Name) and n.id == name and isinstance(n.ctx, (ast.Store, ast.Del))
                for n in ast.walk(tree)
            )
            != 1
        ):
            return False, None, "rebound CLI producer"
    parents = {child: node for node in ast.walk(tree) for child in ast.iter_child_nodes(node)}
    for node in ast.walk(tree):
        if isinstance(node, ast.Name) and node.id == "ARGS" and isinstance(node.ctx, ast.Load):
            parent = parents.get(node)
            if (
                not isinstance(parent, ast.Attribute)
                or parent.attr not in {"root", "port", "public", "bind", "host"}
                or not isinstance(parent.ctx, ast.Load)
            ):
                return False, None, "escaped/unknown ARGS use"
    main = mains[0]
    parser_node = unique(parser)
    args_node = unique("ARGS = parse_args()")
    if tree.body.index(parser_node) >= tree.body.index(args_node) or tree.body.index(
        args_node
    ) >= tree.body.index(main):
        return False, None, "argument producer evaluation order changed"
    server = statement("server = HTTPServer((BIND, port), Handler)")
    if not main.body or not ast_equal(main.body[0], server):
        return False, None, "unknown server target"
    if kind == "explicit-public-bind":
        binding = unique('BIND = ARGS.bind or ("0.0.0.0" if ARGS.public else "127.0.0.1")')
        literals = [
            n for n in ast.walk(tree) if isinstance(n, ast.Constant) and n.value == "0.0.0.0"
        ]
        bind_uses = [
            n
            for n in ast.walk(tree)
            if isinstance(n, ast.Name) and n.id == "BIND" and isinstance(n.ctx, ast.Load)
        ]
        expected_uses = [
            n for n in ast.walk(main.body[0]) if isinstance(n, ast.Name) and n.id == "BIND"
        ]
        if (
            binding is None
            or not tree.body.index(args_node) < tree.body.index(binding) < tree.body.index(main)
            or len(literals) != 1
            or bind_uses != expected_uses
        ):
            return (
                False,
                None,
                "not explicit public opt-in/default-loopback/explicit-bind precedence",
            )
        return True, literals[0], "known explicit operator bind; not authentication; proof pending"
    expected_main = ast.parse("""server = HTTPServer((BIND, port), Handler)
port = server.server_port
host = advertised_host()
print("spec-chat review-serve on http://{!s}:{:d}  root={!s}".format(*(host, port, ROOT)), flush=True)
print("review URL is the secret; stop this process when review ends", flush=True)
server.serve_forever()""").body
    prints = [n for n in ast.walk(tree) if isinstance(n, ast.Name) and n.id == "print"]
    if (
        len(main.body) != len(expected_main)
        or not all(ast_equal(a, b) for a, b in zip(main.body, expected_main, strict=True))
        or len(prints) != 2
        or unique("ROOT = os.path.realpath(ARGS.root)") is None
    ):
        return (
            False,
            None,
            "not sole ordered builtin startup pair with assigned-port/root provenance",
        )
    # Host producer must be source-audited independently; reviewed context alone is not proof.
    host_functions = [
        n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == "advertised_host"
    ]
    if len(host_functions) != 1 or host_functions[0].decorator_list:
        return False, None, "unknown advertised host producer"
    expected_host = """def advertised_host() -> str:
    if ARGS.host:
        return ARGS.host
    if not ARGS.public:
        return "127.0.0.1"
    try:
        probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        probe.connect(("8.8.8.8", 80))
        address = probe.getsockname()[0]
        probe.close()
        if address and not address.startswith("127."):
            return address
    except OSError:
        pass
    return socket.gethostname()"""
    if not ast_equal(host_functions[0], statement(expected_host)):
        return False, None, "advertised host producer changed; no request producer supported"
    return (
        True,
        [main.body[3].value.func, main.body[4].value.func],
        "known human startup pair, not request logging/JSON receipt/authentication; proof pending",
    )


def semantic_site(
    source: str, reviewed: str, kind: str
) -> tuple[bool, ast.AST | list[ast.AST] | None, str]:
    """Independent DATA predicate, deliberately no source-hash admission shortcut."""
    tree = ast.parse(source, type_comments=True)
    golden = ast.parse(reviewed, type_comments=True)
    if not ast_equal(tree, golden):
        return False, None, "reviewed module/remainder/caller context changed"
    if kind in {"explicit-public-bind", "human-startup"}:
        return reviewserve_sites(tree, kind)
    if not responsibility_contract(tree, kind):
        return False, None, "owned producer/binding/caller responsibility contract changed"
    if kind == "structured-receipt":
        calls = [
            n
            for n in ast.walk(tree)
            if isinstance(n, ast.Call) and isinstance(n.func, ast.Name) and n.func.id == "print"
        ]
        expected = ast.parse("print(json.dumps(result, indent=2))").body[0].value
        audit = ast.parse(
            '(BASE / "evidence/status-repair.json").write_text(json.dumps(result, indent=2) + "\\n")'
        ).body[0]
        if (
            len(calls) != 1
            or not ast_equal(calls[0], expected)
            or len(tree.body) < 2
            or not ast_equal(tree.body[-2], audit)
            or not ast_equal(tree.body[-1], ast.Expr(value=expected))
        ):
            return False, None, "not sole structured receipt after same-result audit write"
        return (
            True,
            calls[0].func,
            "structured receipt and independent producer/caller contract match; controls unproved",
        )
    if kind == "bound-placeholder-count":
        functions = [n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == "shrink"]
        if len(functions) != 1:
            return False, None, "missing unique shrink"
        expression = """not c.execute("SELECT 1 FROM retained_event_outputs WHERE event_id IN (" + ",".join("?" for _ in ids) + ") LIMIT 1", list(ids)).fetchone() if ids else True"""
        expected = ast.parse(expression, mode="eval").body
        matches = [
            n for n in ast.walk(functions[0]) if isinstance(n, ast.IfExp) and ast_equal(n, expected)
        ]
        if len(matches) != 1:
            return False, None, "not cardinality-only qmarks with same ids bound separately"
        query = matches[0].body.operand.func.value.args[0]
        return (
            True,
            query,
            "bound qmark cardinality and independent ids/default-caller contract match; controls unproved",
        )
    if kind == "standalone-entry":
        doc = ast.get_docstring(tree, clean=False)
        expected_doc = "One-time BB0.45 repair of this adapter's redundant status metadata only.\nNo conversation trimming, schema/index/bundle patch, or recurring DB integration.\nPrivate consistent backup + tested-copy preservation are required before --apply.\n"
        if doc != expected_doc or not any(
            isinstance(n, ast.Assert)
            and isinstance(n.test, ast.Compare)
            and any(isinstance(x, ast.Constant) and x.value == "0.45.0" for x in n.test.comparators)
            for n in tree.body
        ):
            return False, None, "standalone version-specific operational purpose changed"
        # Manifest/directory/repository consumer facts are checked outside the source-only predicate.
        return (
            True,
            tree,
            "standalone operational source contract matches; repository intent controls unproved",
        )
    return False, None, "unknown responsibility kind"


def ruff_span(node: ast.AST, source: str) -> tuple[dict, dict]:
    lines = source.splitlines()

    def point(row: int, byte: int) -> dict:
        prefix = lines[row - 1].encode("utf-8")[:byte].decode("utf-8", errors="strict")
        return {"row": row, "column": len(prefix) + 1}

    return point(node.lineno, node.col_offset), point(node.end_lineno, node.end_col_offset)


def standalone_facts(root: Path, case: dict) -> bool:
    manifest = json.loads((root / case["manifest"]).read_text())
    if manifest.get("scripts") != {
        "typecheck": "tsc --noEmit",
        "test": "node --experimental-transform-types --test --test-isolation=none test/*.test.ts",
    }:
        return False
    script = root / case["file"]
    if script.name != "compact-own-status.py":
        return False
    directory = script.parent
    while directory != root:
        if (
            not directory.is_relative_to(root)
            or (directory / "__init__.py").exists()
            or (directory / "pyproject.toml").exists()
        ):
            return False
        directory = directory.parent
    tracked = subprocess.check_output(
        ["git", "-C", str(root), "ls-files", "--cached", "--others", "--exclude-standard", "-z"],
        text=True,
    )
    # Conservative import/invocation-consumer notice. New occurrences refuse pending review.
    for name in tracked.split("\0"):
        if name == case["file"] or not name.endswith((".py", ".ts", ".js", ".mjs", ".cjs")):
            continue
        text = (root / name).read_text()
        if name.endswith(".py"):
            other = ast.parse(text, type_comments=True)
            for node in ast.walk(other):
                if isinstance(node, ast.Import) and any(
                    a.name in {"compact_own_status", "compact-own-status"} for a in node.names
                ):
                    return False
                if isinstance(node, ast.ImportFrom) and node.module in {
                    "compact_own_status",
                    "compact-own-status",
                }:
                    return False
                if isinstance(node, ast.Call) and any(
                    isinstance(arg, ast.Constant)
                    and isinstance(arg.value, str)
                    and ("compact-own-status" in arg.value or "compact_own_status" in arg.value)
                    for arg in node.args
                ):
                    return False
        elif "compact-own-status" in text or "compact_own_status" in text:
            return False
    return True


def classify_ruff(root: Path, registry: dict, envelope: dict) -> dict:
    fields = {
        "version",
        "tool",
        "toolVersion",
        "configSha256",
        "inputs",
        "coverage",
        "sourceHashes",
        "nativeRC",
        "stdout",
        "stderr",
        "signal",
        "error",
    }
    if (
        set(envelope) != fields
        or type(envelope["version"]) is not int
        or envelope["version"] != 1
        or envelope["tool"] != "ruff"
    ):
        raise ValueError("unknown Ruff envelope protocol")
    if (
        envelope["error"] is not None
        or envelope["signal"] is not None
        or type(envelope["nativeRC"]) is not int
        or envelope["nativeRC"] not in (0, 1)
    ):
        raise ValueError("native Ruff unanswered")
    if not isinstance(envelope["stdout"], str) or not isinstance(envelope["stderr"], str):
        raise ValueError("missing raw native output")
    tracked = subprocess.check_output(
        ["git", "-C", str(root), "ls-files", "--cached", "--others", "--exclude-standard", "-z"],
        text=True,
    )
    maintained = sorted(
        {n for n in tracked.split("\0") if n.endswith(".py") and n not in registry["integrity"]}
    )
    if (
        envelope["inputs"] != maintained
        or envelope["coverage"] != maintained
        or set(envelope["sourceHashes"]) != set(maintained)
    ):
        raise ValueError("maintained/native input coverage mismatch")
    for name in maintained:
        if envelope["sourceHashes"][name] != hashlib.sha256((root / name).read_bytes()).hexdigest():
            raise ValueError("source changed since native analysis")
    raw = strict_json(envelope["stdout"])
    if not isinstance(raw, list) or envelope["nativeRC"] != (1 if raw else 0):
        raise ValueError("native RC/report count inconsistent")
    allowed = {
        "cell",
        "code",
        "end_location",
        "filename",
        "fix",
        "location",
        "message",
        "name",
        "noqa_row",
        "severity",
        "url",
    }
    records = []
    for index, finding in enumerate(raw):
        diagnostic(finding)
        record = {
            "rawIndex": index,
            "raw": finding,
            "disposition": "governing",
            "reason": "unknown or unproved site",
        }
        for case in registry["maintainedDiagnosticCases"]:
            if case["file"] not in maintained:
                continue
            filename = finding["filename"]
            if (
                not isinstance(filename, str)
                or Path(filename).resolve() != (root / case["file"]).resolve()
                or finding["code"] != case["rule"]
            ):
                continue
            source = (root / case["file"]).read_text()
            semantic, site, reason = semantic_site(source, case["reviewedSource"], case["kind"])
            if case["kind"] == "standalone-entry":
                semantic = semantic and standalone_facts(root, case)
            admitted = (
                hashlib.sha256(source.encode()).hexdigest()
                == case["sourceSha256"]
                == envelope["sourceHashes"].get(case["file"])
                and envelope["toolVersion"] == case["toolVersion"]
                and envelope["configSha256"] == case["configSha256"]
                and (root / case["manifest"]).read_text() == case["reviewedManifest"]
            )
            bound = False
            if semantic and site is not None:
                if isinstance(site, list):
                    spans = [ruff_span(node, source) for node in site]
                    candidates = [
                        row
                        for row in raw
                        if row["code"] == case["rule"]
                        and isinstance(row["filename"], str)
                        and Path(row["filename"]).resolve() == (root / case["file"]).resolve()
                    ]
                    bounded = len(candidates) == len(spans) and all(
                        sum(
                            row["location"] == start and row["end_location"] == end
                            for row in candidates
                        )
                        == 1
                        for start, end in spans
                    )
                    bound = bounded and any(
                        finding["location"] == start and finding["end_location"] == end
                        for start, end in spans
                    )
                elif isinstance(site, ast.Module):
                    bound = finding["location"] == {"row": 1, "column": 1} and finding[
                        "end_location"
                    ] == {"row": 1, "column": 1}
                else:
                    start, end = ruff_span(site, source)
                    bound = finding["location"] == start and finding["end_location"] == end
                    if case["kind"] == "explicit-public-bind":
                        candidates = [
                            row
                            for row in raw
                            if row["code"] == case["rule"]
                            and isinstance(row["filename"], str)
                            and Path(row["filename"]).resolve() == (root / case["file"]).resolve()
                        ]
                        bound = bound and len(candidates) == 1
            record.update(
                {
                    "caseId": case["id"],
                    "decisionRef": case["decisionRef"],
                    "semanticResult": semantic,
                    "admissionResult": admitted,
                    "siteBound": bound,
                    "reason": reason
                    + "; activation blocked: predicate controls/proof admission incomplete",
                }
            )
        records.append(record)
    return {
        "version": 1,
        "native": envelope,
        "records": records,
        "rawCount": len(raw),
        "governingCount": len(records),
        "adaptedCount": 0,
        "fullCoverage": True,
        "proofAdmissionImplemented": False,
    }


def native_execution(root: Path, registry: dict, envelope: dict) -> list[str]:
    tracked = subprocess.check_output(
        ["git", "-C", str(root), "ls-files", "--cached", "--others", "--exclude-standard", "-z"],
        text=True,
    )
    maintained = sorted(
        {n for n in tracked.split("\0") if n.endswith(".py") and n not in registry["integrity"]}
    )
    if not maintained or envelope["inputs"] != maintained or envelope["coverage"] != maintained:
        raise ValueError("Based maintained input membership differs")
    for name in maintained:
        file = root / name
        if (
            name.startswith("-")
            or Path(name).is_absolute()
            or any(c in name for c in "*?[]")
            or not file.is_file()
            or file.is_symlink()
            or not file.resolve().is_relative_to(root)
        ):
            raise ValueError("unsupported native root file specification")
    execution = exact_keys(
        envelope["execution"],
        {"argv", "cwd", "sourceHashesBefore", "sourceHashesAfter", "profileBefore", "profileAfter"},
    )
    expected_argv = (
        [
            "exec",
            "basedpyright",
            "--project",
            "pyrightconfig.json",
            "--outputjson",
            "--warnings",
            *maintained,
        ]
        if envelope["tool"] == "basedpyright"
        else ["check", "--output-format", "json", *maintained]
    )
    if execution["argv"] != expected_argv or execution["cwd"] != str(root):
        raise ValueError("Based explicit CLI root-file contract differs, count is not membership")
    current = {name: hashlib.sha256((root / name).read_bytes()).hexdigest() for name in maintained}
    if (
        envelope["sourceHashes"] != current
        or execution["sourceHashesBefore"] != current
        or execution["sourceHashesAfter"] != current
    ):
        raise ValueError("Based native source hash bracket differs")
    pins = {
        "ruff.toml": "5ce787e987a1dd0ddc0e53be46f3865ef60305ad23433d1713b450b3e0cd2e87",
        "pyrightconfig.json": "61b4068969e027bf296d7bbe60404366d94bce99fef1cafc09769e39a81744bd",
    }
    profiles = [
        {
            "file": name,
            "mode": (root / name).stat().st_mode,
            "sha256": hashlib.sha256((root / name).read_bytes()).hexdigest(),
        }
        for name in pins
    ]
    if (
        execution["profileBefore"] != profiles
        or execution["profileAfter"] != profiles
        or any(p["sha256"] != pins[p["file"]] for p in profiles)
        or envelope["configSha256"]
        != pins["pyrightconfig.json" if envelope["tool"] == "basedpyright" else "ruff.toml"]
    ):
        raise ValueError("Based canonical profile bracket differs")
    return maintained


def audit_native(root: Path, registry: dict, envelope: dict) -> dict:
    """Canonical native answer audit, also available for durable raw-evidence replay."""
    if isinstance(envelope, dict) and envelope.get("tool") == "ruff":
        if "execution" not in envelope:
            return classify_ruff(root, registry, envelope)
        native_execution(root, registry, envelope)
        if envelope["toolVersion"] != "0.17.1":
            raise ValueError("unknown Ruff execution version")
        legacy = {k: v for k, v in envelope.items() if k != "execution"}
        report = classify_ruff(root, registry, legacy)
        report["native"] = envelope
        return report
    fields = {
        "version",
        "tool",
        "toolVersion",
        "configSha256",
        "inputs",
        "coverage",
        "sourceHashes",
        "nativeRC",
        "stdout",
        "stderr",
        "signal",
        "error",
        "execution",
    }
    exact_keys(envelope, fields)
    if (
        type(envelope["version"]) is not int
        or envelope["version"] != 1
        or envelope["tool"] != "basedpyright"
        or envelope["toolVersion"] != "1.40.2"
    ):
        raise ValueError("unknown Based envelope/version")
    if (
        envelope["signal"] is not None
        or envelope["error"] is not None
        or integer(envelope["nativeRC"]) not in (0, 1)
    ):
        raise ValueError("Based unanswered native status")
    if not isinstance(envelope["stdout"], str) or not isinstance(envelope["stderr"], str):
        raise ValueError("missing raw Based answer")
    maintained = native_execution(root, registry, envelope)
    native = exact_keys(
        strict_json(envelope["stdout"]), {"version", "time", "generalDiagnostics", "summary"}
    )
    if (
        native["version"] != "1.40.2"
        or not isinstance(native["time"], str)
        or not isinstance(native["generalDiagnostics"], list)
    ):
        raise ValueError("unknown Based native report")
    summary = exact_keys(
        native["summary"],
        {"filesAnalyzed", "errorCount", "warningCount", "informationCount", "timeInSec"},
    )
    for name in ("filesAnalyzed", "errorCount", "warningCount", "informationCount"):
        integer(summary[name])
    import math

    elapsed = summary["timeInSec"]
    if (
        type(elapsed) not in (int, float)
        or elapsed < 0
        or elapsed > 9007199254740991
        or not math.isfinite(elapsed)
    ):
        raise ValueError("invalid Based elapsed time")
    counts = {"error": 0, "warning": 0, "information": 0}
    records = []
    for index, row in enumerate(native["generalDiagnostics"]):
        if (
            not isinstance(row, dict)
            or not {"file", "message", "severity"} <= set(row)
            or set(row) - {"file", "message", "severity", "range", "rule", "cell"}
        ):
            raise ValueError("unknown Based diagnostic fields")
        if (
            not isinstance(row["message"], str)
            or not isinstance(row["severity"], str)
            or row["severity"] not in counts
        ):
            raise ValueError("unknown Based diagnostic severity/message")
        for name in ("file", "rule"):
            if name in row and not isinstance(row[name], str):
                raise ValueError("invalid Based string; global file is empty string")
        if "cell" in row:
            integer(row["cell"])
        if "range" in row:
            span = exact_keys(row["range"], {"start", "end"})
            points = []
            for name in ("start", "end"):
                point = exact_keys(span[name], {"line", "character"})
                points.append((integer(point["line"]), integer(point["character"])))
            if points[1] < points[0]:
                raise ValueError("reversed Based diagnostic range")
        counts[row["severity"]] += 1
        records.append(
            {
                "rawIndex": index,
                "raw": row,
                "disposition": "governing",
                "reason": "all Based findings govern including global/library/no-file",
            }
        )
    if (
        summary["filesAnalyzed"] != len(maintained)
        or any(
            summary[name + "Count"] != counts[severity]
            for name, severity in [
                ("error", "error"),
                ("warning", "warning"),
                ("information", "information"),
            ]
        )
        or envelope["nativeRC"] != (1 if counts["error"] or counts["warning"] else 0)
    ):
        raise ValueError("Based count/status consistency differs (--warnings contract)")
    return {
        "version": 1,
        "native": envelope,
        "records": records,
        "rawCount": len(records),
        "governingCount": len(records),
        "adaptedCount": 0,
        "fullCoverage": True,
        "proofAdmissionImplemented": False,
        "rootSelection": "pinned explicit argv includeFileSpecsOverride contract",
        "programMembershipEnumerated": False,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parent.parent)
    parser.add_argument("--maintained", action="store_true")
    parser.add_argument("--exempt", action="store_true")
    parser.add_argument("--classify-ruff", action="store_true")
    parser.add_argument("--audit-native", action="store_true")
    parser.add_argument("--evaluate-controls", action="store_true")
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
    if args.evaluate_controls:
        results = []
        for case in registry["maintainedDiagnosticCases"]:
            for control in case["controls"]:
                before = case["reviewedSource"]
                if control["replaceOld"]:
                    if before.count(control["replaceOld"]) != 1:
                        raise ValueError("control must identify exactly one public source span")
                    changed = before.replace(control["replaceOld"], control["replaceNew"], 1)
                else:
                    changed = before
                reviewed = changed if control["mutateReviewedToo"] else before
                actual, _, reason = semantic_site(changed, reviewed, case["kind"])
                results.append(
                    {
                        "caseId": case["id"],
                        "control": control["name"],
                        "expected": control["expectedSemantic"],
                        "actual": actual,
                        "reason": reason,
                        "pass": actual is control["expectedSemantic"],
                    }
                )
        print(json.dumps({"results": results, "activation": False}))
        if not results or any(not row["pass"] for row in results):
            parser.exit(1, "responsibility controls unanswered or RED\n")
    elif args.classify_ruff or args.audit_native:
        import sys

        try:
            print(
                json.dumps(
                    (classify_ruff if args.classify_ruff else audit_native)(
                        root, registry, strict_json(sys.stdin.read())
                    ),
                    ensure_ascii=True,
                )
            )
        except (ValueError, KeyError, TypeError, OSError, SyntaxError) as error:
            parser.exit(2, f"source-inventory: unanswered native evidence: {error}\n")
    elif args.exempt:
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
