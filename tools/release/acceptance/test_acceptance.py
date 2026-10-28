"""Self-tests for acceptance.py. Every test builds fixtures in a temporary directory and runs the
CLI with HOME pointed at a temporary directory, so nothing reads or writes the real home.

Run: python3 -m unittest discover -s tools/release/acceptance -p 'test_*.py'
"""

import hashlib
import json
import os
import plistlib
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import acceptance  # noqa: E402

TERMS = ["fixtureowner", "Acme Personal"]


def setUpModule():
    # Accident guard, not a sandbox: drop inherited live selectors before any test runs.
    for key in [k for k in os.environ if acceptance.LIVE_ENV.match(k)]:
        del os.environ[key]


def write(path: Path, text: str = "x\n") -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    return path


def good_manifest(**overrides) -> dict:
    manifest = {
        "contract": "exosurface-package/0",
        "id": "exosurface",
        "files": ["package.json", "dist/**", "src/**"],
        "owner": {"entry": "src/owner-service.ts", "nodeArgs": ["--experimental-transform-types"],
                  "launchdLabel": "app.exosurface.owner"},
        "stateSchema": {"writes": 1, "reads": [1]},
        "requires": {"node": ">=22.19.0", "bb": ">=0.45.0"},
        "pins": {"pi": {"npm": "@earendil-works/pi-coding-agent", "version": "1.1.0"},
                 "optchat": {"git": "https://github.com/jonaslsaa/pi-optchat.git", "version": "0.8.6", "commit": "aae1caf7715830051d327f819fc776792211167a"}},
    }
    manifest.update(overrides)
    return manifest


def make_release(root: Path, manifest: dict = None) -> Path:
    write(root / "release.json", json.dumps(manifest or good_manifest()))
    write(root / "package.json", '{"name":"bb-plugin-exosurface"}')
    write(root / "dist/server.js", "export const ok = true;\n")
    write(root / "src/owner-service.ts", "export {};\n")
    return root


def run_cli(home: Path, *args: str) -> subprocess.CompletedProcess:
    env = {"HOME": str(home), "USER": "fixtureowner", "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
           "GIT_CONFIG_NOSYSTEM": "1", "PYTHONDONTWRITEBYTECODE": "1"}
    return subprocess.run([sys.executable, str(HERE / "acceptance.py"), *args], capture_output=True,
                          text=True, env=env, timeout=30)


def tree(root: Path) -> list:
    return sorted(str(p.relative_to(root)) for p in root.rglob("*"))


class PackageTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = make_release(Path(self.tmp.name) / "release")

    def tearDown(self):
        self.tmp.cleanup()

    def rules(self):
        return {f["rule"] for f in acceptance.check_package(self.root, TERMS).findings}

    def test_good_release_passes(self):
        self.assertEqual(set(), self.rules())

    def test_node_modules_denied(self):
        write(self.root / "node_modules/left-pad/index.js")
        self.assertIn("path-denied", self.rules())

    def test_evidence_denied_even_if_allowlisted(self):
        write(self.root / "dist/evidence/run.json", "{}")
        self.assertIn("path-denied", self.rules())

    def test_credentials_denied(self):
        for name in ("auth.json", "mcp.json", ".env"):
            write(self.root / "dist" / name, "{}")
        self.assertIn("path-denied", self.rules())

    def test_session_history_denied(self):
        write(self.root / "dist/session.jsonl", "{}\n")
        self.assertIn("path-denied", self.rules())

    def test_unlisted_file_fails(self):
        write(self.root / "notes.md")
        self.assertIn("path-not-allowlisted", self.rules())

    def test_home_path_and_proxy_and_thread_fail(self):
        write(self.root / "dist/a.js", "const p = '/" + "Users/" + "fixture/vault';\nconst u='https://x-cliproxy.example';\nthr_abcdefghij\n")
        self.assertTrue({"content:home-path", "content:proxy", "content:bb-thread-id"} <= self.rules())

    def test_secret_patterns_fail(self):
        write(self.root / "dist/b.js", 'const k = "sk-ant-' + "a" * 30 + '";\n{"client_secret": "abcdefghijk"}\n')
        self.assertTrue({"content:anthropic-key", "content:client-secret"} <= self.rules())

    def test_personal_term_fails_without_printing_it(self):
        write(self.root / "src/x.ts", "// written by Acme Personal\n")
        report = acceptance.check_package(self.root, TERMS)
        self.assertIn("content:personal-term", {f["rule"] for f in report.findings})
        self.assertNotIn("Acme", json.dumps(report.as_dict()))

    def test_versioned_slug_accepted(self):
        make_release(self.root, good_manifest(id="exosurface-0-1-0-dev"))
        self.assertEqual(set(), self.rules())

    def test_dotted_id_rejected_like_bundle(self):
        make_release(self.root, good_manifest(id="exosurface-0.1.0-dev"))
        self.assertIn("id", self.rules())

    def test_owner_string_is_rejected_not_adapted(self):
        make_release(self.root, good_manifest(owner="dist/owner-service.js"))
        self.assertIn("owner-shape", self.rules())

    def test_string_pins_rejected(self):
        make_release(self.root, good_manifest(pins={"pi": "1.1.0", "optchat": "0.8.6"}))
        self.assertIn("pins-shape", self.rules())

    def test_wrong_label_fails(self):
        manifest = good_manifest(owner={"entry": "src/owner-service.ts", "launchdLabel": "local.exocortex.exo-owner"})
        make_release(self.root, manifest)
        self.assertIn("owner-label", self.rules())

    def test_pin_range_fails(self):
        manifest = good_manifest()
        manifest["pins"]["pi"]["version"] = "^1.1.0"
        make_release(self.root, manifest)
        self.assertIn("pin-not-exact", self.rules())

    def test_node_floor_below_pi_engines_fails(self):
        make_release(self.root, good_manifest(requires={"node": ">=22.18.0", "bb": ">=0.45.0"}))
        self.assertIn("node-floor-below-pin", self.rules())

    def test_schema_writes_must_be_readable(self):
        make_release(self.root, good_manifest(stateSchema={"writes": 2, "reads": [1]}))
        self.assertIn("state-schema", self.rules())

    def test_missing_dist_fails(self):
        for path in (self.root / "dist").iterdir():
            path.unlink()
        self.assertIn("dist-missing", self.rules())

    def test_symlink_escape_fails(self):
        outside = write(Path(self.tmp.name) / "outside.txt")
        (self.root / "dist/link.txt").symlink_to(outside)
        self.assertIn("symlink-escapes", self.rules())


class StarterTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name) / "starter"
        body = "# Agent\nGeneric starter.\n"
        write(self.root / "payload/AGENTS.md", body)
        self.artifact = {"contract": "exo-mac-starter/0", "commit": "a" * 40, "dirty": False,
                         "files": {"AGENTS.md": hashlib.sha256(body.encode()).hexdigest()}}
        write(self.root / "starter-artifact.json", json.dumps(self.artifact))

    def tearDown(self):
        self.tmp.cleanup()

    def rules(self, allow_dirty=False):
        return {f["rule"] for f in acceptance.check_starter(self.root, TERMS, allow_dirty).findings}

    def test_clean_starter_passes(self):
        self.assertEqual(set(), self.rules())

    def test_dirty_starter_fails_unless_allowed(self):
        self.artifact["dirty"] = True
        write(self.root / "starter-artifact.json", json.dumps(self.artifact))
        self.assertIn("starter-dirty", self.rules())
        self.assertNotIn("starter-dirty", self.rules(allow_dirty=True))

    def test_actual_starter_nested_provenance_and_hash_metadata(self):
        self.artifact["source"] = {"commit": self.artifact.pop("commit"), "dirty": self.artifact.pop("dirty")}
        self.artifact["files"] = {k: {"sha256": v, "mode": "0644"} for k, v in self.artifact["files"].items()}
        write(self.root / "starter-artifact.json", json.dumps(self.artifact))
        self.assertEqual(set(), self.rules())

    def test_tampered_file_fails(self):
        write(self.root / "payload/AGENTS.md", "# changed\n")
        self.assertIn("starter-hash-mismatch", self.rules())

    def test_personal_note_fails(self):
        write(self.root / "payload/People/Colleague.md", "Met fixtureowner today\n")
        self.assertIn("content:personal-term", self.rules())


class InstallTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.home = Path(self.tmp.name) / "home"
        h = self.home
        self.prefix = h / "Library/Application Support/Exosurface/releases"
        self.entry = write(self.prefix / "0.1.0/src/owner-service.ts", "export {};\n")
        self.node = write(h / "opt/node/bin/node", "#!/bin/sh\n")
        self.vault = h / "Exocortex"
        write(self.vault / ".exo/starter-receipt.json", json.dumps({"bindings": {"owner_timezone": "America/Denver"}}))
        pi = write(h / "opt/pi/cli.js")
        optchat = h / "opt/optchat"
        optchat.mkdir(parents=True)
        self.config_path = h / ".config/exosurface/config.json"
        self.config = {
            "vault": str(self.vault), "piCli": str(pi), "optchat": str(optchat),
            "stateDir": str(h / ".exosurface"),
            "models": {role: {"provider": "anthropic", "model": "claude-x", "thinking": "low"}
                       for role in ("main", "compactor", "subagent")},
        }
        self.save_config()
        write(h / ".exosurface/state-schema.json", '{"schema": 1}')
        self.plist = {
            "Label": "app.exosurface.owner",
            "ProgramArguments": [str(self.node), "--experimental-transform-types", str(self.entry)],
            "EnvironmentVariables": {"EXO_CONFIG": str(self.config_path)},
            "RunAtLoad": True, "KeepAlive": {"SuccessfulExit": False},
            "StandardOutPath": str(h / "Library/Logs/Exosurface/owner.log"),
            "StandardErrorPath": str(h / "Library/Logs/Exosurface/owner.err.log"),
        }
        self.save_plist()

    def tearDown(self):
        self.tmp.cleanup()

    def save_config(self):
        write(self.config_path, json.dumps(self.config))

    def save_plist(self):
        path = self.home / "Library/LaunchAgents/app.exosurface.owner.plist"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(plistlib.dumps(self.plist))

    def rules(self):
        return {f["rule"] for f in acceptance.check_install(self.home, None).findings}

    def test_good_install_passes(self):
        self.assertEqual(set(), self.rules())

    def test_missing_models_fail(self):
        del self.config["models"]["compactor"]
        self.config["models"]["main"]["thinking"] = ""
        self.save_config()
        report = acceptance.check_install(self.home, None)
        details = {f["detail"] for f in report.findings if f["rule"] == "model-missing"}
        self.assertEqual({"compactor: provider,model,thinking", "main: thinking"}, details)

    def test_unconfigured_timezone_fails(self):
        write(self.vault / ".exo/starter-receipt.json", json.dumps({"bindings": {"owner_timezone": "unconfigured"}}))
        self.assertIn("timezone-unconfigured", self.rules())

    def test_missing_receipt_fails(self):
        (self.vault / ".exo/starter-receipt.json").unlink()
        self.assertIn("starter-receipt-missing", self.rules())

    def test_dev_null_logs_fail(self):
        self.plist["StandardOutPath"] = "/dev/null"
        self.save_plist()
        self.assertIn("launchd-logs", self.rules())

    def test_entry_in_git_checkout_fails(self):
        (self.prefix / "0.1.0/.git").mkdir()
        self.assertIn("launchd-runs-checkout", self.rules())

    def test_relative_program_fails(self):
        self.plist["ProgramArguments"][0] = "node"
        self.save_plist()
        self.assertIn("launchd-relative-path", self.rules())

    def test_missing_exo_config_env_fails(self):
        self.plist["EnvironmentVariables"] = {}
        self.save_plist()
        self.assertIn("launchd-exo-config", self.rules())

    def test_keepalive_required(self):
        del self.plist["KeepAlive"]
        self.save_plist()
        self.assertIn("launchd-keepalive", self.rules())

    def test_keepalive_always_fails(self):
        self.plist["KeepAlive"] = True
        self.save_plist()
        self.assertIn("launchd-keepalive", self.rules())

    def test_future_schema_fails(self):
        write(self.home / ".exosurface/state-schema.json", '{"schema": 2}')
        self.assertIn("state-schema-invalid", self.rules())

    def test_live_spike_state_fails(self):
        self.config["stateDir"] = str(self.home / ".exo-bb-spike")
        self.save_config()
        self.assertIn("state-is-live-spike", self.rules())

    def test_proxy_in_config_fails(self):
        self.config["models"]["main"]["provider"] = "exo-cliproxy"
        self.save_config()
        self.assertIn("config-proxy", self.rules())

    def test_agent_dir_linking_personal_pi_fails(self):
        auth = write(self.home / ".pi/agent/auth.json", "{}")
        agent = self.home / ".exosurface/pi-agent"
        agent.mkdir(parents=True)
        (agent / "auth.json").symlink_to(auth)
        self.assertIn("agent-links-personal-pi", self.rules())

    def test_cli_missing_config_is_side_effect_free(self):
        empty_home = Path(self.tmp.name) / "empty"
        empty_home.mkdir()
        result = run_cli(empty_home, "--json", "install", "--home", str(empty_home))
        self.assertEqual(1, result.returncode)
        data = json.loads(result.stdout)
        self.assertEqual({"launchd-missing", "config-missing"}, {f["rule"] for f in data["findings"]})
        self.assertEqual([], tree(empty_home))

    def test_cli_json_is_stable(self):
        first = run_cli(self.home, "--json", "install", "--home", str(self.home)).stdout
        second = run_cli(self.home, "--json", "install", "--home", str(self.home)).stdout
        self.assertEqual(first, second)
        self.assertEqual("pass", json.loads(first)["result"])


