#!/usr/bin/env python3
# Derived from octo-feather a58919e2446850b19f2482aa5fd93dbc0e59b4ac, Apache-2.0.
# Modified by Exosurface 2026-11-11: project-local lane-helper relocation only. See README.md and NOTICE.
"""octo-feather-spec-status: the per-criterion status file beside an accepted spec (docs/adr/0021).

  octo-feather-spec-status check [DIR...]          check every DIR/*.status.json (default docs/specs)
  octo-feather-spec-status init SPEC COMMIT        write SPEC's status file, every criterion planned
  octo-feather-spec-status built STATUS PR ID...   flip the named criteria to built in PR
  octo-feather-spec-status built STATUS PR ID --record RECORD --commit SHA [--test TEST]...
                                                   flip ID to built in PR with its evidence link
  octo-feather-spec-status show [DIR|STATUS...]    each criterion's status, each built one current or stale
  octo-feather-spec-status calls [--since REF] [DIR...]
                                                   list the calls added since REF (default: the merge
                                                   base with origin/main), for the merge ask and PR body

A status file `<slug>.status.json` sits beside `<slug>.spec.html`:
  {"spec": "<slug>.spec.html", "accepted_commit": "<sha>",
   "criteria": {"<id>": {"status": "planned" | "built", "pr": <N or null>}}}
A built criterion `just qc` passed also names its evidence link (quality #qc-results):
  "record": "<evidence record id>", "commit": "<sha it was captured at>",
  "tests": ["<each test its demo declares>"...]   (empty for an agent fallback result)
A criterion id is the `data-anchor` of each `data-acceptance-criterion` element
(Spec Chat's shaped-sections-v1 contract). `check` fails on a missing spec, a
missing, extra or duplicate id, a status other than planned/built, a planned
criterion with a PR or an evidence link, a built one without a PR, or a partial or
malformed link; a built row with no link (built before qc linked one) passes.
The spec HTML is never edited.

`show` is read-only and git-only, never part of `check` (a stale criterion stays
built until a lane's just qc judges it again, quality #qc-stale). Per status file
(default docs/specs/*.status.json) it prints each criterion: planned; built with no
evidence link; or built current or STALE, naming the record and the commit it was
captured at. Stale: the criterion's element differs from the spec at that commit;
a path its demo covers (qc.toml at the repo root, at that commit) differs at HEAD,
named with the commits that changed it; or the file of a test it names (a test
id `path::name` by its path) differs at HEAD, edited or gone, named likewise, or is
not at HEAD. A criterion with no demo at that commit was
judged by the agent fallback: no covers or tests, so only its text makes it stale.

A call log `<slug>.calls.jsonl` sits beside them (issue-lifecycle #gates-spec-calls),
append-only, one judgement call per line:
  {"at": "<UTC ISO, Z>", "lane": "<lane key>", "role": "supervisor",
   "kind": "clarifies" | "adds" | "weakens", "anchors": ["<data-anchor>"...],
   "criteria": ["<criterion id>"...], "what": "...", "why": "...",
   "passes_as_written": false, "evidence": "<failing command, error, or two
   contradicting spec lines>", "commit": "<optional sha>",
   "denied": {"at": "...", "note": "..."} (optional, written when the owner denies)}
`check` fails on a line that is not JSON, a missing, empty or whitespace-only field, a lane that
is no tracker's lane key (one some kit tracker skill's lane-key maps to itself: gh12, eng-123), a role other
than supervisor, passes_as_written not false, an unknown kind, or a criterion id
in neither the spec nor the spec at accepted_commit. It then compares the spec
at accepted_commit (git show, from the spec's own repo, so a shallow clone needs
full history) with the working tree, element by data-anchor: each element's own
content, each nested anchored element cut out and replaced by a placeholder naming
it (so moving or reordering a child changes its parents), whitespace normalized;
content outside any anchored element is anchor "(page)". Every added, removed or changed anchor
must be named in `anchors` by a call without `denied`; a removed criterion needs
such a call of kind weakens, an added one of kind adds.

`calls` is read-only: it lists each call in DIR/*.calls.jsonl that is not in that
log at REF (a call is the same call with or without `denied`), grouped as the
loudness table orders them (#gates-call-loudness): weakens, adds, clarifies, each
group by time. Each call shows its spec, lane, role, anchors, criteria, what, why
and evidence, and DENIED when the owner denied it. It ends with the count, and a
line per lane with more than three calls.
"""
import argparse, importlib.machinery, importlib.util, json, re, subprocess, sys, tomllib
from html.parser import HTMLParser
from pathlib import Path
from typing import Any, cast

