"""LG-R7: portals.js keeps a probe's caught error instead of replacing it with the string "threw".

`(await probe(() => P.destinations(...)))?.map?.(f) ?? "threw"` (destinations, afterLink,
afterUnlink) and `(call("followersOf", ...) ?? []).map?.(...) ?? null` threw away the
`{threw, name, ctor, message}` object probe()/call() return, so a failing run showed only "threw"
(or null). Each site now goes through `mapOr`: an array is mapped exactly as before (a healthy
run's golden bytes are unchanged), anything else is stored as-is. Run offline in node on the real
source: the after-only block and the followersOf expression are cut out of portals.js and
evaluated against stubs.
"""
import json
import re
import shutil
import subprocess
from pathlib import Path

import pytest

PORTALS = Path(__file__).resolve().parents[2] / "scripts/foundry/live-goldens/portals.js"
TEXT = PORTALS.read_text(encoding="utf-8")


def _helpers():
    names = ("caught", "probe", "mapOr")
    return "\n".join(m.group(0) for n in names for m in re.finditer(rf"^const {n} = .*$", TEXT, re.M))


def _after_only_block():
    start = TEXT.index('  if (typeof P.destinations === "function") {')
    end_anchor = '} else D.destinations = "absent";'
    stop = TEXT.index(end_anchor, start)
    return TEXT[start:stop + len(end_anchor)]


def _followers_expr():
    m = re.search(r"^\s*followersOf: (.*),$", TEXT, re.M)
    assert m, "followersOf row is missing from portals.js"
    return m.group(1)


HARNESS = r"""
const [src, mode] = process.argv.slice(1);
const boom = () => { const e = new TypeError("ZZ destinations broke"); throw e; };
const P = {
  destinations: mode === "throw" ? async () => boom() : async () => [{ name: "ZZ Gate", scene: "s", card: {}, revealed: true, choice: true }],
  inspect: async () => ({}), link: async () => ({}), unlink: async () => ({}), badges: async () => []
};
const door = { uuid: "Scene.a.Region.door" }, bare = { uuid: "Scene.b.Region.bare" }, actor = {};
const D = {};
const pcA = { id: "pcA" }, records = [];
const fn = new (Object.getPrototypeOf(async function () {}).constructor)(
  "P", "door", "bare", "actor", "D", "pcA", "records", "mode", "boom",
  src + "\nreturn D;");
const out = await fn(P, door, bare, actor, D, pcA, records, mode, boom);
console.log(JSON.stringify(out));
"""


def run(mode):
    exe = shutil.which("node")
    if not exe:
        pytest.skip("node not on PATH")
    src = "\n".join([
        _helpers(),
        'const call = mode === "throw" ? () => { try { boom(); } catch (e) { return caught(e); } } : () => [{ id: "wolf" }];',
        _after_only_block(),
        f"D.followersOf = {_followers_expr()};",
    ])
    proc = subprocess.run([exe, "--input-type=module", "-e", HARNESS, src, mode],
                          capture_output=True, text=True, timeout=30)
    assert proc.returncode == 0, proc.stderr
    return json.loads(proc.stdout)


@pytest.mark.parametrize("key", ["destinations", "afterLink", "afterUnlink", "followersOf"])
def test_lg_r7_caught_error_is_kept(key):
    got = run("throw")[key]
    assert isinstance(got, dict) and got.get("threw") is True, f"LG-R7: {key} lost the caught error: {got!r}"
    assert got["name"] == "TypeError" and got["message"] == "ZZ destinations broke", f"LG-R7: {key}: {got!r}"


def test_lg_r7_healthy_rows_are_unchanged():
    got = run("ok")
    assert got["destinations"] == [{"name": "ZZ Gate", "scene": "s", "card": {}, "revealed": True, "choice": True}]
    assert got["afterLink"] == ["ZZ Gate"]
    assert got["afterUnlink"] == ["ZZ Gate"]
    assert got["followersOf"] == ["wolf"]


def test_lg_r7_no_threw_placeholder_left():
    assert '?? "threw"' not in TEXT, 'LG-R7: portals.js still replaces a caught error with "threw"'
