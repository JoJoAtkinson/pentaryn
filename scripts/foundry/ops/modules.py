"""Check and install the in-house Foundry modules.

Copy, never symlink: a stale copy has to be a real, visible failure mode.

The check step exists because of how Foundry fails here — a broken esmodule fails
*silently* at load time and the module simply never registers. No error in the
console, no entry in Manage Modules that looks wrong; it is just absent. So nothing
reaches Data/ until its sources have been proved.

There are six gates, and each one sees something the others cannot:

    parse        `node --check` on every .mjs, JSON.parse on every .json
    imports      every named import exists in the file it is imported FROM
    i18n         every key the code localises exists in lang/en.json
    node-test    the module's own suite, where it has one
    vendor       the vendored kit is byte-identical to foundry/lib
    conformance  the fail-class blueprint rules pass, or exceptions.json accepts them

They run in that order and stop at the first failure. `imports` is the one added
after 2026-08-22, when an `export` was deleted out from under two importers: every
file parsed, this check went green, and the module never initialised. `node --check`
reads one file at a time and cannot see across the gap between them.

None of them can tell you the module WORKS. They tell you it can load.
"""

from __future__ import annotations

import json
import os
import posixpath
import re
import shutil
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict, dataclass, field
from pathlib import Path

from . import config as cfg, jsscan
from .digest import SYNC_STAMP, tree_digest  # noqa: F401 — re-exported for callers and tests
from .out import FAIL, OK, append_jsonl, event, now_iso, say as _say

try:
    import fcntl
except ImportError:  # pragma: no cover — native Windows; BOSS runs Foundry in WSL
    fcntl = None  # type: ignore[assignment]

# Build output and vendored code are not ours to check.
_SKIP_DIRS = {"node_modules", "target", ".git"}


def _sources(spec: cfg.ModuleSpec) -> list[Path]:
    """Every .mjs the module owns, tests included, build output excluded."""
    return sorted(f for f in spec.src.rglob("*.mjs")
                  if not _SKIP_DIRS & set(f.relative_to(spec.src).parts))


def _rel(spec: cfg.ModuleSpec, path: Path) -> str:
    return str(path.relative_to(spec.src))


def _node_available() -> bool:
    return shutil.which("node") is not None


# ── gate results ──────────────────────────────────────────────────────────────

@dataclass
class GateResult:
    """What one gate found — the data behind the prose (python-tooling-41).

    Every gate builds one of these; `_emit` prints it as the ✓/✗/▸ lines the gates have
    always printed, and `--json` serialises it instead. `ok` is the gate's verdict;
    `skipped` marks a gate that had nothing to prove (no node, no lock, …) and passed.
    `problems` are why it failed; `notes` are what it wants a reader to know anyway."""

    gate: str
    ok: bool
    summary: str
    problems: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)
    counts: dict = field(default_factory=dict)
    skipped: bool = False

    def as_dict(self) -> dict:
        return asdict(self)


def _emit(res: GateResult) -> int:
    """Print a gate's result the way the gates always have; return its exit code."""
    mark = "▸" if res.skipped else ("✓" if res.ok else "✗")
    _say(f"{mark} {res.summary}")
    for p in res.problems:
        print(f"    {p}")
    for n in res.notes:
        print(f"    ▸ {n}")
    return OK if res.ok else FAIL


def _node_check(path: Path) -> subprocess.CompletedProcess:
    return subprocess.run(["node", "--check", str(path)], capture_output=True, text=True)