class IsolationTests(unittest.TestCase):
    def test_snapshot_detects_change_and_never_reads_secrets(self):
        with tempfile.TemporaryDirectory() as tmp:
            home = Path(tmp) / "home"
            write(home / ".config/exo/exosurface.json", "{}")
            auth = write(home / ".pi/agent/auth.json", '{"token":"secret"}')
            write(home / "Library/LaunchAgents/local.exocortex.exo-owner.plist", "<plist/>")
            before = acceptance.snapshot(home)
            self.assertIsNone(before["files"][".pi/agent/auth.json"]["sha256"])
            self.assertEqual(set(), {f["rule"] for f in acceptance.compare(before, acceptance.snapshot(home)).findings})
            write(home / ".config/exo/exosurface.json", '{"changed": true}')
            os.utime(auth, ns=(1, 1))
            changed = {f["where"] for f in acceptance.compare(before, acceptance.snapshot(home)).findings}
            self.assertTrue({".config/exo/exosurface.json", ".pi/agent/auth.json"} <= changed)


class EnvGuardTests(unittest.TestCase):
    def test_child_env_has_no_live_selectors(self):
        os.environ["OPTCHAT_HOME"] = "/nonexistent/live"
        try:
            self.assertFalse([k for k in acceptance.scrubbed_env() if acceptance.LIVE_ENV.match(k)])
        finally:
            del os.environ["OPTCHAT_HOME"]


class GateTests(unittest.TestCase):
    def test_manual_gates_open_without_evidence(self):
        table = acceptance.gate_table(None)
        manual = [row for row in table["gates"] if row["kind"] != "automated"]
        self.assertTrue(manual)
        self.assertTrue(all(row["status"].startswith("OPEN") for row in manual))
        self.assertFalse(any("PASS" in row["status"] for row in table["gates"]))

    def test_incomplete_evidence_stays_open_and_complete_is_recorded_not_pass(self):
        with tempfile.TemporaryDirectory() as tmp:
            evidence = Path(tmp)
            write(evidence / "survives-reboot.json", json.dumps({"performed_by": "tester"}))
            write(evidence / "survives-quit.json", json.dumps({
                "performed_by": "tester", "date": "2026-11-01", "macos": "26.1", "release": "0.1.0",
                "fresh_account": True, "observed": "same conversation after reopen"}))
            rows = {row["id"]: row["status"] for row in acceptance.gate_table(evidence)["gates"]}
            self.assertTrue(rows["survives-reboot"].startswith("OPEN"))
            self.assertTrue(rows["survives-quit"].startswith("RECORDED"))


if __name__ == "__main__":
    unittest.main()