STATUSES = ("planned", "built")


class _Criteria(HTMLParser):
    def __init__(self):
        super().__init__(); self.ids = []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if "data-acceptance-criterion" in a:
            self.ids.append(a.get("data-anchor") or "")


def criteria(spec: Path) -> list[str]:
    p = _Criteria(); p.feed(spec.read_text(encoding="utf-8")); return p.ids


def _pairs(pairs):
    seen = {}
    for k, v in pairs:
        if k in seen:
            raise ValueError(f"duplicate key {k!r}")
        seen[k] = v
    return seen


def check_file(status: Path) -> list[str]:
    errs, rel = [], str(status)
    try:
        data = json.loads(status.read_text(encoding="utf-8"), object_pairs_hook=_pairs)
    except ValueError as e:
        return [f"{rel}: {e}"]
    slug = status.name.removesuffix(".status.json")
    if data.get("spec") != f"{slug}.spec.html":
        errs.append(f"{rel}: spec must be {slug}.spec.html, beside it")
    spec = status.with_name(f"{slug}.spec.html")
    if not spec.is_file():
        return errs + [f"{rel}: no spec {spec}"]
    if not re.fullmatch(r"[0-9a-f]{7,40}", str(data.get("accepted_commit", ""))):
        errs.append(f"{rel}: accepted_commit must be a commit sha")
    ids = criteria(spec)
    if "" in ids:
        errs.append(f"{spec}: a data-acceptance-criterion element has no data-anchor")
    for d in sorted({i for i in ids if i and ids.count(i) > 1}):
        errs.append(f"{spec}: duplicate criterion id {d}")
    got = data.get("criteria")
    if not isinstance(got, dict):
        return errs + [f"{rel}: criteria must be an object"]
    want = {i for i in ids if i}
    for m in sorted(want - got.keys()):
        errs.append(f"{rel}: missing criterion {m}")
    for x in sorted(got.keys() - want):
        errs.append(f"{rel}: extra criterion {x} (not in {spec.name})")
    for k, v in sorted(got.items()):
        st = v.get("status") if isinstance(v, dict) else None
        pr = v.get("pr") if isinstance(v, dict) else None
        if st not in STATUSES:
            errs.append(f"{rel}: {k}: status must be planned or built, not {st!r}")
        elif st == "planned" and pr is not None:
            errs.append(f"{rel}: {k}: a planned criterion has pr null")
        elif st == "built" and not (isinstance(pr, int) and not isinstance(pr, bool) and pr > 0):
            errs.append(f"{rel}: {k}: a built criterion names the PR that built it")
    return cast("list[str]", errs) + link_errors(rel, cast("dict[str, object]", got))


LINK = ("record", "commit", "tests")   # a built criterion's evidence link (quality #qc-results)
RECORD = r"\d{8}T\d{6}Z-[0-9a-f]{8}"   # an evidence record id, as octo-feather-evidence append names it


Entry = dict[str, Any]   # one criterion's status entry


def link_errors(rel: str, got: dict[str, object]) -> list[str]:
    """Each entry's evidence link problem: a planned one names none, a built one none or a whole one."""
    errs: list[str] = []
    for k, v in sorted(got.items()):
        e = cast("Entry", v) if isinstance(v, dict) else {}
        if e.get("status") == "planned" and any(f in e for f in LINK):
            errs.append(f"{rel}: {k}: a planned criterion names no evidence ({', '.join(LINK)})")
        elif e.get("status") == "built" and (bad := link_error(e)):
            errs.append(f"{rel}: {k}: {bad}")
    return errs


