/**
 * Final code review (ties-ui-M7): the Ties tab's editing pass bound every
 * `.pt-row:not([data-inbound])` under the sheet root — which includes the authoring section's lore
 * rows (`li.pt-row.pt-lore-row`, lore-ui.mjs). Their `[data-field]` inputs (label, skill, dc, hold,
 * text, miss) then also carried a tie `change` handler calling editTie with a lore row's id.
 * Ruling: narrow the selector to `.pt-row:not([data-inbound]):not(.pt-lore-row)` so lore rows get
 * no tie change handler; the lore editor's own binding is unchanged.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = f => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

test("ties-ui-M7: the tie editing pass skips lore-editor rows", () => {
  const editor = src("editor.mjs");
  assert.ok(
    editor.includes(`root.querySelectorAll(".pt-row:not([data-inbound]):not(.pt-lore-row)")`),
    "editor.mjs binds tie change handlers on .pt-row:not([data-inbound]):not(.pt-lore-row)"
  );
  assert.ok(
    !/querySelectorAll\("\.pt-row:not\(\[data-inbound\]\)"\)/.test(editor),
    "editor.mjs still binds the unnarrowed .pt-row:not([data-inbound]) selector"
  );
});

test("ties-ui-M7: lore rows still carry the pt-lore-row class the selector excludes", () => {
  assert.ok(/class="pt-row pt-lore-row/.test(src("lore-ui.mjs")), "lore-ui.mjs marks rows pt-lore-row");
});
