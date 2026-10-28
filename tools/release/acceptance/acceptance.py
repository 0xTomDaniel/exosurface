#!/usr/bin/env python3
"""Independent release acceptance checks for the Mac release (docs/specs/mac-release.spec.html).

Standard library only, Python >= 3.9. Every check is read-only: it never writes outside a
path the caller passes with --out, never starts, stops or reloads anything, and never prints
file contents (only paths, rule names and line numbers).

What these checks can prove is static: a built release is private and well formed, a starter
artifact is private and unmodified, an installed home is wired as the spec states, and the live
Exo was not touched. They cannot prove that Exo works. Every gate that needs a real BB, a real
sign-in, a reboot or a never-used macOS account stays OPEN until a person records evidence for
it, and even then it is reported as RECORDED, never PASS.

Commands (all print stable JSON with --json):
  package  <release-dir>             release.json contract, allowlist, privacy scan
  starter  <artifact-dir|vault-dir>  starter contract, hashes, privacy scan
  install  --home <HOME>             installed wiring: config, launchd job, state, vault receipt
  isolation snapshot --out <file>    fingerprint the live Exo (stat + sha256, contents never printed)
  isolation compare <before> <after> fail when any live fingerprint changed
  gates   [--evidence <dir>]         the release gate table; manual gates stay OPEN
"""

from __future__ import annotations

import argparse
import fnmatch
import hashlib
import json
import os
import plistlib
import re
import subprocess
import sys
from pathlib import Path

PACKAGE_CONTRACT = "exosurface-package/0"
STARTER_CONTRACT = "exo-mac-starter/0"
OWNER_LABEL = "app.exosurface.owner"
LIVE_LABEL_PREFIX = "local.exocortex."
DEFAULT_CONFIG = ".config/exosurface/config.json"
DEFAULT_STATE = ".exosurface"
LIVE_CONFIG = ".config/exo/exosurface.json"
LIVE_STATE_DIRS = (".exo-bb-spike", ".exo-a2ui-spike", ".optchat-exocortex-test", ".optchat-exo-a2ui")
MODEL_ROLES = ("main", "compactor", "subagent")
MODEL_FIELDS = ("provider", "model", "thinking")
# Known runtime floors: a pinned dependency's own engines requirement.
KNOWN_NODE_FLOORS = {("pi", "1.1.0"): (22, 19, 0)}
EXACT_VERSION = re.compile(r"^\d+\.\d+\.\d+$")