def link_error(v: Entry) -> str | None:
    """What is wrong with a built entry's evidence link: none at all is a row built before qc linked one."""
    have = [f for f in LINK if f in v]
    if not have:
        return None
    if len(have) < len(LINK):
        return (f"names {', '.join(have)} without {', '.join(f for f in LINK if f not in have)}: an evidence link "
                f"is record, commit and tests together, written by just qc")
    if not (isinstance(v["record"], str) and re.fullmatch(RECORD, v["record"])):
        return "record must be an evidence record id (<UTC stamp>-<hex>, as octo-feather-evidence append prints it)"
    if not (isinstance(v["commit"], str) and re.fullmatch(r"[0-9a-f]{7,40}", v["commit"])):
        return "commit must be a commit sha, the one its record was captured at"
    tests: object = v["tests"]
    if not (isinstance(tests, list) and all(isinstance(t, str) and t.strip() for t in cast("list[object]", tests))):
        return "tests must be a list of test names, the tests its demo declares"
    return None


VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta",
        "source", "track", "wbr"}
KINDS = ("clarifies", "adds", "weakens")
FIELDS = ("at", "lane", "role", "kind", "anchors", "criteria", "what", "why",
          "passes_as_written", "evidence")
PAGE = "(page)"


class _Anchors(HTMLParser):
    """Each data-anchor element's own content, each nested anchored element replaced by a placeholder naming it."""

    def __init__(self):
        super().__init__(convert_charrefs=True); self.stack = []; self.parts = {PAGE: []}

    def _owner(self):
        return next((a for _, a in reversed(self.stack) if a is not None), PAGE)

    def _tag(self, tag, attrs, close=""):
        a = " ".join(f'{k}="{v}"' if v is not None else k for k, v in attrs)
        return f"<{tag}{' ' + a if a else ''}{close}>"

    def _child(self, anchor):
        """Mark an anchored child's place in its parent's own content: identity, order, parentage."""
        if anchor is not None:
            self.parts.setdefault(self._owner(), []).append(f"<{{anchor {anchor}}}>")

    def handle_starttag(self, tag, attrs):
        anchor = dict(attrs).get("data-anchor")
        self._child(anchor)
        if tag in VOID:
            self.parts.setdefault(anchor or self._owner(), []).append(self._tag(tag, attrs)); return
        self.stack.append((tag, anchor))
        self.parts.setdefault(self._owner(), []).append(self._tag(tag, attrs))

    def handle_startendtag(self, tag, attrs):
        anchor = dict(attrs).get("data-anchor")
        self._child(anchor)
        self.parts.setdefault(anchor or self._owner(), []).append(self._tag(tag, attrs, "/"))

    def handle_endtag(self, tag):
        if not any(t == tag for t, _ in self.stack):
            return
        owner = self._owner()
        while self.stack:
            t, a = self.stack.pop()
            if t == tag:
                self.parts.setdefault(a or owner, []).append(f"</{tag}>"); return

    def handle_data(self, data):
        self.parts[self._owner()].append(data)


def anchors(html: str) -> dict[str, str]:
    p = _Anchors(); p.feed(html); p.close()
    return {k: " ".join("".join(v).split()) for k, v in p.parts.items()}


def criteria_of(html: str) -> set[str]:
    p = _Criteria(); p.feed(html); return {i for i in p.ids if i}


def _git(cwd: Path, *args) -> subprocess.CompletedProcess:
    return subprocess.run(["git", "-C", str(cwd), *args], capture_output=True, text=True)


def accepted_html(spec: Path, commit: str) -> tuple[str | None, str | None]:
    """The spec's HTML at commit, from the spec's own repo, or (None, error)."""
    top = _git(spec.parent, "rev-parse", "--show-toplevel")
    if top.returncode:
        return None, f"{spec}: not in a git repo, so the change since accepted_commit {commit} cannot be checked"
    if _git(spec.parent, "cat-file", "-e", f"{commit}^{{commit}}").returncode:
        return None, (f"{spec}: accepted_commit {commit} is not in this repo; fix: fetch full history "
                      f"(git fetch --unshallow, or CI checkout fetch-depth: 0)")
    rel = spec.resolve().relative_to(Path(top.stdout.strip()).resolve()).as_posix()
    shown = _git(spec.parent, "show", f"{commit}:{rel}")
    if shown.returncode:
        return None, f"{spec}: not in accepted_commit {commit} as {rel}"
    return shown.stdout, None


