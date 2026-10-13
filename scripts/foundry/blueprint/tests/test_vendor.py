"""Vendoring: copies are byte-identical, drift is caught, packages are refused, module.json is never touched."""

from __future__ import annotations

import json

import pytest

from scripts.foundry.blueprint import vendor


def make_module(tmp_path, name="pentaryn-demo", *, relationships=None, tier="small"):
    d = tmp_path / name
    d.mkdir()
    (d / "module.json").write_text(json.dumps({
        "id": name, "relationships": relationships or {},
        "flags": {"pentaryn": {"tier": tier}}}, indent=2) + "\n")
    return d


def test_sync_then_check_is_clean(tmp_path):
    d = make_module(tmp_path)
    written = vendor.sync(d)
    assert "lib/kit.lock.json" in written
    lock = json.loads((d / "lib/kit.lock.json").read_text())
    kit = vendor.load_kit()
    assert lock["version"] == kit["version"]
    assert lock["files"] == vendor.closure(kit["tiers"]["small"], kit)
    for n in lock["files"]:
        assert (d / "lib" / f"{n}.mjs").read_bytes() == (vendor.LIB_ROOT / f"{n}.mjs").read_bytes()
    for f in kit["testKit"]:
        assert (d / "test/kit" / f).exists()
    assert vendor.check(d) == []


def test_one_byte_difference_fails(tmp_path):
    d = make_module(tmp_path)
    vendor.sync(d)
    p = d / "lib/log.mjs"
    p.write_bytes(p.read_bytes() + b" ")
    problems = vendor.check(d)
    assert any("lib/log.mjs differs" in x for x in problems)


def test_test_kit_difference_fails(tmp_path):
    d = make_module(tmp_path)
    vendor.sync(d)
    (d / "test/kit/harness.mjs").write_text("// mine\n")
    assert any("test/kit/harness.mjs differs" in x for x in vendor.check(d))


def test_unlisted_lib_file_fails(tmp_path):
    d = make_module(tmp_path)
    vendor.sync(d)
    (d / "lib/mine.mjs").write_text("export const x = 1;\n")
    assert any("lib/mine.mjs is not in kit.lock.json" in x for x in vendor.check(d))


def test_import_of_an_unlocked_kit_file_fails(tmp_path):
    d = make_module(tmp_path)
    vendor.sync(d)
    (d / "main.mjs").write_text('import { memo } from "./lib/perf.mjs";\n')
    assert any("imports ./lib/perf.mjs" in x for x in vendor.check(d))


def test_missing_lock_and_stale_version_fail(tmp_path):
    d = make_module(tmp_path)
    assert any("no lib/kit.lock.json" in x for x in vendor.check(d))
    vendor.sync(d)
    lock = d / "lib/kit.lock.json"
    data = json.loads(lock.read_text())
    data["version"] = "0.0.1"
    lock.write_text(json.dumps(data))
    assert any("lock version" in x for x in vendor.check(d))


def test_package_files_are_refused_without_the_relationship(tmp_path):
    d = make_module(tmp_path)
    with pytest.raises(vendor.VendorError, match="relationships"):
        vendor.sync(d, extra=["patch-libwrapper"])
    assert not (d / "lib").exists()
    ok = make_module(tmp_path, "pentaryn-ok", relationships={"recommends": [{"id": "lib-wrapper", "type": "module", "reason": "x"}]})
    vendor.sync(ok, extra=["patch-libwrapper"])
    lock = json.loads((ok / "lib/kit.lock.json").read_text())
    assert "patch-libwrapper" in lock["files"] and "patch" in lock["files"]
    assert vendor.check(ok) == []


def test_deferred_files_are_refused(tmp_path):
    # argon-kit was the real deferred row until wave 4 wrote it; a synthetic one keeps the refusal pinned
    lib = tmp_path / "lib"
    lib.mkdir()
    for f in vendor.LIB_ROOT.glob("*.mjs"):
        (lib / f.name).write_bytes(f.read_bytes())
    (lib / "test-kit").mkdir()
    kit = vendor.load_kit()
    for f in kit["testKit"]:
        (lib / "test-kit" / f).write_bytes((vendor.LIB_ROOT / "test-kit" / f).read_bytes())
    kit["files"]["later"] = {"deps": [], "status": "deferred"}
    (lib / "kit.json").write_text(json.dumps(kit))
    d = make_module(tmp_path)
    with pytest.raises(vendor.VendorError, match="deferred"):
        vendor.sync(d, extra=["later"], lib_root=lib)


