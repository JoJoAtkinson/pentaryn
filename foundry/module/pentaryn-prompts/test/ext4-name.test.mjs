/**
 * prompts-core-EXT-4 [declared]: the readback after a replace and a later MARKER_GONE name the
 * document built from a marker the same way — its name, then its text, then its journal entry's
 * name, then "Light" for an AmbientLight. A note pin with an empty label used to read `Note ""` in
 * the readback but `Note "<entry>"` in MARKER_GONE.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installWorld, captureConsole, token, MODULE } from "./fixtures/world.mjs";
import { SIZE_BY_KEY } from "../geometry-core.mjs";

const F = await installWorld();
await captureConsole(() => import("../prompts.mjs"));
F.fire("init");
const R = await import("../replace.mjs");
const { gather } = await import("../gather.mjs");

function marker(id, size, x, y, text) {
  const w = SIZE_BY_KEY[size].w;
  const t = token({ id, name: `Prompt · ${size}`, actorId: "markerActortiny0", x, y, width: w, height: w, hidden: true,
    texture: { src: `modules/${MODULE}/assets/marker-${size}.webp` }, flags: { [MODULE]: { marker: size, prompt: text } } }, F.s1);
  t.collection = F.s1.tokens;
  F.s1.tokens.set(id, t);
  return t;
}
const quiet = fn => captureConsole(fn).then(r => r.value);

test("replace (prompts-core-EXT-4): an empty-label note pin reads the same in the readback and in MARKER_GONE", async () => {
  // Foundry's NoteDocument#entry resolves entryId; the stub note has no such getter
  const hook = F.Hooks.on("createNote", doc => { doc.entry = F.game.journal.get(doc.entryId) ?? null; });
  marker("x4n", "tiny", 1900, 700, "a scrawled note");
  const { value: g } = await captureConsole(() => gather({ scenes: ["s1"], crops: "off" }));
  const pid = Object.entries(g.manifest.prompts).find(([, e]) => e.markerId === "x4n")[0];
  const built = await quiet(() => R.replaceMany({ call: g.call, replacements: [
    { id: pid, name: "", with: { kind: "note", name: "Scrawl", html: "<p>…</p>" } }] }));
  assert.equal(built.results[0].ok, true);
  const readback = built.text.split("\n").find(l => l.includes("→ Note"));
  assert.match(readback, /→ Note "Scrawl" \[\d{16}\]/);
  const gone = await quiet(() => R.replaceMany({ call: g.call, replacements: [{ id: pid, with: { kind: "none" } }], dryRun: true }));
  assert.match(gone.results[0].error, /now Note "Scrawl" \[\d{16}\]/);
  F.Hooks.off("createNote", hook);
});