def call_name(c: dict) -> str:
    """How an error names a call so the owner can find it: its lane, and its anchors or else its what."""
    lane, anchors, what = c.get("lane"), c.get("anchors"), c.get("what")
    parts = [f"lane {lane}" if isinstance(lane, str) and lane else "no lane"]
    if isinstance(anchors, list) and anchors:
        parts.append("anchors " + ", ".join(map(str, anchors)))
    elif isinstance(what, str) and what:
        parts.append(f"what {what[:60]!r}" + ("..." if len(what) > 60 else ""))
    else:
        parts.append("no anchors or what")
    return f"call ({'; '.join(parts)})"


_LANE_KEYS: dict[str, bool] = {}


# Modified by Exosurface on 2026-11-11: relocate only the tracker-helper discovery.
# Both actual upstream grammars are packaged here; no launcher or skill-marker discovery.
def is_lane_key(lane: str) -> bool:
    """A canonical lane: either packaged upstream normalizer returns it unchanged."""
    if lane not in _LANE_KEYS:
        root = Path(__file__).resolve().parent
        helpers = (root / "github-issues.sh", root / "linear.sh")
        for helper in helpers:
            if not helper.is_file():
                raise FileNotFoundError(f"spec-status: required packaged lane normalizer missing: {helper}")
        _LANE_KEYS[lane] = any(
            subprocess.run([str(helper), lane],
                           capture_output=True, text=True).stdout.strip() == lane
            for helper in helpers)
    return _LANE_KEYS[lane]


def read_calls(log: Path, known: set[str]) -> tuple[list[dict], list[str]]:
    """The valid calls in log, and an error per bad line naming file, line, the call and fix."""
    calls, errs = [], []
    if not log.is_file():
        return calls, errs
    fix = "fix: the supervisor rewrites the call (issue-lifecycle #gates-spec-calls)"
    for n, line in enumerate(log.read_text(encoding="utf-8").splitlines(), 1):
        where = f"{log}:{n}"
        try:
            c = json.loads(line, object_pairs_hook=_pairs)
        except ValueError as e:
            errs.append(f"{where}: not a JSON object ({e}); fix: one JSON call per line"); continue
        if not isinstance(c, dict):
            errs.append(f"{where}: not a JSON object; fix: one JSON call per line"); continue
        where = f"{where}: {call_name(c)}"
        bad = [f for f in FIELDS if f not in c or c[f] in (None, "", [])
               or (isinstance(c[f], str) and not c[f].strip())]
        bad += [f for f in ("anchors", "criteria") if f not in bad and not (
            isinstance(c[f], list) and all(isinstance(x, str) and x.strip() for x in c[f]))]
        bad += [f for f in FIELDS if f not in bad and f not in ("anchors", "criteria", "passes_as_written")
                and not isinstance(c[f], str)]
        if bad:
            errs.append(f"{where}: missing or empty field {', '.join(bad)}; fix: every field but commit "
                        f"and denied is set, anchors and criteria are non-empty lists of ids"); continue
        line_errs = []
        if not re.fullmatch(r"\d{4}-\d\d-\d\dT\d\d:\d\d(:\d\d(\.\d+)?)?Z", c["at"]):
            line_errs.append(f"at {c['at']!r} is not a UTC ISO time ending in Z")
        if not is_lane_key(c["lane"]):
            line_errs.append(f"lane {c['lane']!r} is not a lane key of any tracker the kit has (gh12, eng-123)")
        if c["role"] != "supervisor":
            line_errs.append(f"role {c['role']!r}: only the supervisor edits a spec and logs its call")
        if c["passes_as_written"] is not False:
            line_errs.append("passes_as_written must be false: if the criteria pass as written there is no edit")
        if c["kind"] not in KINDS:
            line_errs.append(f"kind {c['kind']!r} is not one of {', '.join(KINDS)}")
        for i in c["criteria"]:
            if i not in known:
                line_errs.append(f"criterion {i} is in neither the spec nor its accepted commit")
        if "commit" in c and not (isinstance(c["commit"], str) and re.fullmatch(r"[0-9a-f]{7,40}", c["commit"])):
            line_errs.append("commit, when set, is a commit sha")
        d = c.get("denied")
        if d is not None and not (isinstance(d, dict) and d.get("at") and d.get("note")):
            line_errs.append('denied, when set, is {"at": ..., "note": ...}')
        if line_errs:
            errs.extend(f"{where}: {e}; {fix}" for e in line_errs); continue
        calls.append(c)
    return calls, errs