def _gate_parse(spec: cfg.ModuleSpec) -> GateResult:
    """JSON.parse every .json the module declares, and `node --check` every .mjs.

    The JSON half needs no node, so it runs first and always: a malformed module.json
    must fail here, not crash a later gate (final-review py-ops M3).

    The language files are every `languages[].path` the manifest declares plus every
    lang/*.json on disk, once each (final-review py-ops EXT-4). A declared path that does
    not exist is skipped here — the imports gate reports it."""
    def load(rel: str):
        """Parse one file; None if it is absent, a GateResult if it is malformed."""
        path = spec.src / rel
        if not path.is_file():
            return None
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            return GateResult("parse", False, f"malformed JSON in {rel}: {exc}")

    manifest = load("module.json")
    if isinstance(manifest, GateResult):
        return manifest
    langs = manifest.get("languages") if isinstance(manifest, dict) else None
    declared = [l.get("path") for l in langs if isinstance(l, dict)] \
        if isinstance(langs, list) else []
    on_disk = sorted(p.relative_to(spec.src).as_posix()
                     for p in (spec.src / "lang").glob("*.json"))
    for rel in dict.fromkeys(posixpath.normpath(p) for p in (*declared, *on_disk)
                             if isinstance(p, str) and p):
        res = load(rel)
        if isinstance(res, GateResult):
            return res

    if not _node_available():
        return GateResult("parse", True, "node not installed — skipping the syntax check",
                          skipped=True)

    # One node process per file, run side by side (final-review py-ops perf-1): serially
    # this was ~25 s for --all. `map` yields in sorted file order, so the file reported is
    # still the first failure by name, never whichever process happened to finish first.
    files = _sources(spec)
    with ThreadPoolExecutor(max_workers=os.cpu_count() or 1) as pool:
        for f, proc in zip(files, pool.map(_node_check, files)):
            if proc.returncode != 0:
                pool.shutdown(cancel_futures=True)
                return GateResult("parse", False, f"syntax error in {f}",
                                  problems=[proc.stderr.rstrip("\n")])

    return GateResult("parse", True, f"{spec.name} sources parse", counts={"files": len(files)})


def _check_parse(spec: cfg.ModuleSpec) -> int:
    return _emit(_gate_parse(spec))


def _gate_imports(spec: cfg.ModuleSpec) -> GateResult:
    """Every named import must be exported by the file it claims to come from.

    This is the gap `node --check` leaves. It parses one file at a time, so on
    2026-08-22 an `export` was deleted out from under two importers, all nine files
    parsed clean, the check went green — and the module never initialised: no
    settings registered, sheet tab blank, nothing in the console. A missing named
    export is a load-time error in an ES module, and this is the only gate that sees
    it before the browser does.

    What it does NOT see, and says so out loud below: `import(expr)` with a computed
    specifier, and which members of an `import * as NS` are actually reached.
    """
    files = _sources(spec)
    if not files:
        return GateResult("imports", True, f"{spec.name}: no .mjs sources to cross-check",
                          skipped=True)

    scanned = {f: jsscan.scan(f) for f in files}
    exports: dict[Path, set[str]] = {}
    stars: dict[Path, list[str]] = {}
    for path, src in scanned.items():
        exports[path], stars[path] = jsscan.exports_of(src)

    def resolve(origin: Path, spec_str: str) -> Path | None:
        # A query or fragment names the same file to the resolver — tests import
        # `../x.mjs?second` to defeat the module cache — so drop it before the lookup.
        spec_str = spec_str.split("?", 1)[0].split("#", 1)[0]
        target = (origin.parent / spec_str).resolve()
        try:
            target.relative_to(spec.src.resolve())
        except ValueError:
            return None          # reaches outside the module — not ours to resolve
        return target

    def exported(path: Path, name: str, seen: set[Path] | None = None) -> bool:
        """Membership, following `export * from` one hop at a time."""
        seen = seen or set()
        if path in seen:
            return False
        seen.add(path)
        if name in exports.get(path, ()):
            return True
        for spec_str in stars.get(path, ()):
            nxt = resolve(path, spec_str)
            if nxt and nxt in exports and exported(nxt, name, seen):
                return True
        return False

    problems: list[str] = []
    notes: list[str] = []
    n_named = n_edges = 0

    for path, src in scanned.items():
        for imp in jsscan.imports_of(src):
            where = f"{_rel(spec, path)}:{imp.line}"
            if imp.spec is None:
                # An honest "cannot tell": `import(someVariable)`. Never passed silently.
                notes.append(f"{where} imports a computed specifier — not resolvable statically")
                continue
            if not imp.spec.startswith("."):
                continue         # bare specifier: Foundry core or a CDN, out of scope
            n_edges += 1
            target = resolve(path, imp.spec)
            if target is None:
                problems.append(f"{where} imports {imp.spec} — outside the module directory")
                continue
            if not target.exists():
                problems.append(f"{where} imports {imp.spec} — no such file")
                continue
            if target not in exports:
                notes.append(f"{where} imports {imp.spec} — present but not scanned")
                continue
            for name in imp.names:
                n_named += 1
                if exported(target, name):
                    continue
                have = ", ".join(sorted(exports[target])) or "(nothing)"
                kind = "await import" if imp.dynamic else "import"
                problems.append(
                    f"{where} {kind} {{ {name} }} from {imp.spec} — not exported there\n"
                    f"      {_rel(spec, target)} exports: {have}")

    # An entry point named in module.json that does not exist fails exactly the same
    # way — silently, at load — so it belongs in the same gate.
    manifest = spec.src / "module.json"
    try:
        data = json.loads(manifest.read_text(encoding="utf-8")) if manifest.exists() else None
    except json.JSONDecodeError as exc:
        data = None
        problems.append(f"module.json is malformed JSON: {exc}")
    if data is not None:
        declared = [*data.get("esmodules", []), *data.get("styles", []),
                    *(l.get("path", "") for l in data.get("languages", []))]
        for rel in filter(None, declared):
            if not (spec.src / rel).exists():
                problems.append(f"module.json declares {rel} — no such file")

    counts = {"files": len(files), "edges": n_edges, "named": n_named}
    if problems:
        # notes are dropped on failure, as they always were: the broken imports are the news
        return GateResult("imports", False, f"{spec.name}: {len(problems)} broken import(s)",
                          problems=problems, counts=counts)

    return GateResult("imports", True,
                      f"{spec.name} imports resolve ({len(files)} files, "
                      f"{n_edges} local edge{'' if n_edges == 1 else 's'}, {n_named} named)",
                      notes=notes, counts=counts)


