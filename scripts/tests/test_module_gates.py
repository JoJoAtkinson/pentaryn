"""Gate results as data (python-tooling-41) and the blueprint gates (W3).

The prose gates are pinned in test_module_checks.py; these pin what `--json` and the
vendor / conformance gates add. Synthetic modules in tmp_path, never the real ones.
"""

from __future__ import annotations

import json

import pytest

from scripts.foundry.blueprint import vendor
from scripts.foundry.ops import config as cfg, modules


class TmpSpec(cfg.ModuleSpec):
    def __init__(self, root, **kw):
        super().__init__(root.name, **kw)
        self._root = root

    @property
    def src(self):
        return self._root


def _module(tmp_path, files: dict[str, str], *, manifest: dict | None = None):
    root = tmp_path / "modules" / "pentaryn-demo"
    root.mkdir(parents=True)
    for name, text in files.items():
        (root / name).parent.mkdir(parents=True, exist_ok=True)
        (root / name).write_text(text, encoding="utf-8")
    (root / "module.json").write_text(json.dumps(
        manifest or {"id": "pentaryn-demo", "esmodules": ["main.mjs"]}), encoding="utf-8")
    return root


BROKEN = {"main.mjs": 'import { alpha } from "./lib2.mjs";\n',
          "lib2.mjs": "export const beta = 1;\n"}


# ── GateResult ────────────────────────────────────────────────────────────────

def test_check_report_names_the_failing_gate_and_problem(tmp_path, monkeypatch):
    spec = TmpSpec(_module(tmp_path, BROKEN), check=("imports", "i18n"))
    monkeypatch.setitem(cfg.MODULES, "demo", spec)
    report = modules.check_report("demo")
    assert report["module"] == "demo" and report["ok"] is False
    assert [g["gate"] for g in report["gates"]] == ["imports"], "stops at the first failure"
    gate = report["gates"][0]
    assert gate["ok"] is False and "alpha" in gate["problems"][0]
    json.dumps(report)                                   # serialisable as-is


def test_check_report_is_silent(tmp_path, monkeypatch, capsys):
    spec = TmpSpec(_module(tmp_path, BROKEN), check=("imports",))
    monkeypatch.setitem(cfg.MODULES, "demo", spec)
    modules.check_report("demo")
    assert capsys.readouterr().out == ""


def test_prose_and_data_agree(tmp_path, capsys):
    spec = TmpSpec(_module(tmp_path, BROKEN), check=("imports",))
    rc = modules._check_imports(spec)
    out = capsys.readouterr().out
    res = modules._gate_imports(spec)
    assert rc == 1 and res.ok is False
    assert f"✗ {res.summary}" in out and all(p.splitlines()[0] in out for p in res.problems)


def test_imports_gate_ignores_a_query_or_fragment_on_the_specifier(tmp_path):
    # Frozen suites import `../x.mjs?second` to defeat the module cache; the file is
    # the same one, so the gate resolves it and still checks the named exports.
    ok = _module(tmp_path / "ok", {
        "main.mjs": 'const { beta } = await import("./lib2.mjs?second");\n'
                    'import { beta as b2 } from "./lib2.mjs#frag";\n',
        "lib2.mjs": "export const beta = 1;\n"})
    res = modules._gate_imports(TmpSpec(ok, check=("imports",)))
    assert res.ok is True, res.problems
    bad = _module(tmp_path / "bad", {
        "main.mjs": 'import { alpha } from "./lib2.mjs?order=b";\n',
        "lib2.mjs": "export const beta = 1;\n"})
    res = modules._gate_imports(TmpSpec(bad, check=("imports",)))
    assert res.ok is False and "alpha" in res.problems[0] and "no such file" not in res.problems[0]


def test_node_test_capture_keeps_stdout_clean(tmp_path, capsys):
    if not modules._node_available():
        pytest.skip("node not installed")
    root = _module(tmp_path, {"main.mjs": "export {};\n",
                              "test/run.mjs": 'console.log("suite says hi"); process.exit(3);\n'})
    res = modules._gate_node_test(TmpSpec(root, check=("node-test",)), capture=True)
    assert capsys.readouterr().out == ""
    assert res.ok is False and res.counts["returncode"] == 3
    assert "suite says hi" in "\n".join(res.problems)


