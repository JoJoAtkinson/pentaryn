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

    # check --all: a lock-less module is skipped, not failed
    assert vendor.main(["check", "--all", "--root", str(root)]) == 0
    (locked / "lib/log.mjs").write_text("// drifted\n")
    assert vendor.main(["check", "--all", "--root", str(root)]) == 1
    capsys.readouterr()
    assert vendor.main(["check", "--all", "--root", str(root), "--json"]) == 1
    report = json.loads(capsys.readouterr().out)
    assert report["skipped"] == ["pentaryn-unlocked"] and report["modules"]["pentaryn-locked"]


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
