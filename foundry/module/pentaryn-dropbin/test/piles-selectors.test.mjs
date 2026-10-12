// dropbin-EXT-3 [declared]: the Item Piles loot-window DOM selectors (the footer, the Close Lid / Leave
// icons, the native Take All icon) lived as literals in loot.mjs, outside the piles.mjs adapter. They
// are one frozen SELECTORS table exported by piles.mjs, and no other source file spells them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sourceScan } from "./kit/harness.mjs";
import * as piles from "../piles.mjs";

const ROOT = new URL("..", import.meta.url);

test("dropbin-EXT-3: piles.mjs exports a frozen SELECTORS table for the Item Piles loot window", () => {
  const { SELECTORS } = piles;
  assert.ok(SELECTORS && typeof SELECTORS === "object", "piles.mjs exports SELECTORS");
  assert.ok(Object.isFrozen(SELECTORS));
  assert.deepEqual(SELECTORS, {
    footer: "footer.sheet-footer",
    footerButton: ":scope > button",
    exitIcon: "i.fa-box, i.fa-sign-out-alt",
    nativeTakeAllIcon: "i.fa-fist-raised",
  });
});

test("dropbin-EXT-3: no file but piles.mjs spells an Item Piles loot-window selector", () => {
  const hits = sourceScan(ROOT, /sheet-footer|fa-fist-raised|fa-box\b|fa-sign-out-alt/)
    .filter(h => h.file !== "piles.mjs" && !h.file.startsWith("test/"));
  assert.deepEqual(hits, []);
});