def check_calls(status: Path) -> list[str]:
    """The call log is valid and names every change to the spec since accepted_commit."""
    try:
        commit = str(json.loads(status.read_text(encoding="utf-8")).get("accepted_commit", ""))
    except (ValueError, AttributeError):
        return []
    slug = status.name.removesuffix(".status.json")
    spec, log = status.with_name(f"{slug}.spec.html"), status.with_name(f"{slug}.calls.jsonl")
    if not spec.is_file() or not re.fullmatch(r"[0-9a-f]{7,40}", commit):
        return []
    old, err = accepted_html(spec, commit)
    if err:
        return [err]
    new = spec.read_text(encoding="utf-8")
    was, now = criteria_of(old), criteria_of(new)
    calls, errs = read_calls(log, was | now)
    live = [c for c in calls if not c.get("denied")]
    a, b = anchors(old), anchors(new)
    changed = sorted(k for k in a.keys() | b.keys() if a.get(k) != b.get(k))
    named = {x for c in live for x in c["anchors"]}
    for k in changed:
        if k not in named:
            how = "added" if k not in a else "removed" if k not in b else "changed"
            errs.append(f"{spec}: anchor {k} {how} since accepted_commit {commit} and no call names it; fix: "
                        f"the supervisor logs a call naming it in {log.name} (issue-lifecycle #gates-spec-calls)")
    for ids, kind, how in ((was - now, "weakens", "removed"), (now - was, "adds", "added")):
        for i in sorted(ids):
            if not any(c["kind"] == kind and (i in c["anchors"] or i in c["criteria"]) for c in live):
                errs.append(f"{spec}: criterion {i} {how} since accepted_commit {commit} needs a call of kind "
                            f"{kind} naming it; fix: log one in {log.name} (issue-lifecycle #gates-spec-calls)")
    return errs


LOUDNESS = (  # (kind, heading): the order and wording of #gates-call-loudness
    ("weakens", "Weakens or removes a criterion (flagged; the director told the owner at once)"),
    ("adds", "Adds scope or a criterion (flagged: added scope)"),
    ("clarifies", "Clarifies or adds detail, criteria unchanged (listed)"),
)


def _parse_log(text: str, where: str) -> tuple[list[dict], list[str]]:
    calls, errs = [], []
    for n, line in enumerate(text.splitlines(), 1):
        if not line.strip():
            continue
        try:
            c = json.loads(line)
        except ValueError as e:
            errs.append(f"{where}:{n}: not a JSON object ({e}); fix: run `octo-feather-spec-status check`"); continue
        if not isinstance(c, dict):
            errs.append(f"{where}:{n}: not a JSON object; fix: run `octo-feather-spec-status check`"); continue
        calls.append(c)
    return calls, errs


def _identity(c: dict) -> str:
    """A call is the same call whether or not the owner has denied it since."""
    return json.dumps({k: v for k, v in c.items() if k != "denied"}, sort_keys=True)


def _base(d: Path, since: str | None) -> tuple[str | None, str | None]:
    """The commit to list calls since: REF, else the merge base of HEAD and origin/main."""
    if since:
        r = _git(d, "rev-parse", "--verify", "-q", f"{since}^{{commit}}")
        return (r.stdout.strip(), None) if not r.returncode else (None, f"{d}: no commit {since}")
    r = _git(d, "merge-base", "HEAD", "origin/main")
    if r.returncode:
        return None, f"{d}: no merge base with origin/main; fix: git fetch origin main, or pass --since REF"
    return r.stdout.strip(), None


