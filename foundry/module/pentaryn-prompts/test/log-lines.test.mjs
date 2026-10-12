/**
 * prompts-lookup-18: the gather and replace console lines. The gather summary keeps today's text
 * exactly (it is also pinned through the glue in gather-glue.test); the phase split, the stored
 * manifest's size and the replace summary are debug lines, printed only with
 * CONFIG.debug["pentaryn-prompts"] on (DP9's class: console only).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { gatherLogLine, gatherPhaseLine, replaceLogLine } from "../core/log-lines.mjs";
import { installWorld, captureConsole, token, MODULE } from "./fixtures/world.mjs";

test("gatherLogLine: behind the module prefix, today's text byte for byte", () => {
  assert.equal(`pentaryn-prompts | ${gatherLogLine({ call: "pm-1", prompts: 3, scenes: 1, crops: 0, ms: 12 })}`,
    "pentaryn-prompts | gather pm-1: 3 prompts on 1 scene(s), 0 crop(s), 12 ms");
});

test("gatherPhaseLine: each phase rounded, the manifest size in bytes; a missing phase is 0", () => {
  assert.equal(gatherPhaseLine({ call: "pm-1", bytes: 2048, phases: { model: 5.4, embeds: 0.6, render: 4, store: 2.5, crops: 2 } }),
    "gather pm-1 phases: model 5 ms, embeds 1 ms, render 4 ms, store 3 ms, crops 2 ms; manifest 2048 B");
  assert.equal(gatherPhaseLine({ call: "pm-2", bytes: 10, phases: { model: 1 } }),
    "gather pm-2 phases: model 1 ms, embeds 0 ms, render 0 ms, store 0 ms, crops 0 ms; manifest 10 B");
});

test("replaceLogLine: real run with created documents; dry run without; no call id prints -", () => {
  assert.equal(replaceLogLine({ call: "pm-1", dryRun: false, ok: 2, failed: 1, created: 3, left: 4, ms: 40 }),
    "replace pm-1: 2 ok, 1 failed, 3 document(s) created, 4 prompt(s) left, 40 ms");
  assert.equal(replaceLogLine({ call: "pm-1", dryRun: true, ok: 2, failed: 1, created: 9, left: 4, ms: 9 }),
    "replace pm-1 dry run: 2 ok, 1 failed, 4 prompt(s) left, 9 ms");
  assert.equal(replaceLogLine({ call: null, dryRun: false, ok: 0, failed: 1, left: 0, ms: 1 }),
    "replace -: 0 ok, 1 failed, 0 document(s) created, 0 prompt(s) left, 1 ms");
});

/* ── through the glue ── */

const F = await installWorld();
await captureConsole(() => import("../prompts.mjs"));
F.fire("init");   // registers the settings gather's manifest ring is written to
const { gather } = await import("../gather.mjs");
const R = await import("../replace.mjs");

function marker(id, x, y, prompt) {
  const t = token({ id, name: "Prompt · mid", actorId: "markerActormid00", x, y, width: 1, height: 1, hidden: true,
    texture: { src: `modules/${MODULE}/assets/marker-mid.webp` }, flags: { [MODULE]: { marker: "mid", prompt } } }, F.s1);
  t.collection = F.s1.tokens;
  F.s1.tokens.set(id, t);
}

/** console.debug lines printed while `fn` runs (the rest of the console is silenced). */
async function debugLines(fn) {
  const saved = console.debug;
  const out = [];
  console.debug = (...a) => out.push(a.map(String).join(" "));
  try { await captureConsole(fn); } finally { console.debug = saved; }
  return out;
}

test("with CONFIG.debug off: no debug line from gather or replace", async () => {
  marker("lg1", 2400, 2400, "a crate");
  const out = await debugLines(async () => {
    await gather({ scenes: ["s1"], crops: "off" });
    await R.replaceMany({ replacements: [{ sceneId: "s1", markerId: "lg1", with: { kind: "none", reason: "r" } }], dryRun: true });
  });
  assert.deepEqual(out, []);
  F.s1.tokens.delete("lg1");
});

test("with CONFIG.debug on: gather's phase line; replace's dry-run and real-run summaries", async () => {
  F.CONFIG.debug ??= {};
  F.CONFIG.debug[MODULE] = true;
  try {
    marker("lg2", 2400, 2600, "a barrel");
    const spec = { replacements: [{ sceneId: "s1", markerId: "lg2", with: { kind: "light" } }, { sceneId: "s1", markerId: "nope", with: { kind: "none" } }] };
    const before = F.s1.tokens.contents.filter(t => t.flags?.[MODULE]?.prompt).length;
    const out = await debugLines(async () => {
      await gather({ scenes: ["s1"], crops: "off" });
      await R.replaceMany({ ...spec, dryRun: true });
      await R.replaceMany(spec);
    });
    const ms = s => s.replace(/\d+ ms/g, "<n> ms").replace(/manifest \d+ B/, "manifest <n> B").replace(/gather pm-\S+/, "gather <call>");
    assert.deepEqual(out.map(ms), [
      "pentaryn-prompts | gather <call> phases: model <n> ms, embeds <n> ms, render <n> ms, store <n> ms, crops <n> ms; manifest <n> B",
      `pentaryn-prompts | replace - dry run: 1 ok, 1 failed, ${before} prompt(s) left, <n> ms`,
      `pentaryn-prompts | replace -: 1 ok, 1 failed, 1 document(s) created, ${before - 1} prompt(s) left, <n> ms`
    ]);
    assert.ok(Number(/manifest (\d+) B/.exec(out[0])[1]) > 100);
  } finally {
    delete F.CONFIG.debug[MODULE];
  }
});
