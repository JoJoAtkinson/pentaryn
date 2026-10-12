"""LG-E5: the journal golden's cleanup closed every app opened during the run whose document id
was in [src?.id, owned?.id, gmJournal?.id]. On a normal run gmJournal is null (the GM had no
personal journal and J.add did not make one), and src/owned are null when the run fails early, so
`undefined` sat in that list and matched every app with no document — a settings window, a dialog,
a sidebar popout the GM had opened was closed by the golden. The body runs here in node against a
stub world that opens apps during report() and then goes straight to cleanup."""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

LG = Path(__file__).resolve().parents[2] / "scripts/foundry/live-goldens"

RUN = r"""
const [bodyPath, mode] = process.argv.slice(1);
const body = await (await import("node:fs/promises")).readFile(bodyPath, "utf8");
const pages = new Map();
const gm = {
  id: "gmJournal0000001",
  pages: { get contents() { return [...pages.values()]; }, get size() { return pages.size; }, [Symbol.iterator]() { return pages.values(); }, get: id => pages.get(id) },
  async deleteEmbeddedDocuments() {}, async delete() {}
};
const instances = new Map();
const closed = [];
const app = (id, document) => ({ id, document, rendered: true, async close() { this.rendered = false; closed.push(id); } });
globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { OBSERVER: 2, OWNER: 3 } };
globalThis.foundry = { applications: { instances } };
globalThis.JournalEntry = { async create() { throw new Error("stub: straight to cleanup"); } };
globalThis.ui = { notifications: { info() {}, warn() {}, error() {} } };
const J = {
  personal: () => (mode === "gm" ? gm : null),
  async report() {
    // opened during the run: a document-less app (settings/dialog), another journal's sheet, the GM journal's sheet
    instances.set("settings-config", app("settings-config", undefined));
    instances.set("dialog-null-doc", app("dialog-null-doc", null));
    instances.set("other-sheet", app("other-sheet", { id: "otherJournal0001" }));
    instances.set("gm-sheet", app("gm-sheet", gm));
    return { users: [] };
  },
  core: { escapeHTML: s => s, fnv1a: () => 0, sanitize: s => s, validateEnsure: () => null }
};
globalThis.game = {
  world: { id: "zz-stub" }, version: "14.369", system: { id: "dnd5e", version: "6.0.6" },
  modules: { get: () => ({ version: "stub", active: true }) },
  users: Object.assign([], { find: () => null, filter: () => [] }),
  settings: { get: () => true, async set() {} },
  journal: Object.assign([], { get: id => (mode === "gm" && id === gm.id ? gm : null) }),
  folders: { get: () => null },
  pentaryn: { journal: J }
};
const fn = new (Object.getPrototypeOf(async function () {}).constructor)(body);
const out = JSON.parse(await fn());
console.log(JSON.stringify({ closed: closed.sort(), error: out.golden?.shared?.error ?? null }));
"""


def run(mode):
    node = shutil.which("node")
    if not node:
        pytest.skip("node not on PATH")
    proc = subprocess.run([node, "--input-type=module", "-e", RUN, str(LG / "journal.js"), mode],
                          capture_output=True, text=True, timeout=30)
    assert proc.returncode == 0, proc.stderr
    return json.loads(proc.stdout)


def test_cleanup_leaves_document_less_apps_open_when_gm_journal_is_null_LG_E5():
    out = run("none")
    assert out["closed"] == [], f"LG-E5: cleanup closed apps unrelated to the run's journals: {out['closed']}"


def test_cleanup_still_closes_the_gm_journal_sheet_it_opened_LG_E5():
    out = run("gm")
    assert out["closed"] == ["gm-sheet"], f"LG-E5: cleanup must close only the run's journal sheets: {out['closed']}"