def new_calls(d: Path, since: str | None) -> tuple[list[tuple[Path, dict]], list[str]]:
    """Each call in d/*.calls.jsonl not in that log at the base commit, with its log."""
    out, errs = [], []
    logs = sorted(d.glob("*.calls.jsonl"))
    if not logs:
        return out, errs
    base, err = _base(d, since)
    if err:
        return out, [err]
    top = Path(_git(d, "rev-parse", "--show-toplevel").stdout.strip()).resolve()
    for log in logs:
        rel = log.resolve().relative_to(top).as_posix()
        shown = _git(d, "show", f"{base}:{rel}")
        old, e1 = _parse_log(shown.stdout if not shown.returncode else "", f"{rel}@{base[:7]}")
        now, e2 = _parse_log(log.read_text(encoding="utf-8"), str(log))
        errs += e1 + e2
        seen: dict[str, int] = {}
        for c in old:
            seen[_identity(c)] = seen.get(_identity(c), 0) + 1
        for c in now:
            k = _identity(c)
            if seen.get(k):
                seen[k] -= 1
            else:
                out.append((log, c))
    return out, errs


def _field(v) -> str:
    if isinstance(v, list):
        return ", ".join(map(str, v)) or "(none)"
    return " ".join(str(v).split()) if v not in (None, "") else "(none)"


def list_calls(found: list[tuple[Path, dict]], base_desc: str) -> str:
    lines = [f"Spec calls since {base_desc} (issue-lifecycle #gates-spec-calls); "
             f"approve or deny each, merging approves every call not denied."]
    n = 0
    for kind, heading in LOUDNESS:
        group = sorted((x for x in found if x[1].get("kind") == kind),
                       key=lambda x: (str(x[1].get("at", "")), str(x[0]), _identity(x[1])))
        lines += ["", f"{heading}: {len(group)}"]
        for log, c in group:
            n += 1
            d = c.get("denied")
            mark = f" DENIED ({_field(d.get('at'))}: {_field(d.get('note'))})" if isinstance(d, dict) and d else ""
            spec = log.with_name(log.name.removesuffix(".calls.jsonl") + ".spec.html")
            lines.append(f"{n}. {kind}{mark}: {spec}, lane {_field(c.get('lane'))}, role {_field(c.get('role'))}, "
                         f"at {_field(c.get('at'))}" + (f", commit {c['commit']}" if c.get("commit") else ""))
            for f in ("anchors", "criteria", "what", "why", "evidence"):
                lines.append(f"   {f}: {_field(c.get(f))}")
    other = [x for x in found if x[1].get("kind") not in KINDS]
    if other:
        lines += ["", f"Unknown kind (fix: run `octo-feather-spec-status check`): {len(other)}"]
        for log, c in other:
            n += 1
            lines.append(f"{n}. {_field(c.get('kind'))}: {log}, lane {_field(c.get('lane'))}, what {_field(c.get('what'))}")
    denied = sum(1 for _, c in found if c.get("denied"))
    counts = ", ".join(f"{sum(1 for _, c in found if c.get('kind') == k)} {k}" for k, _ in LOUDNESS)
    lines += ["", f"{len(found)} call{'s' if len(found) != 1 else ''} ({counts}; {denied} denied)."]
    lanes: dict[str, int] = {}
    for _, c in found:
        lanes[_field(c.get("lane"))] = lanes.get(_field(c.get("lane")), 0) + 1
    for lane, k in sorted(lanes.items()):
        if k > 3:
            lines.append(f"Lane {lane} made {k} calls, more than three: the director tells the owner "
                         f"(issue-lifecycle #gates-call-loudness).")
    return "\n".join(lines)


def calls_cmd(args: list[str]) -> int:
    since = None
    if args[:1] == ["--since"]:
        if len(args) < 2:
            print(__doc__.strip(), file=sys.stderr); return 64
        since, args = args[1], args[2:]
    found, errs = [], []
    for d in args or ["docs/specs"]:
        if not Path(d).is_dir():
            errs.append(f"{d}: not a directory"); continue
        f, e = new_calls(Path(d), since); found += f; errs += e
    if errs:
        print("\n".join(errs), file=sys.stderr); return 1
    print(list_calls(found, since or "the merge base with origin/main")); return 0