def test_bad_ext_refuses_before_writing(tmp_path):
    # VendorError promises "nothing was written": a bad `ext` must refuse before any lib/ copy
    lib = tmp_path / "lib"
    lib.mkdir()
    for f in vendor.LIB_ROOT.glob("*.mjs"):
        (lib / f.name).write_bytes(f.read_bytes())
    (lib / "test-kit").mkdir()
    kit = vendor.load_kit()
    for f in kit["testKit"]:
        (lib / "test-kit" / f).write_bytes((vendor.LIB_ROOT / "test-kit" / f).read_bytes())
    kit["files"]["zz"] = {"deps": [], "ext": "scss"}
    (lib / "kit.json").write_text(json.dumps(kit))
    d = make_module(tmp_path)
    with pytest.raises(vendor.VendorError, match="ext"):
        vendor.sync(d, extra=["zz"], lib_root=lib)
    assert not list((d / "lib").glob("*.mjs"))


def test_argon_kit_vendors_with_its_package(tmp_path):
    d = make_module(tmp_path, relationships={"recommends": [{"id": "enhancedcombathud", "type": "module", "reason": "x"}]})
    vendor.sync(d, extra=["argon-kit"])
    assert (d / "lib/argon-kit.mjs").read_bytes() == (vendor.LIB_ROOT / "argon-kit.mjs").read_bytes()
    assert vendor.check(d) == []
    bare = make_module(tmp_path, "pentaryn-bare")
    with pytest.raises(vendor.VendorError, match="enhancedcombathud"):
        vendor.sync(bare, extra=["argon-kit"])


def test_refusal_names_the_kit_file_with_its_ext(tmp_path):
    # a CSS kit file is named argon-tooltip.css in the refusal, not argon-tooltip.mjs (wave-4 riders lane)
    bare = make_module(tmp_path, "pentaryn-bare")
    with pytest.raises(vendor.VendorError, match=r"^argon-tooltip\.css names enhancedcombathud"):
        vendor.sync(bare, extra=["argon-tooltip"])


def test_module_json_is_never_touched(tmp_path):
    d = make_module(tmp_path, tier="full")
    before = (d / "module.json").read_bytes()
    vendor.sync(d)
    vendor.sync(d, tier="small", extra=["perf"])
    assert (d / "module.json").read_bytes() == before


def test_resync_keeps_the_lock_and_drops_stale_kit_files(tmp_path):
    d = make_module(tmp_path)
    vendor.sync(d, extra=["perf"])
    assert (d / "lib/perf.mjs").exists()
    vendor.sync(d)                                   # the lock is the list now
    assert (d / "lib/perf.mjs").exists()
    vendor.sync(d, tier="small")                     # an explicit tier replaces it
    assert not (d / "lib/perf.mjs").exists()
    assert vendor.check(d) == []


def test_cli_check_exit_codes(tmp_path, capsys):
    d = make_module(tmp_path)
    vendor.sync(d)
    assert vendor.main(["check", str(d)]) == 0
    (d / "lib/errors.mjs").write_text("x")
    assert vendor.main(["check", str(d)]) == 1


def test_all_touches_only_locked_modules(tmp_path, capsys):
    root = tmp_path / "modules"
    root.mkdir()
    locked = make_module(root, "pentaryn-locked")
    vendor.sync(locked)
    unlocked = make_module(root, "pentaryn-unlocked", tier="full")
    before = sorted(p.relative_to(unlocked).as_posix() for p in unlocked.rglob("*"))
    (locked / "lib/log.mjs").write_text("// drifted\n")

    assert vendor.main(["sync", "--all", "--root", str(root)]) == 0
    assert sorted(p.relative_to(unlocked).as_posix() for p in unlocked.rglob("*")) == before == ["module.json"]
    assert vendor.check(locked) == []                       # the locked one was re-vendored
    out = capsys.readouterr().out
    assert "skipped" in out and "pentaryn-unlocked" in out

    # check --all: a lock-less module FAILS (Stage 5: every module vendors the kit)
    assert vendor.main(["check", "--all", "--root", str(root)]) == 1
    assert "pentaryn-unlocked" in capsys.readouterr().out
    assert vendor.main(["check", "--all", "--root", str(root), "--json"]) == 1
    report = json.loads(capsys.readouterr().out)
    assert report["skipped"] == ["pentaryn-unlocked"] and report["modules"]["pentaryn-locked"] == []
    vendor.sync(unlocked, tier="full")
    assert vendor.main(["check", "--all", "--root", str(root)]) == 0
    (locked / "lib/log.mjs").write_text("// drifted\n")
    assert vendor.main(["check", "--all", "--root", str(root)]) == 1
    capsys.readouterr()
    assert vendor.main(["check", "--all", "--root", str(root), "--json"]) == 1
    report = json.loads(capsys.readouterr().out)
    assert report["skipped"] == [] and report["modules"]["pentaryn-locked"]


