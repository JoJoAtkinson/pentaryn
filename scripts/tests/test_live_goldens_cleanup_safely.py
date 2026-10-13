"""LG-R8: one refused delete in a golden's cleanup must not skip the rest.

Every golden's `finally` awaited its deletes back to back, unguarded. When Foundry refused one (a
permission, a stale document, a module hook that throws), the exception left `finally` at once:
the later deletes never ran, the ZZ scratch documents stayed in the world, and the eval returned no
JSON at all, so diff.mjs had nothing to judge. Each awaited cleanup step now runs through the
preamble helper `safely(name, fn)`, which records `<name>CleanupError: "NOT done: <why>"` — a string
diff.mjs's leftovers() fails on — and lets the next step run.

The bodies run here in node against a stub world whose first scratch delete is refused, and the
cleanup is fed to diff.mjs's own leftovers(). A static check pins every other golden's `finally`."""
import json
import re
import shutil
import subprocess
from pathlib import Path

import pytest

LG = Path(__file__).resolve().parents[2] / "scripts/foundry/live-goldens"

RUN = r"""
const [bodyPath, diffPath] = process.argv.slice(1);
const body = await (await import("node:fs/promises")).readFile(bodyPath, "utf8");
const { leftovers } = await import(diffPath);
const world = new Map();
const deleted = [];
let n = 0;
const REFUSE = new Set(REFUSED);
globalThis.Actor = { async create(data) {
  const id = `zzActor${String(++n).padStart(9, "0")}`;
  const doc = { id, name: data.name, type: data.type, items: [], flags: {}, system: data.system ?? {},
    async delete() { if (REFUSE.has(data.name)) throw new Error(`refused: ${data.name}`); world.delete(id); deleted.push(data.name); } };
  world.set(id, doc);
  return doc;
},
// LG-AC-3: a batch is one request, refused whole when any document in it is refused
async deleteDocuments(ids) {
  const docs = ids.map(id => world.get(id));
  const bad = docs.find(d => REFUSE.has(d.name));
  if (bad) throw new Error(`refused: ${bad.name}`);
  for (const d of docs) { world.delete(d.id); deleted.push(d.name); }
} };
const notes = { info() {}, warn() {}, error() {} };
globalThis.ui = { notifications: notes };
globalThis.game = {
  world: { id: "zz-stub" }, version: "14.369", system: { id: "dnd5e", version: "6.0.6" },
  modules: { get: () => undefined },
  user: { id: "gm", isGM: true, flags: {} },
  users: { filter: () => [] }, combats: { filter: () => [] }, messages: { filter: () => [] },
  settings: { settings: new Map(), get: () => null, async set() {} },
  actors: { get: id => world.get(id) ?? null, filter: f => [...world.values()].filter(f) },
  pentaryn: STUB
};
const fn = new (Object.getPrototypeOf(async function () {}).constructor)(body);
let ret, rejected = null;
try { ret = await fn(); } catch (e) { rejected = String(e?.message ?? e); }
const out = typeof ret === "string" ? JSON.parse(ret) : null;
console.log(JSON.stringify({ rejected, cleanup: out?.cleanup ?? null, leftovers: out ? leftovers(out.cleanup) : null, deleted }));
"""

# game.pentaryn stubs that create the scratch actors, then fail so the run goes straight to cleanup
STUBS = {
    "ties": ('{ ties: { known: {}, study: { audit: {} }, attributes: { list: () => [{ id: "a1", title: "A", category: "c" }] } } }',
             ["ZZ Golden Ties Subject"], []),
    "combat": ("{ combat: { running: () => null, quick: () => null, riderMode: () => null } }",
               ["ZZ Golden Combat Fighter"], []),
    # LG-AC-3: its three actors go in one batch, so the refused owner takes the batch with it
    "attunement": ("{ attunement: {} }",
                   ["ZZ Golden Attunement Owner"], []),
}


def run(stem):
    node = shutil.which("node")
    if not node:
        pytest.skip("node not on PATH")
    stub, refused, _ = STUBS[stem]
    script = RUN.replace("STUB", stub).replace("REFUSED", json.dumps(refused))
    proc = subprocess.run([node, "--input-type=module", "-e", script, str(LG / f"{stem}.js"), str(LG / "diff.mjs")],
                          capture_output=True, text=True, timeout=30)
    assert proc.returncode == 0, proc.stderr
    return json.loads(proc.stdout)


@pytest.mark.parametrize("stem", sorted(STUBS))
def test_lg_r8_a_refused_delete_is_reported_and_the_rest_still_run(stem):
    r = run(stem)
    _, refused, rest = STUBS[stem]
    assert r["rejected"] is None, f"LG-R8: {stem}.js threw out of its cleanup and returned no JSON: {r['rejected']}"
    assert r["deleted"] == rest, f"LG-R8: {stem}.js skipped the deletes after a refused one: deleted {r['deleted']}"
    errors = {k: v for k, v in r["cleanup"].items() if k.endswith("CleanupError")}
    assert len(errors) == len(refused), f"LG-R8: {stem}.js cleanup {r['cleanup']}"
    assert all(v.startswith("NOT done: refused: ") for v in errors.values()), errors
    assert any("NOT done" in x for x in r["leftovers"]), f"LG-R8: diff.mjs passes {stem}.js: {r['leftovers']}"


# what a `finally` may await bare: waits, and pings' restorePingLog() (it catches and returns false)
BARE = re.compile(r"await (safely|sleep|tick|restorePingLog)\(")


def _finally(text):
    start = text.find("\n} finally {\n")
    return None if start < 0 else text[start:text.index("\n}\n", start + 1)]


@pytest.mark.parametrize("path", sorted(LG.glob("*.js")), ids=lambda p: p.stem)
def test_lg_r8_every_awaited_cleanup_step_runs_through_safely(path):
    block = _finally(path.read_text(encoding="utf-8"))
    if block is None:
        pytest.skip("no finally block")
    # the first await on a line must be one of BARE; anything awaited inside safely()'s callback is guarded
    bare = [line.strip() for line in block.splitlines() if "await " in line and not BARE.match(line[line.index("await "):])]
    assert bare == [], f"LG-R8: {path.name} awaits a cleanup step outside safely():\n" + "\n".join(bare)
    assert not re.search(r"^  out\.cleanup = ", block, re.M), \
        f"LG-R8: {path.name} replaces out.cleanup in finally, dropping safely()'s *CleanupError keys"
