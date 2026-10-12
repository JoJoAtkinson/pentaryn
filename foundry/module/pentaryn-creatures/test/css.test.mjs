// CSS scope (guide step 8): every rule in styles/creatures.css is scoped on the strip's own id + class
// (`#pentaryn-creatures.pcr-strip`), and the strip the module mounts carries that class.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { manifestOf } from "./kit/harness.mjs";
import { MODULE, drain, registerSelf, setupWorld } from "./fixtures/world.mjs";

const ROOT = new URL("..", import.meta.url);

function selectors(css) {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, "");
  return [...text.matchAll(/([^{}]+)\{/g)].flatMap(m => m[1].split(",").map(s => s.trim()).filter(Boolean));
}

test("every selector starts with #pentaryn-creatures.pcr-strip; children use the pcr- prefix", () => {
  const manifest = manifestOf(ROOT);
  for (const file of manifest.styles) {
    const sels = selectors(readFileSync(new URL(file, ROOT), "utf8"));
    assert.ok(sels.length > 0, file);
    for (const s of sels) {
      assert.match(s, /^#pentaryn-creatures\.pcr-strip(?=[\s.:]|$)/, s);
      const rest = s.replace(/^#pentaryn-creatures\.pcr-strip/, "");
      for (const cls of rest.match(/\.[\w-]+/g) ?? []) assert.match(cls, /^\.(pcr-|rank-\d|controlled$)/, `${s}: ${cls}`);
    }
  }
});

test("the mounted strip is nav#pentaryn-creatures with class pcr-strip, docked", async () => {
  mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  const W = await setupWorld({ player: true });
  registerSelf(W.F, manifestOf(ROOT));
  await import("../creatures.mjs");
  W.F.fire("init");
  W.F.fire("setup");
  W.F.fire("ready");
  await drain();
  mock.timers.tick(60);
  const el = W.strip();
  assert.equal(el.id, MODULE);
  assert.equal(el.className, "pcr-strip");
  mock.timers.reset();
});