def _check_imports(spec: cfg.ModuleSpec) -> int:
    return _emit(_gate_imports(spec))


_RE_PENTARYN_KEY = re.compile(r"^(PENTARYN_[A-Z0-9_]+)\.[A-Za-z0-9_][\w.-]*$")


def _gate_i18n(spec: cfg.ModuleSpec) -> GateResult:
    """Every i18n key the code asks for must exist in the module's lang file.

    Foundry does not fail on a missing key — `localize` hands back the key itself, so
    the UI reads `PENTARYN_TIES.row.remove` where a tooltip should be and nothing
    anywhere says why. Cheap to catch here; invisible everywhere else.

    The reverse direction — keys in the JSON that nothing references — is reported,
    never failed, and is split in two. A key is DEAD only when its text appears
    nowhere in the sources. When the key is reachable but only through a computed
    name (`f(labelKey, …)`, `` t(`stance.${s.key}`) ``, a helper that forwards its
    argument) it is UNVERIFIABLE, and saying so is the point: the ad-hoc version of
    this check reported exactly those as dead, and they were all live.
    """
    langs = sorted((spec.src / "lang").glob("*.json")) if (spec.src / "lang").is_dir() else []
    if not langs:
        # no lang file, nothing claimed, nothing to prove — and nothing printed
        return GateResult("i18n", True, "", skipped=True, counts={"silent": True})

    en = next((p for p in langs if p.stem == "en"), langs[0])
    known = jsscan.load_lang(en)
    if not known:
        return GateResult("i18n", False, f"{spec.name}: {_rel(spec, en)} defines no keys")
    namespaces = {k.split(".", 1)[0] for k in known}
    scans = [jsscan.scan(f) for f in _sources(spec)]
    # A `PENTARYN_<X>.…` literal names a key even when its root is not one the lang file has: a
    # mistyped root (`PENTARYN_PORTAL.Card.Title`) would otherwise be outside every namespace and
    # never checked — and Foundry shows it raw. (W5c review)
    namespaces |= {m.group(1) for s in scans for lit in s.strings
                   if lit.plain and (m := _RE_PENTARYN_KEY.match(lit.value))}

    definite: list[jsscan.Ref] = []
    prefixes: set[str] = set()
    soft: set[str] = set()
    opaque: list[jsscan.Ref] = []
    for src in scans:
        use = jsscan.key_uses(src, namespaces, set(known))
        definite += use.definite
        prefixes |= use.prefixes
        soft |= use.soft
        opaque += use.opaque

    # module.json carries keys too (a setting's `name`, a title), and they localise
    # through the same table.
    manifest = spec.src / "module.json"
    if manifest.exists():
        text = manifest.read_text(encoding="utf-8")
        for key in known:
            if f'"{key}"' in text:
                soft.add(key)

    missing = [r for r in definite if r.key not in known]
    if missing:
        return GateResult(
            "i18n", False,
            f"{spec.name}: {len(missing)} i18n key(s) not in {_rel(spec, en)}",
            problems=[f"{_rel(spec, r.path)}:{r.line}  {r.key}"
                      for r in sorted(missing, key=lambda r: (r.path.name, r.line))])

    used = {r.key for r in definite}
    unused = [k for k in known if k not in used]
    dead = [k for k in unused
            if k not in soft and not any(k.startswith(p) for p in prefixes)]
    unverifiable = len(unused) - len(dead)

    notes: list[str] = []
    if dead:
        # A warning, not a failure. An unreferenced key costs nothing at runtime, and
        # a half-landed feature is a perfectly good reason for one to exist today.
        notes.append(f"no reference found for: {', '.join(sorted(dead))}")
    if opaque:
        notes.append(f"{len(opaque)} call site(s) pass the key as a variable — "
                     f"those keys cannot be proved either way")
    return GateResult(
        "i18n", True,
        f"{spec.name} i18n: {len(used)}/{len(known)} keys referenced directly, "
        f"{unverifiable} reachable only dynamically, {len(dead)} unreferenced",
        notes=notes,
        counts={"keys": len(known), "direct": len(used), "dynamic": unverifiable,
                "unreferenced": len(dead), "opaque": len(opaque)})