# Paths that must never be in a release or starter, wherever they appear.
DENY_PATH_GLOBS = (
    "node_modules", "node_modules/*", "*/node_modules", "*/node_modules/*",
    "evidence", "evidence/*", "*/evidence", "*/evidence/*",
    ".git", ".git/*", "*/.git", "*/.git/*",
    "*.jsonl", "*session*.json", "canonical-thread.json", "*/canonical-thread.json",
    "auth.json", "*/auth.json", "mcp.json", "*/mcp.json", "mcp-auth.json", "*/mcp-auth.json",
    "trust.json", "*/trust.json", ".env", "*/.env", ".env.*", "*/.env.*",
    "*.pem", "*.key", "*.p12", "id_rsa*", "*/id_rsa*", "id_ed25519*", "*/id_ed25519*",
    ".DS_Store", "*/.DS_Store", "*.log",
)
# Content rules. Generic only: personal names come from the caller, never from this file.
CONTENT_RULES = (
    ("home-path", re.compile(r"/Users/[A-Za-z0-9._-]+/")),
    ("proxy", re.compile(r"cliproxy", re.I)),
    ("bb-thread-id", re.compile(r"\bthr_[a-z0-9]{10}\b")),
    ("private-key", re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----")),
    ("openai-key", re.compile(r"\bsk-[A-Za-z0-9_-]{20,}")),
    ("anthropic-key", re.compile(r"\bsk-ant-[A-Za-z0-9_-]{20,}")),
    ("github-token", re.compile(r"\bgh[pousr]_[A-Za-z0-9]{30,}")),
    ("slack-token", re.compile(r"\bxox[abpr]-[A-Za-z0-9-]{10,}")),
    ("aws-key", re.compile(r"\bAKIA[0-9A-Z]{16}\b")),
    ("client-secret", re.compile(r"client_secret\"?\s*[:=]\s*\"[^\"\s]{8,}", re.I)),
    ("bearer", re.compile(r"Bearer\s+[A-Za-z0-9._-]{20,}")),
)
TEXT_LIMIT = 8 * 1024 * 1024
# Inherited runtime selectors that would point a child process at the live Exo. Accident guard only.
LIVE_ENV = re.compile(r"^(EXO_|EXOSURFACE_|EXO_BB_|EXO_A2UI_|OPTCHAT_|PI_)")


def scrubbed_env() -> dict:
    """The environment for every child process: inherited Exo/OptChat/Pi selectors removed."""
    return {k: v for k, v in os.environ.items() if k in {"HOME", "PATH", "TMPDIR", "LANG", "LC_ALL", "SYSTEMROOT"}}


class Report:
    def __init__(self, check: str, level: str):
        self.check = check
        self.level = level  # fixture | installable | live-isolation | gates
        self.findings: list[dict] = []
        self.notes: list[str] = []

    def fail(self, rule: str, where: str = "", detail: str = "") -> None:
        self.findings.append({"rule": rule, "where": where, "detail": detail})

    @property
    def ok(self) -> bool:
        return not self.findings

    def as_dict(self) -> dict:
        findings = sorted(self.findings, key=lambda f: (f["rule"], f["where"], f["detail"]))
        return {
            "check": self.check,
            "level": self.level,
            "result": "pass" if self.ok else "fail",
            "findings": findings,
            "notes": self.notes,
            "proves": "static wiring only; not that Exo works (see gates)",
        }


# ---------- shared helpers ----------

def deny_terms(extra_file: str | None) -> list[str]:
    """Personal terms to refuse: the current user's login and git identity, plus an optional file.

    The terms file lives outside the repository so that no personal name is committed here.
    """
    terms: set[str] = set()
    user = os.environ.get("USER", "")
    if len(user) >= 4:
        terms.add(user)
    for key in ("user.name", "user.email"):
        try:
            value = subprocess.run(["git", "config", "--global", key], capture_output=True,
                                   text=True, timeout=5, env=scrubbed_env()).stdout.strip()
        except (OSError, subprocess.SubprocessError):
            value = ""
        if key == "user.email" and "@" in value:
            value = value.split("@", 1)[0]
        if len(value) >= 4:
            terms.add(value)
    path = Path(extra_file).expanduser() if extra_file else Path.home() / ".config/exosurface-release/deny-terms.txt"
    if path.is_file():
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#"):
                terms.add(line)
    return sorted(terms)


def rel_files(root: Path) -> list[Path]:
    out = []
    for dirpath, dirnames, filenames in os.walk(root, followlinks=False):
        dirnames.sort()
        base = Path(dirpath)
        for name in sorted(filenames) + [d for d in dirnames if (base / d).is_symlink()]:
            out.append((base / name).relative_to(root))
    return sorted(set(out))


def denied_path(rel: str) -> str | None:
    for glob in DENY_PATH_GLOBS:
        if fnmatch.fnmatchcase(rel, glob) or fnmatch.fnmatchcase(Path(rel).name, glob):
            return glob
    return None


def scan_content(report: Report, root: Path, rel: Path, terms: list[str]) -> None:
    path = root / rel
    if path.is_symlink() or not path.is_file():
        return
    if path.stat().st_size > TEXT_LIMIT:
        report.fail("content-unscanned-size", str(rel))
        return
    try:
        text = path.read_bytes().decode("utf-8")
    except UnicodeDecodeError:
        return
    lowered = text.lower()
    for rule, pattern in CONTENT_RULES:
        match = pattern.search(text)
        if match:
            line = text.count("\n", 0, match.start()) + 1
            report.fail(f"content:{rule}", f"{rel}:{line}")
    for index, term in enumerate(terms):
        pos = lowered.find(term.lower())
        if pos >= 0:
            line = text.count("\n", 0, pos) + 1
            # The term itself is never printed, only which configured term matched.
            report.fail("content:personal-term", f"{rel}:{line}", f"term #{index + 1}")


def check_symlinks(report: Report, root: Path, rel: Path) -> None:
    path = root / rel
    if path.is_symlink():
        target = os.path.realpath(path)
        if not target.startswith(os.path.realpath(root) + os.sep):
            report.fail("symlink-escapes", str(rel))


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def parse_floor(spec: str) -> tuple[int, ...] | None:
    match = re.fullmatch(r">=\s*(\d+)\.(\d+)\.(\d+)", spec.strip())
    return tuple(int(x) for x in match.groups()) if match else None


def inside_git_checkout(path: Path) -> bool:
    for parent in [path] + list(path.parents):
        if (parent / ".git").exists():
            return True
    return False


# ---------- package ----------

def check_package(release_dir: Path, terms: list[str]) -> Report:
    report = Report("package", "fixture")
    manifest_path = release_dir / "release.json"
    if not manifest_path.is_file():
        report.fail("manifest-missing", "release.json")
        return report
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        report.fail("manifest-invalid", "release.json", str(error.msg))
        return report

    if manifest.get("contract") != PACKAGE_CONTRACT:
        report.fail("contract", "release.json", f"expected {PACKAGE_CONTRACT}")
    if not re.fullmatch(r"[a-z][a-z0-9-]{1,40}", str(manifest.get("id", ""))):
        report.fail("id", "release.json", "expected lowercase slug")
    owner = manifest.get("owner") or {}
    if not isinstance(owner, dict):
        report.fail("owner-shape", "release.json", "expected object")
        return report
    if owner.get("launchdLabel") != OWNER_LABEL:
        report.fail("owner-label", "release.json", f"expected {OWNER_LABEL}")
    entry = owner.get("entry")
    if not entry or not (release_dir / entry).is_file():
        report.fail("owner-entry-missing", "release.json", str(entry))
    schema = manifest.get("stateSchema") or {}
    writes, reads = schema.get("writes"), schema.get("reads")
    if not isinstance(writes, int) or not isinstance(reads, list) or writes not in reads:
        report.fail("state-schema", "release.json", "writes must be an int listed in reads")
    requires = manifest.get("requires") or {}
    node_floor = parse_floor(str(requires.get("node", "")))
    if node_floor is None:
        report.fail("requires-node", "release.json", "expected >=X.Y.Z")
    if parse_floor(str(requires.get("bb", ""))) is None:
        report.fail("requires-bb", "release.json", "expected >=X.Y.Z")
    pins = manifest.get("pins") or {}
    if not isinstance(pins, dict) or any(not isinstance(pins.get(name), dict) for name in ("pi", "optchat")):
        report.fail("pins-shape", "release.json", "expected structured npm/git pin objects")
        return report
    if pins["pi"].get("npm") != "@earendil-works/pi-coding-agent":
        report.fail("pi-package", "release.json")
    if pins["optchat"].get("git") != "https://github.com/jonaslsaa/pi-optchat.git":
        report.fail("optchat-source", "release.json")
    for name in ("pi", "optchat"):
        version = str((pins.get(name) or {}).get("version", ""))
        if not EXACT_VERSION.match(version):
            report.fail("pin-not-exact", "release.json", name)
        floor = KNOWN_NODE_FLOORS.get((name, version))
        if floor and node_floor and node_floor < floor:
            report.fail("node-floor-below-pin", "release.json",
                        f"{name} {version} needs node >=" + ".".join(map(str, floor)))
    for name, expected in (("pi", "1.1.0"), ("optchat", "0.8.6")):
        if (pins.get(name) or {}).get("version") != expected:
            report.fail("pin-contract", "release.json", name)
    if (pins.get("optchat") or {}).get("commit") != "aae1caf7715830051d327f819fc776792211167a":
        report.fail("optchat-commit", "release.json")
    if not any((release_dir / "dist").glob("*")):
        report.fail("dist-missing", "dist/", "prebuilt dist is required")

    allow = list(manifest.get("files") or [])
    allow += ["release.json", "SHA256SUMS", "checksums.json"]
    for rel in rel_files(release_dir):
        text = rel.as_posix()
        check_symlinks(report, release_dir, rel)
        denied = denied_path(text)
        if denied:
            report.fail("path-denied", text, denied)
            continue
        if not any(fnmatch.fnmatchcase(text, glob) or (glob.endswith("/**") and text.startswith(glob[:-2]))
                   for glob in allow):
            report.fail("path-not-allowlisted", text)
        scan_content(report, release_dir, rel, terms)
    return report


# ---------- starter ----------

def check_starter(root: Path, terms: list[str], allow_dirty: bool) -> Report:
    report = Report("starter", "fixture")
    artifact = root / "starter-artifact.json"
    receipt = root / ".exo/starter-receipt.json"
    if artifact.is_file():
        try:
            data = json.loads(artifact.read_text(encoding="utf-8"))
        except json.JSONDecodeError as error:
            report.fail("artifact-invalid", "starter-artifact.json", error.msg)
            return report
        if data.get("contract") != STARTER_CONTRACT:
            report.fail("contract", "starter-artifact.json", f"expected {STARTER_CONTRACT}")
        source = data.get("source") or data
        if source.get("dirty") and not allow_dirty:
            report.fail("starter-dirty", "starter-artifact.json", "built from uncommitted source")
        if not re.fullmatch(r"[0-9a-f]{7,40}", str(source.get("commit", ""))):
            report.fail("starter-commit", "starter-artifact.json")
        hashes = data.get("files") or {}
        if isinstance(hashes, list):
            hashes = {item.get("path"): item.get("sha256") for item in hashes if isinstance(item, dict)}
        if not hashes:
            report.fail("starter-hashes-missing", "starter-artifact.json")
        for rel, expected in sorted(hashes.items()):
            if Path(rel).is_absolute() or ".." in Path(rel).parts:
                report.fail("starter-path-escapes", str(rel))
                continue
            candidates = [root / "payload" / rel, root / rel]
            found = next((c for c in candidates if c.is_file()), None)
            if found is None:
                report.fail("starter-file-missing", str(rel))
            elif expected and sha256(found) != (expected.get("sha256") if isinstance(expected, dict) else expected):
                report.fail("starter-hash-mismatch", str(rel))
    elif receipt.is_file():
        report.fail("starter-artifact-required", str(root), "verify the built starter artifact; a receipt alone does not establish source provenance")
    else:
        report.fail("starter-unknown", str(root), "neither starter-artifact.json nor .exo/starter-receipt.json")
        return report
    for rel in rel_files(root):
        text = rel.as_posix()
        if text == ".exo/starter-receipt.json":
            continue
        check_symlinks(report, root, rel)
        denied = denied_path(text)
        if denied:
            report.fail("path-denied", text, denied)
        scan_content(report, root, rel, terms)
    return report


# ---------- install ----------

def find_timezone(value) -> str | None:
    if isinstance(value, dict):
        for key, item in value.items():
            if "timezone" in key.lower() and isinstance(item, str):
                return item
            found = find_timezone(item)
            if found:
                return found
    return None


def check_install(home: Path, config_override: str | None) -> Report:
    report = Report("install", "installable")
    report.notes.append("installable is not functional: a passing install check does not prove Exo answers")
    plist_path = home / "Library/LaunchAgents" / f"{OWNER_LABEL}.plist"
    plist = None
    if not plist_path.is_file():
        report.fail("launchd-missing", str(plist_path.relative_to(home)))
    else:
        try:
            plist = plistlib.loads(plist_path.read_bytes())
        except Exception:  # noqa: BLE001 - any parse error is a finding
            report.fail("launchd-invalid", plist_path.name)
    env = (plist or {}).get("EnvironmentVariables") or {}
    config_path = Path(config_override or env.get("EXO_CONFIG") or (home / DEFAULT_CONFIG)).expanduser()
    if plist is not None:
        if plist.get("Label") != OWNER_LABEL:
            report.fail("launchd-label", plist_path.name)
        args = plist.get("ProgramArguments") or []
        if not args:
            report.fail("launchd-args", plist_path.name)
        for arg in args[:1] + [a for a in args[1:] if a.endswith((".ts", ".js", ".mjs"))]:
            p = Path(arg)
            if not p.is_absolute():
                report.fail("launchd-relative-path", plist_path.name, arg)
            elif not p.exists():
                report.fail("launchd-path-missing", plist_path.name, arg)
            elif p.suffix and inside_git_checkout(p):
                report.fail("launchd-runs-checkout", plist_path.name, arg)
        if "/.local/share/mise/installs/node/" in (args[0] if args else ""):
            report.notes.append("launchd node is a version-pinned mise path; a node upgrade can break it")
        for key in ("StandardOutPath", "StandardErrorPath"):
            target = plist.get(key)
            if not target or target == "/dev/null":
                report.fail("launchd-logs", plist_path.name, key)
        if plist.get("RunAtLoad") is not True:
            report.fail("launchd-run-at-load", plist_path.name)
        keep = plist.get("KeepAlive")
        if not (isinstance(keep, dict) and keep.get("SuccessfulExit") is False):
            report.fail("launchd-keepalive", plist_path.name, "expected KeepAlive SuccessfulExit=false")
        if "EXO_CONFIG" not in env:
            report.fail("launchd-exo-config", plist_path.name, "EXO_CONFIG must be explicit")

    if not config_path.is_file():
        report.fail("config-missing", str(config_path))
        return report
    try:
        config = json.loads(config_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        report.fail("config-invalid", config_path.name, error.msg)
        return report
    if config_path == home / LIVE_CONFIG:
        report.fail("config-is-live-spike", str(config_path))
    for key in ("vault", "piCli", "optchat"):
        value = config.get(key)
        if not value:
            report.fail("config-required", config_path.name, key)
        elif not Path(value).expanduser().exists():
            report.fail("config-path-missing", config_path.name, key)
    models = config.get("models") or {}
    for role in MODEL_ROLES:
        model = models.get(role) or {}
        missing = [field for field in MODEL_FIELDS if not model.get(field)]
        if missing:
            report.fail("model-missing", config_path.name, f"{role}: {','.join(missing)}")
    raw = json.dumps(config)
    if re.search(r"cliproxy", raw, re.I):
        report.fail("config-proxy", config_path.name)
    state_dir = Path(config.get("stateDir") or (home / DEFAULT_STATE)).expanduser()
    for live in LIVE_STATE_DIRS:
        if state_dir == home / live:
            report.fail("state-is-live-spike", str(state_dir))
    plugin = config.get("exosurfacePlugin")
    if plugin and inside_git_checkout(Path(plugin).expanduser()):
        report.fail("plugin-runs-checkout", config_path.name, "exosurfacePlugin")
    agent_dir = Path(config.get("agentDir") or (state_dir / "pi-agent")).expanduser()
    pi_home = (home / ".pi").resolve()
    if agent_dir.exists():
        for rel in rel_files(agent_dir):
            path = agent_dir / rel
            if path.is_symlink() and str(Path(os.path.realpath(path))).startswith(str(pi_home)):
                report.fail("agent-links-personal-pi", str(rel))
    if agent_dir.resolve() == (home / ".pi/agent").resolve():
        report.fail("agent-is-personal-pi", str(agent_dir))
    schema_file = state_dir / "state-schema.json"
    if schema_file.is_file():
        try:
            schema = json.loads(schema_file.read_text(encoding="utf-8")).get("schema")
        except json.JSONDecodeError:
            schema = None
        if type(schema) is not int or schema != 1:
            report.fail("state-schema-invalid", "state-schema.json")
    else:
        report.fail("state-schema-missing", "state-schema.json")

    vault = Path(config.get("vault") or "").expanduser()
    receipt_path = vault / ".exo/starter-receipt.json"
    if not receipt_path.is_file():
        report.fail("starter-receipt-missing", ".exo/starter-receipt.json")
    else:
        try:
            receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            receipt = {}
            report.fail("starter-receipt-invalid", ".exo/starter-receipt.json")
        zone = find_timezone(receipt) or find_timezone(config)
        if not zone or zone == "unconfigured":
            report.fail("timezone-unconfigured", ".exo/starter-receipt.json",
                        "set the owner time zone before dated automation")
    return report


# ---------- live isolation ----------

SECRET_NAMES = {"auth.json", "mcp.json", "mcp-auth.json", "auth-secret", "env.json"}


def live_paths(home: Path) -> list[Path]:
    paths = [home / LIVE_CONFIG, home / ".pi/agent/settings.json", home / ".pi/agent/auth.json",
             home / ".pi/agent/mcp.json", home / ".pi/agent/models.json", home / ".bb/env.json"]
    for live in (".exo-bb-spike", ".exo-a2ui-spike"):
        base = home / live
        paths += [base / "canonical-thread.json", base / "main-model.json",
                  base / "primary-agent/settings.json", base / "primary-agent/models.json"]
    agents = home / "Library/LaunchAgents"
    if agents.is_dir():
        paths += sorted(agents.glob(f"{LIVE_LABEL_PREFIX}*.plist"))
        paths += sorted(agents.glob(f"{OWNER_LABEL}*.plist"))
    return paths


LIVE_LISTINGS = (".bb/plugins", ".bb/plugin-host-artifacts", ".exo-bb-spike")


def snapshot(home: Path) -> dict:
    """Fingerprint the live Exo. Secret files are stat-only: never read, never hashed.

    BB's own database is deliberately excluded: BB writes it constantly while running.
    """
    entries = {}
    for path in live_paths(home):
        key = str(path.relative_to(home))
        if path.is_file():
            st = path.stat()
            secret = path.name in SECRET_NAMES
            entries[key] = {"size": st.st_size, "mtime_ns": st.st_mtime_ns,
                            "sha256": None if secret or st.st_size > TEXT_LIMIT else sha256(path)}
        else:
            entries[key] = None
    listings = {}
    for rel in LIVE_LISTINGS:
        base = home / rel
        if base.is_dir():
            listings[rel] = {child.name: child.lstat().st_mtime_ns for child in sorted(base.iterdir())}
        else:
            listings[rel] = None
    try:
        listing = subprocess.run(["launchctl", "list"], capture_output=True, text=True, timeout=10,
                                 env=scrubbed_env()).stdout
    except (OSError, subprocess.SubprocessError):
        listing = ""
    jobs = {}
    for line in listing.splitlines()[1:]:
        parts = line.split("\t")
        if len(parts) == 3 and (parts[2].startswith(LIVE_LABEL_PREFIX) or parts[2].startswith(OWNER_LABEL)):
            jobs[parts[2]] = parts[0]
    return {"contract": "exosurface-live-snapshot/0", "files": entries, "listings": listings,
            "launchd_pids": jobs}


def compare(before: dict, after: dict) -> Report:
    report = Report("isolation", "live-isolation")
    for key in sorted(set(before["files"]) | set(after["files"])):
        if before["files"].get(key) != after["files"].get(key):
            report.fail("live-file-changed", key)
    for key in sorted(set(before.get("listings", {})) | set(after.get("listings", {}))):
        if before.get("listings", {}).get(key) != after.get("listings", {}).get(key):
            report.fail("live-listing-changed", key)
    for label in sorted(set(before["launchd_pids"]) | set(after["launchd_pids"])):
        if before["launchd_pids"].get(label) != after["launchd_pids"].get(label):
            report.fail("live-job-changed", label)
    return report


# ---------- gates ----------

def load_gates() -> list[dict]:
    return json.loads((Path(__file__).with_name("gates.json")).read_text(encoding="utf-8"))["gates"]


def gate_table(evidence_dir: Path | None) -> dict:
    rows = []
    for gate in load_gates():
        status = "OPEN"
        record = evidence_dir / f"{gate['id']}.json" if evidence_dir else None
        if gate["kind"] == "automated":
            status = "AUTOMATED (run the named check; fixture/installable level only)"
        elif record and record.is_file():
            try:
                data = json.loads(record.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                data = {}
            needed = ("performed_by", "date", "macos", "release", "fresh_account", "observed")
            if all(data.get(k) not in (None, "") for k in needed) and data.get("fresh_account") is True:
                status = "RECORDED (human evidence; review it)"
            else:
                status = "OPEN (evidence record incomplete)"
        rows.append({"id": gate["id"], "kind": gate["kind"], "spec": gate["spec"], "status": status,
                     "proof": gate["proof"]})
    return {"check": "gates", "gates": rows,
            "note": "No gate is ever reported PASS here; a simulation is never end-to-end evidence."}


# ---------- CLI ----------

def emit(result: dict, as_json: bool) -> None:
    if as_json:
        print(json.dumps(result, indent=2, sort_keys=True))
        return
    if "gates" in result:
        for row in result["gates"]:
            print(f"{row['status'].split(' ')[0]:<10} {row['id']:<28} {row['kind']}")
        print(result["note"])
        return
    print(f"{result['check']} [{result['level']}]: {result['result']}")
    for finding in result["findings"]:
        print(f"  FAIL {finding['rule']} {finding['where']} {finding['detail']}".rstrip())
    for note in result["notes"]:
        print(f"  note: {note}")


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--json", action="store_true")
    sub = parser.add_subparsers(dest="command", required=True)
    p = sub.add_parser("package")
    p.add_argument("release_dir")
    p.add_argument("--deny-terms")
    s = sub.add_parser("starter")
    s.add_argument("root")
    s.add_argument("--deny-terms")
    s.add_argument("--allow-dirty", action="store_true")
    i = sub.add_parser("install")
    i.add_argument("--home", required=True)
    i.add_argument("--config")
    iso = sub.add_parser("isolation")
    iso_sub = iso.add_subparsers(dest="action", required=True)
    snap = iso_sub.add_parser("snapshot")
    snap.add_argument("--home", default=str(Path.home()))
    snap.add_argument("--out", required=True)
    cmp_ = iso_sub.add_parser("compare")
    cmp_.add_argument("before")
    cmp_.add_argument("after")
    g = sub.add_parser("gates")
    g.add_argument("--evidence")
    args = parser.parse_args(argv)

    if sys.version_info < (3, 9):
        print("python >= 3.9 required", file=sys.stderr)
        return 2
    if args.command == "package":
        report = check_package(Path(args.release_dir), deny_terms(args.deny_terms))
    elif args.command == "starter":
        report = check_starter(Path(args.root), deny_terms(args.deny_terms), args.allow_dirty)
    elif args.command == "install":
        report = check_install(Path(args.home), args.config)
    elif args.command == "isolation" and args.action == "snapshot":
        out = Path(args.out)
        out.write_text(json.dumps(snapshot(Path(args.home)), indent=2, sort_keys=True) + "\n", encoding="utf-8")
        print(f"snapshot written: {out}")
        return 0
    elif args.command == "isolation":
        before = json.loads(Path(args.before).read_text(encoding="utf-8"))
        after = json.loads(Path(args.after).read_text(encoding="utf-8"))
        report = compare(before, after)
    else:
        emit(gate_table(Path(args.evidence) if args.evidence else None), args.json)
        return 0
    emit(report.as_dict(), args.json)
    return 0 if report.ok else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