def _run(top: Path, *args: str) -> tuple[int, str]:
    """git ARGS in TOP: (exit status, stdout)."""
    p = cast("subprocess.CompletedProcess[str]", _git(top, *args))
    return p.returncode, p.stdout


def _changes(top: Path, commit: str, paths: list[str]) -> tuple[list[str], list[str]]:
    """Of PATHS, those that differ between COMMIT and HEAD, and the commits after COMMIT that changed them."""
    files = [f for f in _run(top, "diff", "--name-only", "-z", commit, "HEAD", "--", *paths)[1].split("\0") if f]
    log = _run(top, "log", "--format=%h %s", "--abbrev=12", f"{commit}..HEAD", "--", *files)[1] if files else ""
    return files, [ln for ln in log.splitlines() if ln]


def _demo(top: Path, commit: str, cid: str) -> Entry | None:
    """The demo qc.toml at the repo root declared for criterion id CID at COMMIT, or None (the agent fallback's)."""
    rc, shown = _run(top, "show", f"{commit}:qc.toml")
    try:
        demos: dict[str, Any] = tomllib.loads(shown).get("demo", {}) if not rc else {}
    except tomllib.TOMLDecodeError:
        return None
    return demos.get(cid)


def stale(spec: Path, k: str, v: Entry, top: Path, now: dict[str, str]) -> tuple[str, str]:
    """(kind, line) for built criterion K with an evidence link: kind current, stale or unknown (quality #qc-stale)."""
    c: str = v["commit"]
    c12, tests = c[:12], cast("list[str]", v["tests"])
    head = f"record {v['record']} captured at {c12}"
    if _run(top, "cat-file", "-e", f"{c}^{{commit}}")[0]:
        return "unknown", f"UNKNOWN: {head}, which is not in this repo; fix: fetch full history (git fetch --unshallow)"
    why: list[str] = []
    old, err = accepted_html(spec, c)
    if err or old is None or anchors(old).get(k) != now.get(k):
        _, by = _changes(top, c, [spec.resolve().relative_to(top).as_posix()])
        why.append(f"criterion text changed since {c12}" + (f" by {'; '.join(by)}" if by else " (uncommitted)"))
    demo = _demo(top, c, f"{spec.name.removesuffix('.spec.html')}#{k}")
    covers = [str(x) for x in cast("list[object]", demo.get("covers", []))] if demo else []
    for f in _changes(top, c, covers)[0] if covers else []:
        why.append(f"covered path {f} changed since {c12} by {'; '.join(_changes(top, c, [f])[1])}")
    for p in dict.fromkeys(t.split("::", 1)[0] for t in tests):   # each named test's file, a selector by its file
        named = ", ".join(t for t in tests if t != p and t.split("::", 1)[0] == p)
        what = f"test file {p}" + (f" ({named})" if named else "")
        gone = bool(_run(top, "cat-file", "-e", f"HEAD:{p}")[0])
        changed, by = _changes(top, c, [p])
        if changed:
            why.append(f"{what} {'gone' if gone else 'changed'} since {c12} by {'; '.join(by)}")
        elif gone:
            why.append(f"{what} gone (not at HEAD)")
    if why:
        return "stale", f"STALE: {head}; {'; '.join(why)}"
    if demo is None:
        return "current", (f"current: {head} by the agent fallback (no declared demo: no covers or tests, so only "
                           f"a change to its text makes it stale)")
    return "current", f"current: {head}, tests {', '.join(tests) or 'none'}, covers {', '.join(covers)}"