def _check_i18n(spec: cfg.ModuleSpec) -> int:
    res = _gate_i18n(spec)
    if res.counts.get("silent"):
        return OK
    return _emit(res)


def _gate_node_test(spec: cfg.ModuleSpec, *, capture: bool = False) -> GateResult:
    """Run the module's own suite (node, no Foundry needed).

    Streams the suite to the terminal, or — `capture=True`, for `--json` — keeps its
    output off stdout and puts the tail of it in `problems` when it fails."""
    runner = spec.src / "test/run.mjs"
    if not runner.exists():
        return GateResult("node-test", False, f"no test runner at {runner}")
    if not _node_available():
        return GateResult("node-test", False, "node is not installed — cannot run the suite")
    # `node test/run.mjs` from the module folder, exactly as a person runs it: a suite
    # that resolves fixtures against the cwd must not pass or fail by where make ran.
    cmd = ["node", "test/run.mjs"]
    if capture:
        proc = subprocess.run(cmd, cwd=spec.src, capture_output=True, text=True)
        tail = (proc.stdout + proc.stderr).rstrip("\n").splitlines()[-40:]
        rc = proc.returncode
    else:
        # The suite writes straight to the real stdout while our own `print` is buffered
        # when the output is a pipe; without this the ✓ lines land after the suite's.
        sys.stdout.flush()
        rc = subprocess.run(cmd, cwd=spec.src).returncode
        tail = []
    ok = rc == 0
    return GateResult("node-test", ok,
                      f"{spec.name} suite {'passed' if ok else f'failed (exit {rc})'}",
                      problems=[] if ok else tail, counts={"returncode": rc})


def _check_node_test(spec: cfg.ModuleSpec) -> int:
    res = _gate_node_test(spec)
    if res.counts.get("returncode") is not None:
        return res.counts["returncode"]    # the suite has already spoken for itself
    return _emit(res)


