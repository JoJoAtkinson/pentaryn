"""EXT-3: diff.mjs judges a live golden's `cleanup` by top-level key name only (`<thing>Left`
above 0, `<thing>Restored === false`). The cursors golden reported its tool restore as two nested
objects (`restored`, `wanted`) and the journal golden its leftover pages as two counts
(`gmJournalPagesNow`, `gmJournalPagesBefore`), so a failed restore or a leaked page printed but
never failed the diff. Each body runs here in node against a stub world that goes straight to
cleanup, and the cleanup is fed to diff.mjs's own leftovers()."""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

LG = Path(__file__).resolve().parents[2] / "scripts/foundry/live-goldens"

RUN = r"""
const [bodyPath, diffPath, mode] = process.argv.slice(1);
const body = await (await import("node:fs/promises")).readFile(bodyPath, "utf8");
const { leftovers } = await import(diffPath);
SETUP
const fn = new (Object.getPrototypeOf(async function () {}).constructor)(body);
const out = JSON.parse(await fn());
console.log(JSON.stringify({ cleanup: out.cleanup, leftovers: leftovers(out.cleanup) }));
"""

# the run leaves the GM on tokens.target; ui.controls.activate() either switches tool (the restore
# works) or, in "stuck", does nothing (the restore fails)
CURSORS = r"""
const state = { control: "walls", tool: "draw", calls: 0 };
globalThis.canvas = null;
globalThis.ui = { controls: {
  get control() { return { name: state.control }; }, get tool() { return { name: state.tool }; },
  async activate({ control, tool }) { state.calls++; if (mode === "stuck") return; state.control = control; state.tool = tool; }
} };
globalThis.game = {
  pentaryn: { cursors: { keys: {}, current: () => state.tool, keyFor: () => "k", refresh() {} } },
  modules: { get() { state.control = "tokens"; state.tool = "target"; throw new Error("stub: straight to cleanup"); } }
};
"""

# the GM journal gains a page during the run; in "leak" its page delete is a no-op
JOURNAL = r"""
const pages = new Map([["oldPage000000001", { id: "oldPage000000001" }]]);
const gm = {
  id: "gmJournal0000001",
  pages: { get contents() { return [...pages.values()]; }, get size() { return pages.size; }, [Symbol.iterator]() { return pages.values(); } },
  async deleteEmbeddedDocuments(_t, ids) { if (mode !== "leak") for (const id of ids) pages.delete(id); },
  async delete() {}
};
globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { OBSERVER: 2, OWNER: 3 } };
globalThis.foundry = { applications: { instances: new Map() } };
globalThis.JournalEntry = { async create() { throw new Error("stub: straight to cleanup"); } };
const notes = { info() {}, warn() {}, error() {} };
globalThis.ui = { notifications: notes };
const J = {
  personal: () => gm,
  async report() { pages.set("newPage000000001", { id: "newPage000000001" }); return { users: [] }; },
  core: { escapeHTML: s => s, fnv1a: () => 0, sanitize: s => s, validateEnsure: () => null }
};
globalThis.game = {
  world: { id: "zz-stub" }, version: "14.369", system: { id: "dnd5e", version: "6.0.6" },
  modules: { get: () => ({ version: "stub", active: true }) },
  users: Object.assign([], { find: () => null, filter: () => [] }),
  settings: { get: () => true, async set() {} },
  journal: Object.assign([], { get: id => (id === gm.id ? gm : null) }),
  folders: { get: () => null },
  pentaryn: { journal: J }
};
"""


def run(golden, setup, mode):
    node = shutil.which("node")
    if not node:
        pytest.skip("node not on PATH")
    proc = subprocess.run([node, "--input-type=module", "-e", RUN.replace("SETUP", setup),
                           str(LG / golden), str(LG / "diff.mjs"), mode],
                          capture_output=True, text=True, timeout=30)
    assert proc.returncode == 0, proc.stderr
    return json.loads(proc.stdout)


def test_cursors_cleanup_reports_a_judgeable_tool_restore_EXT_3():
    ok = run("cursors.js", CURSORS, "ok")
    assert ok["cleanup"]["toolRestored"] is True, ok["cleanup"]
    assert ok["leftovers"] == []
    assert ok["cleanup"]["restored"]["tool"] == "draw" and ok["cleanup"]["wanted"]["tool"] == "draw"
    stuck = run("cursors.js", CURSORS, "stuck")
    assert stuck["cleanup"]["toolRestored"] is False, "EXT-3: a failed tool restore must read toolRestored=false"
    assert "toolRestored=false" in stuck["leftovers"], "EXT-3: diff.mjs could not judge the cursors restore"


def test_journal_cleanup_reports_leftover_gm_pages_EXT_3():
    ok = run("journal.js", JOURNAL, "ok")
    assert ok["cleanup"]["gmJournalPagesLeft"] == 0, ok["cleanup"]
    assert ok["leftovers"] == []
    assert ok["cleanup"]["gmJournalPagesBefore"] == 1 and ok["cleanup"]["gmJournalPagesNow"] == 1
    leak = run("journal.js", JOURNAL, "leak")
    assert leak["cleanup"]["gmJournalPagesLeft"] == 1, "EXT-3: a page left in the GM journal must count"
    assert "gmJournalPagesLeft=1" in leak["leftovers"], "EXT-3: diff.mjs could not judge the journal cleanup"