def show(status: Path) -> tuple[list[str], list[str]]:
    """(lines, errors) for one status file's criteria, ending with the counts."""
    errs = check_file(status)
    if errs:
        return [], errs
    rc, top = _run(status.parent, "rev-parse", "--show-toplevel")
    if rc:
        return [], [f"{status}: not in a git repo, so staleness cannot be read"]
    data: Entry = json.loads(status.read_text(encoding="utf-8"))
    spec = status.with_name(str(data["spec"]))
    now = anchors(spec.read_text(encoding="utf-8"))
    lines, n = [f"{status} ({spec.name}):"], dict[str, int]()
    for k, v in cast("dict[str, Entry]", data["criteria"]).items():
        if v["status"] != "built":
            kind, line = "planned", "planned"
        elif "record" not in v:
            kind, line = "no evidence link", f"built (PR #{v['pr']}), no evidence link (built before just qc linked records)"
        else:
            kind, line = stale(spec, k, v, Path(top.strip()).resolve(), now)
            line = f"built (PR #{v['pr']}), {line}"
        n[kind] = n.get(kind, 0) + 1
        lines.append(f"  {k}: {line}")
    built = sum(x for kind, x in n.items() if kind != "planned")
    lines.append(f"  {built} built: {n.get('current', 0)} current, {n.get('stale', 0)} stale, "
                 f"{n.get('no evidence link', 0)} no evidence link" + (f", {n['unknown']} unknown" if n.get("unknown") else ""))
    return lines, []


def show_cmd(args: list[str]) -> int:
    files = [f for a in (args or ["docs/specs"])
             for f in (sorted(Path(a).glob("*.status.json")) if Path(a).is_dir() else [Path(a)])]
    out: list[str] = []
    errs: list[str] = []
    for f in files:
        lines, e = show(f) if f.is_file() else ([], [f"{f}: no status file"])
        out += lines; errs += e
    print("\n".join(out) if out else "spec-status: no status files")
    if errs:
        print("\n".join(errs), file=sys.stderr); return 1
    return 0


def built_link(args: list[str]) -> tuple[list[str], Entry | None, str | None]:
    """(the other args, the evidence link of --record, --commit and each --test or None without them, error)."""
    ap = argparse.ArgumentParser(add_help=False, exit_on_error=False)
    ap.add_argument("--record"); ap.add_argument("--commit"); ap.add_argument("--test", action="append", default=[])
    try:
        ns, rest = ap.parse_known_args(args)
    except argparse.ArgumentError as e:
        return args, None, f"built: {e}"
    record, commit, tests = cast("str | None", ns.record), cast("str | None", ns.commit), cast("list[str]", ns.test)
    if record is None and commit is None and not tests:
        return rest, None, None
    if record is None or commit is None or len(rest) != 3:
        return rest, None, "built: an evidence link is --record and --commit (and each --test) for exactly one criterion"
    link: Entry = {"record": record, "commit": commit, "tests": tests}
    bad = link_error(link)
    return rest, link, f"built: {bad}" if bad else None


def write(path: Path, data: dict) -> None:
    path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def main(argv: list[str]) -> int:
    cmd, *args = argv or ["check"]
    if cmd == "check":
        files = [f for d in (args or ["docs/specs"]) for f in sorted(Path(d).glob("*.status.json"))]
        errs = [e for f in files for e in check_file(f) + check_calls(f)]
        if errs:
            print("\n".join(errs), file=sys.stderr); return 1
        print(f"spec-status: ok ({len(files)} status files)"); return 0
    if cmd == "calls":
        return calls_cmd(args)
    if cmd == "show":
        return show_cmd(args)
    link: Entry | None = None
    if cmd == "built":
        args, link, bad = built_link(args)
        if bad:
            print(bad, file=sys.stderr); return 64
    if cmd == "init" and len(args) == 2:
        spec = Path(args[0]); slug = spec.name.removesuffix(".spec.html")
        ids = criteria(spec)
        data = {"spec": spec.name, "accepted_commit": args[1],
                "criteria": {i: {"status": "planned", "pr": None} for i in ids}}
        out = spec.with_name(f"{slug}.status.json"); write(out, data)
        errs = check_file(out)
        if errs:
            print("\n".join(errs), file=sys.stderr); return 1
        print(out); return 0
    if cmd == "built" and len(args) >= 3 and args[1].isdigit():
        status = Path(args[0]); data = json.loads(status.read_text(encoding="utf-8"))
        for i in args[2:]:
            if i not in data["criteria"]:
                print(f"no criterion {i} in {status}", file=sys.stderr); return 1
            data["criteria"][i] = {"status": "built", "pr": int(args[1])} | (link or {})
        write(status, data); return 0
    print(__doc__.strip(), file=sys.stderr); return 64


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