# ── blueprint gates (W3): vendored kit identity, conformance ─────────────────
# Strict since migration Stage 5 step 2 (2026-10-12): every module has adopted the kit, so both
# gates FAIL a module — a missing lib/kit.lock.json included. The one way a failing fail-class
# rule passes is an explicit row in scripts/foundry/blueprint/exceptions.json (reason, the
# decision that accepted it, what retires it); a row whose rule no longer fails also fails the
# gate, so the list cannot go stale. wait.json no longer exempts anything here: it says who may
# edit a module, not what its gate accepts. The vendor gate has no exceptions.


def _gate_vendor(spec: cfg.ModuleSpec) -> GateResult:
    """`vendor.py check <module>`: each vendored kit file byte-identical to foundry/lib."""
    from scripts.foundry.blueprint import vendor
    if spec.kit is None:
        return GateResult("vendor", False, f"{spec.name}: no lib/kit.lock.json — every module "
                                           "vendors the kit since Stage 5",
                          problems=[f"{spec.name}: run vendor.py sync {spec.name} --tier full|small"])
    problems = vendor.check(spec.src)
    if problems:
        return GateResult("vendor", False, f"{spec.name}: vendored kit differs from foundry/lib",
                          problems=problems)
    return GateResult("vendor", True, f"{spec.name}: vendored kit identical to foundry/lib "
                                      f"({len(spec.kit)} file{'' if len(spec.kit) == 1 else 's'})",
                      counts={"files": len(spec.kit)})


def _gate_conformance(spec: cfg.ModuleSpec) -> GateResult:
    """The blueprint scorer, fail-class rules only (warn/manual rules never move a gate).

    Fails on any failing rule exceptions.json does not accept, and on a stale exception row."""
    from scripts.foundry.blueprint import conformance
    if spec.kit is None:
        return GateResult("conformance", False, f"{spec.name}: no lib/kit.lock.json — not "
                                                "migrated, so not scored (see the vendor gate)",
                          problems=[f"{spec.name}: not migrated"])
    report = conformance.score_dir(spec.src)
    failing = list(report["failing"])
    blocking, accepted, stale = report["blocking"], report["accepted"], report["stale"]
    counts = {"score": report["score"], "passed": report["passed"],
              "failClassRules": report["failClassRules"], "failing": failing,
              "blocking": blocking, "accepted": sorted(accepted), "stale": stale}
    head = (f"{spec.name} conformance {report['score']} % "
            f"({report['passed']}/{report['failClassRules']} fail-class rules)")
    detail = {r["id"]: "; ".join(r["detail"])[:200] for r in report["results"]
              if r["id"] in failing}
    notes = [f"{rid} accepted (exceptions.json): {accepted[rid]}"[:300] for rid in sorted(accepted)]
    unmatched = report.get("unmatched") or {}
    problems = [(f"{rid} not covered by its exceptions.json row: {'; '.join(unmatched[rid])[:200]}"
                 if rid in unmatched else f"{rid} {detail.get(rid, '')}".rstrip()) for rid in blocking]
    problems += [f"{rid} stale exception: it no longer fails — delete its row from "
                 "scripts/foundry/blueprint/exceptions.json" for rid in stale]
    if problems:
        why = ([f"failing {', '.join(blocking)}"] if blocking else []) + \
              ([f"stale exception {', '.join(stale)}"] if stale else [])
        return GateResult("conformance", False, f"{head} — {'; '.join(why)}",
                          problems=problems, notes=notes, counts=counts)
    if accepted:
        return GateResult("conformance", True, f"{head} — accepted exception"
                                               f"{'' if len(accepted) == 1 else 's'}: "
                                               f"{', '.join(sorted(accepted))}",
                          notes=notes, counts=counts)
    return GateResult("conformance", True, head, counts=counts)


def _check_vendor(spec: cfg.ModuleSpec) -> int:
    return _emit(_gate_vendor(spec))


