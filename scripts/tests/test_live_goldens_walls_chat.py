"""LG-AC-1: the walls live golden (scripts/foundry/live-goldens/walls.js) captures the chat cards
it causes through a createChatMessage hook and deletes them in cleanup. The hook must keep only
this GM's own messages, so a player's (or another tab's) message posted while the golden runs is
never recorded as a card and never deleted. This runs the body in node against a stub world where
the walls API posts one foreign and one own message, then the scratch scene fails to create, so
the body goes straight to cleanup."""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

WALLS = Path(__file__).resolve().parents[2] / "scripts/foundry/live-goldens/walls.js"

HARNESS = r"""
const body = await (await import("node:fs/promises")).readFile(process.argv[1], "utf8");
const hooks = new Map();
let next = 1;
globalThis.Hooks = {
  on(name, fn) { const id = next++; hooks.set(id, { name, fn }); return id; },
  off(name, id) { hooks.delete(id); }
};
const fire = (name, ...args) => { for (const h of hooks.values()) if (h.name === name) h.fn(...args); };
const messages = new Map();
const post = (id, userId) => { const m = { id, content: `<p>${id}</p>` }; messages.set(id, m); fire("createChatMessage", m, {}, userId); };
const deleted = [];
globalThis.ChatMessage = { async deleteDocuments(ids) { for (const id of ids) { deleted.push(id); messages.delete(id); } } };
globalThis.Scene = { async create() { throw new Error("stub: no scenes here"); } };
const W = {
  version: "stub", contract: null,
  async backends() { post("foreignMsg000001", "playerUser00001"); post("ownMsg0000000001", "gmUser000000001"); return []; },
  async runEngine() { return {}; }
};
globalThis.game = {
  world: { id: "zz-stub" }, version: "14.369", system: { id: "dnd5e", version: "6.0.6" },
  modules: new Map([["pentaryn-walls", { active: true, version: "stub" }]]),
  user: { id: "gmUser000000001", isGM: true },
  messages: { has: id => messages.has(id), get: id => messages.get(id) },
  scenes: Object.assign([], { get: () => null }),
  pentaryn: { walls: W }
};
const fn = new (Object.getPrototypeOf(async function () {}).constructor)(body);
const out = JSON.parse(await fn());
console.log(JSON.stringify({ deleted, left: [...messages.keys()], cleanup: out.cleanup, hooksLeft: hooks.size }));
"""


def test_walls_golden_deletes_only_its_own_chat_messages_LG_AC_1():
    node = shutil.which("node")
    if not node:
        pytest.skip("node not on PATH")
    proc = subprocess.run([node, "--input-type=module", "-e", HARNESS, str(WALLS)],
                          capture_output=True, text=True, timeout=30)
    assert proc.returncode == 0, proc.stderr
    r = json.loads(proc.stdout)
    assert r["deleted"] == ["ownMsg0000000001"], "LG-AC-1: the golden deleted a message another user posted"
    assert "foreignMsg000001" in r["left"]
    assert r["cleanup"]["chatDeleted"] == 1
    assert r["cleanup"]["chatLeft"] == 0
    assert r["hooksLeft"] == 0