# ── vendor gate ───────────────────────────────────────────────────────────────

def test_vendor_gate_skips_an_unmigrated_module(tmp_path):
    res = modules._gate_vendor(TmpSpec(_module(tmp_path, {"main.mjs": ""}), check=("vendor",)))
    assert res.ok and res.skipped


def test_vendor_gate_passes_identical_and_fails_drift(tmp_path):
    root = _module(tmp_path, {"main.mjs": ""})
    vendor.sync(root, tier="small")
    spec = TmpSpec(root, check=("vendor",))
    assert spec.kit, "the lock is what makes it migrated"
    res = modules._gate_vendor(spec)
    assert res.ok and not res.skipped
    victim = root / "lib" / f"{spec.kit[0]}.mjs"
    victim.write_text(victim.read_text(encoding="utf-8") + "\n// drift\n", encoding="utf-8")
    res = modules._gate_vendor(spec)
    assert not res.ok and res.problems


# ── conformance gate ──────────────────────────────────────────────────────────

def test_conformance_gate_skips_an_unmigrated_module(tmp_path):
    res = modules._gate_conformance(TmpSpec(_module(tmp_path, {"main.mjs": ""}),
                                            check=("conformance",)))
    assert res.ok and res.skipped


def _migrated_failing(tmp_path):
    root = _module(tmp_path, {"main.mjs": "export {};\n"})
    vendor.sync(root, tier="small")
    return TmpSpec(root, check=("conformance",))


def test_conformance_gate_is_advisory_until_stage_5(tmp_path, monkeypatch):
    monkeypatch.setattr(modules, "CONFORMANCE_FAILS", False)
    res = modules._gate_conformance(_migrated_failing(tmp_path))
    assert res.ok and not res.skipped
    assert res.counts["failing"], "a bare module fails fail-class rules"
    assert res.notes and "advisory" in res.summary


def test_conformance_gate_fails_on_fail_class_rules_when_enforced(tmp_path, monkeypatch):
    monkeypatch.setattr(modules, "CONFORMANCE_FAILS", True)
    res = modules._gate_conformance(_migrated_failing(tmp_path))
    assert not res.ok and res.problems
    assert {p.split()[0] for p in res.problems} == set(res.counts["failing"])


def test_conformance_gate_reports_a_wait_module_without_failing(tmp_path, monkeypatch):
    from scripts.foundry.blueprint import conformance
    monkeypatch.setattr(modules, "CONFORMANCE_FAILS", True)
    monkeypatch.setitem(conformance.WAIT, "pentaryn-demo", "live test running")
    res = modules._gate_conformance(_migrated_failing(tmp_path))
    assert res.ok and "WAIT" in res.summary


# ── registry wiring ───────────────────────────────────────────────────────────

def test_every_spec_runs_the_blueprint_gates_last():
    for name, spec in cfg.MODULES.items():
        assert spec.check[-2:] == ("vendor", "conformance"), name


# ── check_all (python-tooling-8) ──────────────────────────────────────────────

def test_check_all_keeps_going_and_fails_if_any_failed(monkeypatch, capsys):
    seen: list[str] = []
    monkeypatch.setattr(modules, "check", lambda n: seen.append(n) or (1 if n == "ties" else 0))
    assert modules.check_all() == 1
    assert seen == sorted(cfg.MODULES)
    assert "ties" in capsys.readouterr().out.splitlines()[-1]


def test_check_all_json_is_one_document(monkeypatch, capsys):
    monkeypatch.setattr(modules, "check_report",
                        lambda n: {"module": n, "ok": n != "names", "gates": []})
    assert modules.check_all(as_json=True) == 1
    data = json.loads(capsys.readouterr().out)
    assert [r["module"] for r in data] == sorted(cfg.MODULES)


def test_node_test_runs_from_the_module_folder(tmp_path):
    if not modules._node_available():
        pytest.skip("node not installed")
    root = _module(tmp_path, {"main.mjs": "export {};\n",
                              "test/run.mjs": 'import { existsSync } from "node:fs";\n'
                                              'process.exit(existsSync("module.json") ? 0 : 5);\n'})
    res = modules._gate_node_test(TmpSpec(root, check=("node-test",)), capture=True)
    assert res.ok, res.problems