def _check_conformance(spec: cfg.ModuleSpec) -> int:
    return _emit(_gate_conformance(spec))


_CHECKS = {
    "parse": _check_parse,
    "imports": _check_imports,
    "i18n": _check_i18n,
    "node-test": _check_node_test,
    "vendor": _check_vendor,
    "conformance": _check_conformance,
}

_GATES = {
    "parse": _gate_parse,
    "imports": _gate_imports,
    "i18n": _gate_i18n,
    "node-test": lambda spec: _gate_node_test(spec, capture=True),
    "vendor": _gate_vendor,
    "conformance": _gate_conformance,
}


def run_gate(spec: cfg.ModuleSpec, gate: str) -> int:
    """Run one named gate against `spec`, printing as `check` does; its exit code.

    The public way in for callers outside ops (the blueprint generator's `run_checks`).
    An unknown gate name is a ValueError naming it and the known gates."""
    if (checker := _CHECKS.get(gate)) is None:
        raise ValueError(f"unknown gate {gate!r} (known: {', '.join(sorted(_CHECKS))})")
    return checker(spec)


def check(name: str) -> int:
    """Run every gate the spec names. Cheapest and most diagnostic first.

    Stops at the first failure: past a syntax error the later gates would only report
    consequences of it, and a wall of them buries the one line that matters.
    """
    spec = cfg.MODULES[name]
    for gate in spec.check:
        if (checker := _CHECKS.get(gate)) and (rc := checker(spec)) != OK:
            return rc
    return OK


def check_report(name: str) -> dict:
    """`check`, as data and silently: `{module, ok, gates: [GateResult…]}` (--json).

    Same gates, same order, same stop-at-first-failure; nothing is printed."""
    spec = cfg.MODULES[name]
    gates: list[dict] = []
    ok = True
    for gate in spec.check:
        if (fn := _GATES.get(gate)) is None:
            continue
        res = fn(spec)
        gates.append(res.as_dict())
        if not res.ok:
            ok = False
            break
    return {"module": name, "id": spec.name, "ok": ok, "gates": gates}


def check_all(*, as_json: bool = False) -> int:
    """Every registered module, in name order. Keeps going past a failure; 1 if any failed.

    Prose: each module's gates under a header, then a one-line summary. JSON: a list of
    `check_report` dicts, one per module, and nothing else on stdout."""
    names = sorted(cfg.MODULES)
    if as_json:
        reports = [check_report(n) for n in names]
        print(json.dumps(reports, indent=2, ensure_ascii=False))
        return OK if all(r["ok"] for r in reports) else FAIL
    failed: list[str] = []
    for n in names:
        print(f"── {n}")
        if check(n) != OK:
            failed.append(n)
    sys.stdout.flush()
    if failed:
        _say(f"✗ {len(failed)}/{len(names)} module(s) failed: {', '.join(failed)}")
        return FAIL
    _say(f"✓ all {len(names)} modules pass their gates")
    return OK


#: where an install is built before it is swapped into Data/modules — a sibling of Data/, so on the
#: same volume (the swap is a rename) but outside the folder Foundry scans for module.json files and
#: serves over HTTP
STAGING_DIRNAME = ".pentaryn-sync"


def _git_state(src: Path) -> tuple[str | None, bool | None]:
    """(short HEAD, whether `src` has uncommitted changes) — (None, None) outside a git checkout."""
    try:
        rev = subprocess.run(["git", "-C", str(cfg.REPO_ROOT), "rev-parse", "--short", "HEAD"],
                             capture_output=True, text=True, timeout=10)
        dirty = subprocess.run(["git", "-C", str(cfg.REPO_ROOT), "status", "--porcelain", "--", str(src)],
                               capture_output=True, text=True, timeout=10)
    except (OSError, subprocess.SubprocessError):
        return None, None
    if rev.returncode != 0 or dirty.returncode != 0:
        return None, None
    return rev.stdout.strip() or None, bool(dirty.stdout.strip())


