/**
 * i18n (guide step 4, C35/C36, prompts-lookup-33): every literal PENTARYN_PROMPTS.* key the sources
 * name exists in lang/en.json, no two-branch `t()` wrapper is left, and the typeahead orphan toast
 * the entry's sink shows reads the same as the old hard-coded one (cut at 120 characters).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readJSON, sourceScan } from "./kit/harness.mjs";
import { installWorld, captureConsole } from "./fixtures/world.mjs";

const ROOT = new URL("..", import.meta.url);
const flat = (node, prefix = "", out = new Set()) => {
  for (const [k, v] of Object.entries(node)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") flat(v, key, out);
    else out.add(key);
  }
  return out;
};
const keys = flat(readJSON(new URL("lang/en.json", ROOT)));

test("every literal PENTARYN_PROMPTS.* key in the sources exists in lang/en.json", () => {
  const used = new Set();
  for (const hit of sourceScan(ROOT, /PENTARYN_PROMPTS\.[\w.]*\w(?![\w.$])/)) {
    for (const m of hit.text.matchAll(/PENTARYN_PROMPTS\.[\w.]*\w(?![\w.$])/g)) used.add(m[0]);
  }
  assert.ok(used.size >= 30, `only ${used.size} literal keys found`);
  for (const k of used) assert.ok(keys.has(k), k);
});

test("no prefix wrapper: nothing builds a PENTARYN_PROMPTS key from a template", () => {
  const hits = sourceScan(ROOT, /`PENTARYN_PROMPTS\.\$\{|const t = \(key/);
  assert.deepEqual(hits.map(h => `${h.file}:${h.line}`), []);
});

test("the orphan toast (through the entry's sink) reads as before; a long text is cut at 120", async t => {
  const F = await installWorld();
  await captureConsole(() => import("../prompts.mjs"));
  const T = await import("../typeahead-adapter.mjs");
  const type = text => {
    for (const k of text) {
      for (const l of F.dom.window.listeners.keydown ?? []) {
        l.fn({ key: k, code: `Key${k}`, metaKey: false, ctrlKey: false, shiftKey: false, isComposing: false,
          preventDefault() {}, stopImmediatePropagation() {} });
      }
    }
  };
  const toasts = () => F.calls.filter(c => c.op === "notify" && c.level === "warn").map(c => c.message);
  t.mock.timers.enable({ apis: ["setTimeout"] });
  T.start();
  type("hello world");
  t.mock.timers.tick(3500);
  assert.deepEqual(toasts(), ['Typed before a prompt box opened and not used: "hello world"']);
  T.start();
  type("x".repeat(200));
  t.mock.timers.tick(3500);
  assert.equal(toasts().at(-1), `Typed before a prompt box opened and not used: "${"x".repeat(120)}"`);
});

test("C51: every SETTINGS and keybinding row carries literal name/hint keys present in lang/en.json", async () => {
  const { SETTINGS, keybindingRows } = await import("../settings.mjs");
  const labelled = [...SETTINGS.filter(r => !r.store), ...keybindingRows({ place: () => true, edit: () => true })];
  assert.equal(labelled.length, 12);
  for (const row of labelled) {
    for (const k of [row.name, row.hint]) assert.ok(keys.has(k), `${row.key}: ${k}`);
    for (const v of Object.values(row.choices ?? {})) if (v.startsWith("PENTARYN_PROMPTS.")) assert.ok(keys.has(v), v);
  }
});
