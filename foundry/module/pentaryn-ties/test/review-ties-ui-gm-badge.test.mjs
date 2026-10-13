/**
 * Final code review (ties-ui-EXT-15): the "GM only" badge — `<span class="pt-gm-badge">` with the
 * eye-slash icon and the localized `PENTARYN_TIES.gmOnly` — was pasted four times (authoring-ui's
 * local `gmBadge`, editor's two mutual-pair panels, attributes-ui's told-count line).
 * Ruling [declared]: one `gmBadge()` exported from core/html.mjs, used in all four places; the markup
 * is byte-identical.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import "./fixtures/stubs.mjs";

const ROOT = new URL("..", import.meta.url);
const src = f => readFileSync(new URL(f, ROOT), "utf8");
const moduleFiles = () => [
  ...readdirSync(ROOT).filter(f => f.endsWith(".mjs")),
  ...readdirSync(new URL("core/", ROOT)).filter(f => f.endsWith(".mjs")).map(f => `core/${f}`),
  ...readdirSync(new URL("study/", ROOT)).filter(f => f.endsWith(".mjs")).map(f => `study/${f}`)
];

test("ties-ui-EXT-15: core/html.mjs exports gmBadge() with the exact markup the four copies wrote", async () => {
  const { gmBadge, esc } = await import("../core/html.mjs");
  assert.equal(typeof gmBadge, "function");
  assert.equal(
    gmBadge(),
    `<span class="pt-gm-badge"><i class="fa-solid fa-eye-slash" aria-hidden="true"></i> ${esc(_loc("PENTARYN_TIES.gmOnly"))}</span>`
  );
});

test("ties-ui-EXT-15: the badge markup is written once, in core/html.mjs", () => {
  const hits = moduleFiles().filter(f => src(f).includes(`class="pt-gm-badge"`));
  assert.deepEqual(hits, ["core/html.mjs"]);
  const local = moduleFiles().filter(f => f !== "core/html.mjs" && /const gmBadge\s*=/.test(src(f)));
  assert.deepEqual(local, []);
  for (const f of ["authoring-ui.mjs", "editor.mjs", "attributes-ui.mjs"]) {
    assert.match(src(f), /import\s*\{[^}]*\bgmBadge\b[^}]*\}\s*from\s*"\.\/core\/html\.mjs"/, `${f} imports gmBadge`);
  }
});