def _stamp(src: Path, copy: Path) -> dict:
    manifest = {}
    try:
        manifest = json.loads((copy / "module.json").read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        pass
    git, dirty = _git_state(src)
    return {"module": manifest.get("id") or src.name, "version": manifest.get("version"),
            "digest": tree_digest(copy), "git": git, "dirty": dirty, "synced_at": now_iso()}


def _ops_log(cmd: str, record: dict, dst: Path) -> None:
    """One line in foundry/logs/ops-YYYY-MM.jsonl; a log that cannot be written never fails a sync."""
    line = {"ts": record["synced_at"], "cmd": cmd,
            **{k: v for k, v in record.items() if k != "synced_at"}, "dst": str(dst)}
    try:
        append_jsonl(cfg.OPS_LOG_DIR / f"ops-{record['synced_at'][:7]}.jsonl", line)
    except OSError as err:
        _say(f"▸ ops log not written ({err})")
    try:
        event(cmd, **{k: v for k, v in line.items() if k != "ts"})
    except OSError as err:
        _say(f"▸ ops log not written ({err})")


def staging_dir(dst: Path) -> Path:
    """`<Data>/../.pentaryn-sync` for `dst` = `<Data>/modules/<id>`."""
    return dst.parent.parent.parent / STAGING_DIRNAME


def install(src: Path, dst: Path, *, cmd: str = "module-sync") -> dict:
    """Copy `src` to `dst` so that `dst` is never left missing or half-written (python-tooling-5a).

    `dst` is `<Data>/modules/<id>`. The copy is built in `<Data>/../.pentaryn-sync/<id>.new` (derived
    from `dst`, so a test's tmp tree never reaches the real FoundryVTT folder); only a complete copy is
    swapped in: the old `dst` is renamed aside to `<name>.old`, the new one renamed into place, the
    old one removed. A copy that fails leaves `dst` exactly as it was; a swap that fails (or is
    interrupted) puts the old one back. A run killed between the two renames (SIGKILL, power loss)
    leaves `dst` missing with the good install in `<name>.old`: the next run renames it back before
    anything else, then clears the leftovers, so a failing copy there still leaves it serving. The
    installed tree is the one `rmtree` + `copytree` produced, plus the stamp.

    The stamp (`SYNC_STAMP`: module, version, digest, git, dirty, synced_at) is written into the copy
    before the swap; after it, one line goes to `foundry/logs/ops-YYYY-MM.jsonl` with `cmd`
    (`module-sync`, `stage` or `importer-install`). Returns the stamp.

    The whole run holds an exclusive `flock` on `<Data>/../.pentaryn-sync/<id>.lock` (py-ops-ac-1),
    so two syncs of one module never share `<id>.new`/`<id>.old`: the second waits, then installs
    on top. The lock file is permanent; the lock goes with the process, so a killed run frees it.
    """
    staging = staging_dir(dst)
    staging.mkdir(parents=True, exist_ok=True)
    if fcntl is None:  # pragma: no cover
        return _install_locked(src, dst, staging, cmd)
    with open(staging / f"{dst.name}.lock", "a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)  # a second sync of this module waits here (py-ops-ac-1)
        try:
            return _install_locked(src, dst, staging, cmd)
        finally:
            fcntl.flock(lock, fcntl.LOCK_UN)


def _remove(path: Path) -> None:
    """Delete a staging leftover: a symlink is unlinked (never followed), a folder rmtree'd (EC-8)."""
    if path.is_symlink():
        path.unlink(missing_ok=True)
    else:
        shutil.rmtree(path, ignore_errors=True)


def _install_locked(src: Path, dst: Path, staging: Path, cmd: str) -> dict:
    """`install`'s body, run while it holds `staging/<id>.lock`.

    `dst` is tested with `os.path.lexists`, so a symlink there — dangling or not — is set aside
    and unlinked like a folder rather than crashing the swap; its target is never touched (EC-8)."""
    new, old = staging / f"{dst.name}.new", staging / f"{dst.name}.old"
    if not os.path.lexists(dst) and old.is_dir():
        dst.parent.mkdir(parents=True, exist_ok=True)
        os.rename(old, dst)  # a run died mid-swap: the previous good install was set aside
    for leftover in (new, old):
        _remove(leftover)
    try:
        shutil.copytree(src, new)
        record = _stamp(src, new)
        (new / SYNC_STAMP).write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")
    except BaseException:
        _remove(new)
        raise
    dst.parent.mkdir(parents=True, exist_ok=True)
    try:
        if os.path.lexists(dst):
            os.rename(dst, old)
        os.rename(new, dst)
    except BaseException:
        # `old` was cleared above, so it exists only if this run set `dst` aside
        if not os.path.lexists(dst) and os.path.lexists(old):
            os.rename(old, dst)
        raise
    _remove(old)
    _ops_log(cmd, record, dst)
    return record


def sync(name: str) -> int:
    """Prove the sources, then copy the module into Foundry's Data/modules."""
    spec = cfg.MODULES[name]
    if not spec.syncable:
        # the CLI never offers it; this guards a direct call (EXT-6)
        _say(f"✗ {name} is not synced by module-sync — the actor pipeline installs it; "
             "use `importer-install`")
        return FAIL
    if (rc := check(name)) != 0:
        return rc
    if not spec.src.is_dir():
        _say(f"✗ no module at {spec.src}")
        return FAIL

    install(spec.src, spec.dst)
    _say(f"✓ module → {spec.dst}")
    for line in spec.after_sync:
        print(f"    {line}")
    return OK


# ── blueprint tools (W1): thin wrappers, arguments passed through ─────────────

def module_new(argv: list[str]) -> int:
    """`scripts/foundry/blueprint/new_module.py`, aimed at foundry/module/.

    The generator refuses to write under foundry/module/ without `--install`; this is the
    repo's own entry point, so it adds `--install` unless the caller chose an `--out`."""
    from scripts.foundry.blueprint import new_module
    argv = list(argv)
    chose_out = any(a == "--out" or a.startswith("--out=") for a in argv)
    if not chose_out and "--install" not in argv:
        argv.append("--install")
    return new_module.main(argv)


def module_vendor(argv: list[str]) -> int:
    """`scripts/foundry/blueprint/vendor.py sync|check …`."""
    from scripts.foundry.blueprint import vendor
    return vendor.main(list(argv))


def module_conformance(argv: list[str]) -> int:
    """`scripts/foundry/blueprint/conformance.py …` (exit 1 when a fail-class rule fails)."""
    from scripts.foundry.blueprint import conformance
    return conformance.main(list(argv))


# ── walls-only extras ─────────────────────────────────────────────────────────

def walls_wasm() -> int:
    """Build the compiled backend.

    Needs rustup plus the wasm32-unknown-unknown target:
        curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
        rustup target add wasm32-unknown-unknown

    Rust rather than C/C++ on purpose: no FMA contraction, no fast-math, so float
    semantics are strict IEEE-754 by default — which is what keeps the compiled
    engine bit-identical to the JS one.
    """
    src = cfg.MODULES["walls"].src
    wasm_dir = src / "wasm"
    env = {**os.environ, "PATH": f"{Path.home() / '.cargo/bin'}:{os.environ.get('PATH', '')}"}
    rc = subprocess.run(
        ["cargo", "build", "--release", "--target", "wasm32-unknown-unknown"],
        cwd=wasm_dir, env=env,
    ).returncode
    if rc != 0:
        return rc

    built = wasm_dir / "target/wasm32-unknown-unknown/release/wall_engine.wasm"
    dest = src / "wall-engine.wasm"
    shutil.copy2(built, dest)
    _say(f"✓ wall-engine.wasm ({dest.stat().st_size / 1024:.0f} KB)")
    return OK


def walls_bench(grid: str | None = None) -> int:
    """Scaling curve: at what map size does this stop being instant?"""
    bench = cfg.MODULES["walls"].src / "test/bench.mjs"
    cmd = ["node", str(bench)] + ([grid] if grid else [])
    return subprocess.run(cmd).returncode