def test_sync_records_the_tier_in_the_lock_and_keeps_it(tmp_path):
    d = tmp_path / "pentaryn-tierless"
    d.mkdir()
    (d / "module.json").write_text(json.dumps({"id": "pentaryn-tierless"}) + "\n")   # no flags.pentaryn.tier yet
    vendor.sync(d, tier="small")
    assert json.loads((d / "lib/kit.lock.json").read_text())["tier"] == "small"
    vendor.sync(d, extra=["api"])                    # a re-sync from the lock keeps the tier
    lock = json.loads((d / "lib/kit.lock.json").read_text())
    assert lock["tier"] == "small" and "api" in lock["files"]
    e = make_module(tmp_path, "pentaryn-flagged", tier="full")
    vendor.sync(e)                                   # no --tier: the manifest's tier is recorded
    assert json.loads((e / "lib/kit.lock.json").read_text())["tier"] == "full"
    assert vendor.check(d) == [] and vendor.check(e) == []


def _argon_module(tmp_path, name="pentaryn-argon", styles=None):
    d = make_module(tmp_path, name, relationships={"recommends": [{"id": "enhancedcombathud", "type": "module", "reason": "x"}]})
    if styles is not None:
        data = json.loads((d / "module.json").read_text())
        data["styles"] = styles
        (d / "module.json").write_text(json.dumps(data))
    return d


def test_css_kit_file_is_vendored_byte_identical_and_checked(tmp_path):
    kit = vendor.load_kit()
    assert kit["files"]["argon-tooltip"]["ext"] == "css"
    assert vendor.kit_file("argon-tooltip", kit) == "argon-tooltip.css"
    assert vendor.kit_file("errors", kit) == "errors.mjs"
    d = _argon_module(tmp_path, styles=["lib/argon-tooltip.css"])
    written = vendor.sync(d, extra=["argon-tooltip"])
    assert "lib/argon-tooltip.css" in written
    assert (d / "lib/argon-tooltip.css").read_bytes() == (vendor.LIB_ROOT / "argon-tooltip.css").read_bytes()
    assert "argon-tooltip" in json.loads((d / "lib/kit.lock.json").read_text())["files"]
    assert vendor.check(d) == []
    p = d / "lib/argon-tooltip.css"
    p.write_bytes(p.read_bytes() + b" ")
    assert any("lib/argon-tooltip.css differs" in x for x in vendor.check(d))


def test_css_kit_file_needs_the_package_relationship(tmp_path):
    d = make_module(tmp_path)
    with pytest.raises(vendor.VendorError, match="relationships"):
        vendor.sync(d, extra=["argon-tooltip"])


def test_css_kit_file_is_dropped_on_resync_and_strays_are_reported(tmp_path):
    d = _argon_module(tmp_path)
    vendor.sync(d, extra=["argon-tooltip"])
    vendor.sync(d, tier="small")                       # an explicit tier replaces the lock
    assert not (d / "lib/argon-tooltip.css").exists()
    (d / "lib/mine.css").write_text(".x {}\n")
    assert any("lib/mine.css is not in kit.lock.json" in x for x in vendor.check(d))


def test_styles_naming_an_unlocked_kit_css_fails(tmp_path):
    d = _argon_module(tmp_path, styles=["styles/own.css", "lib/argon-tooltip.css"])
    vendor.sync(d)
    assert any("styles lists lib/argon-tooltip.css" in x for x in vendor.check(d))


def test_bad_ext_is_refused(tmp_path):
    kit = {"files": {"x": {"deps": [], "ext": "scss"}}}
    with pytest.raises(vendor.VendorError, match="ext"):
        vendor.kit_file("x", kit)


def test_a_copy_vendored_at_an_older_kit_names_both_versions(tmp_path):
    """'differs' alone hid the cause: a copy left at an older kit than the lock (FX-L, 2026-10-12)."""
    d = make_module(tmp_path)
    vendor.sync(d)
    lock_v = json.loads((d / "lib/kit.lock.json").read_text())["version"]
    p = d / "lib/log.mjs"
    text = p.read_text(encoding="utf-8")
    p.write_text(text.replace(f"// pentaryn kit {lock_v} ", "// pentaryn kit 1.0.2 ", 1), encoding="utf-8")
    msgs = [x for x in vendor.check(d) if "lib/log.mjs" in x]
    assert len(msgs) == 1
    assert "lib/log.mjs differs" in msgs[0]
    assert f"vendored at 1.0.2, lock is {lock_v}" in msgs[0]
    assert "vendor.py sync pentaryn-demo" in msgs[0]


def test_a_css_copy_at_an_older_kit_names_both_versions(tmp_path):
    d = make_module(tmp_path, relationships={"requires": [{"id": "enhancedcombathud"}]})
    vendor.sync(d, extra=["argon-tooltip"])
    lock_v = json.loads((d / "lib/kit.lock.json").read_text())["version"]
    p = d / "lib/argon-tooltip.css"
    text = p.read_text(encoding="utf-8")
    assert text.startswith(f"/* pentaryn kit {lock_v} ")
    p.write_text(text.replace(f"/* pentaryn kit {lock_v} ", "/* pentaryn kit 1.0.2 ", 1), encoding="utf-8")
    assert any(f"vendored at 1.0.2, lock is {lock_v}" in x for x in vendor.check(d))


def test_a_same_version_edit_still_says_never_edit_a_copy(tmp_path):
    d = make_module(tmp_path)
    vendor.sync(d)
    p = d / "lib/log.mjs"
    p.write_bytes(p.read_bytes() + b" ")
    msg = next(x for x in vendor.check(d) if "lib/log.mjs differs" in x)
    assert "never edit a copy" in msg and "vendored at" not in msg


def test_a_corrupt_lock_is_that_modules_problem_not_a_traceback(tmp_path, capsys):
    """py-blueprint-ROB-4: a kit.lock.json that is not JSON is reported against its own module —
    read_lock raises VendorError, check() lists it, `--all` reports it and carries on with the rest."""
    root = tmp_path / "modules"
    root.mkdir()
    bad = make_module(root, "pentaryn-bad")
    good = make_module(root, "pentaryn-good")
    vendor.sync(bad)
    vendor.sync(good)
    (bad / "lib/kit.lock.json").write_text("{not json\n")

    with pytest.raises(vendor.VendorError, match=r"pentaryn-bad: lib/kit.lock.json is not valid JSON"):
        vendor.read_lock(bad)
    problems = vendor.check(bad)
    assert len(problems) == 1 and "pentaryn-bad: lib/kit.lock.json is not valid JSON" in problems[0]

    assert vendor.main(["check", "--all", "--root", str(root)]) == 1
    out = capsys.readouterr().out
    assert "✗ pentaryn-bad: lib/kit.lock.json is not valid JSON" in out
    assert "✓ pentaryn-good" in out
    assert vendor.main(["check", "--all", "--root", str(root), "--json"]) == 1
    report = json.loads(capsys.readouterr().out)
    assert report["modules"]["pentaryn-good"] == [] and report["modules"]["pentaryn-bad"]

    (good / "lib/log.mjs").write_text("// drifted\n")
    assert vendor.main(["sync", "--all", "--root", str(root)]) == 1
    captured = capsys.readouterr()
    assert "✗ pentaryn-bad: lib/kit.lock.json is not valid JSON" in captured.err
    assert "✓ pentaryn-good" in captured.out
    assert vendor.check(good) == []                         # the rest were still synced
    assert (bad / "lib/kit.lock.json").read_text() == "{not json\n"   # the corrupt lock is left alone


def test_a_null_pentaryn_flag_is_no_tier_not_a_traceback(tmp_path):
    """py-blueprint-MAINT-7: `"flags": {"pentaryn": null}` reads as "no tier" (default full),
    the way conformance.Module.flags reads it — not an AttributeError out of sync."""
    d = tmp_path / "pentaryn-nullflag"
    d.mkdir()
    (d / "module.json").write_text(json.dumps({
        "id": "pentaryn-nullflag", "relationships": {}, "flags": {"pentaryn": None}}) + "\n")
    kit = vendor.load_kit()
    assert vendor.plan(d)["files"] == vendor.closure(kit["tiers"]["full"], kit)
    vendor.sync(d)
    assert vendor.check(d) == []
