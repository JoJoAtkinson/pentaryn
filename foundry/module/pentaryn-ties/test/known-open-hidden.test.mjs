/**
 * ties-ui-E2 (declared): key 5 / `known.open` on a tucked-away (hidden) Known entry used to show
 * nothing — the row was filtered out of the paint, so there was nothing to expand or focus.
 *
 * Ruling: opening a hidden entry un-hides exactly that entry (a real `hidden: false` write, no
 * transient "show hidden" state), then repaints the Known section in place so a sheet that was
 * already open shows it too. Other tucked entries stay tucked. Standalone world, no golden rows.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { bootWorld } from "./fixtures/world.mjs";
import { el } from "./fixtures/dom.mjs";

globalThis.CSS ??= { escape: s => String(s) };

const PC = "zzE2Pc0000000001";
const NPC = "zzE2Npc000000001";
const OTHER = "zzE2Npc000000002";

const hiddenEntry = (id, name, when) => ({ id, name, category: "sentient", notes: "", when, hidden: true });

const F = await bootWorld({
  actors: [
    {
      id: PC,
      name: "ZZ E2 PC",
      type: "character",
      system: { details: { type: { value: "humanoid" } }, traits: { size: "med" } },
      flags: {
        "pentaryn-ties": {
          known: [hiddenEntry(NPC, "ZZ Tucked", 1_700_000_000_000), hiddenEntry(OTHER, "ZZ Also Tucked", 1_700_000_000_001)]
        }
      }
    },
    { id: NPC, name: "ZZ Tucked", system: { details: { type: { value: "humanoid" } } } },
    { id: OTHER, name: "ZZ Also Tucked", system: { details: { type: { value: "humanoid" } } } }
  ]
});
const Known = await import("../known-ui.mjs");

/**
 * A sheet that is ALREADY open on the Known tab: painted once the way the injector paints
 * (markup, then bindKnown), and whose later render() repaints nothing — the injector's "both
 * already live and wired" guard skipping, which is the case the fix must cover.
 */
function alreadyOpenSheet(actor) {
  const root = el("div");
  const paint = () => {
    const section = root.querySelector(`[data-tab="${Known.KNOWN_TAB_ID}"].tab`);
    section.innerHTML = Known.buildKnownHTML(actor);
    Known.bindKnown(section.firstElementChild, actor, paint);
  };
  root.innerHTML = `<nav class="tabs"><a data-tab="${Known.KNOWN_TAB_ID}"></a></nav><section class="tab active" data-tab="${Known.KNOWN_TAB_ID}"></section>`;
  paint();
  return { tabGroups: { primary: Known.KNOWN_TAB_ID }, element: root, rendered: true, async render() { return this; } };
}

test("ties-ui-E2: opening a hidden Known entry un-hides exactly that entry and shows it open on an already-open sheet", async () => {
  const pc = game.actors.get(PC);
  pc.sheet = alreadyOpenSheet(pc);
  const section = () => pc.sheet.element.querySelector(`[data-tab="${Known.KNOWN_TAB_ID}"].tab`);
  assert.equal(section().querySelector(`.pt-row[data-id="${NPC}"]`), null, "precondition: the tucked entry is not painted");
  const mark = F.calls.length;

  assert.equal(await Known.openKnownEntry(pc, NPC), true);

  assert.ok(section().querySelector(`.pt-row[data-id="${NPC}"].pt-open`), "the entry's row is painted and open");
  assert.equal(section().querySelector(`.pt-row[data-id="${OTHER}"]`), null, "the other tucked entry stays out of the list");
  const stored = Object.fromEntries(game.actors.get(PC).getFlag("pentaryn-ties", "known").map(e => [e.id, e.hidden]));
  assert.equal(stored[NPC], false, "the opened entry is un-hidden in the data");
  assert.equal(stored[OTHER], true, "the other entry stays hidden in the data");
  assert.equal(Known._sizes().shownHidden, 0, "no transient per-actor 'show hidden' state");
  assert.equal(F.calls.slice(mark).filter(c => c.op === "update").length, 1, "the un-hide is one real write");
});

test("ties-ui-E2: opening a visible entry writes nothing", async () => {
  const pc = game.actors.get(PC);
  pc.sheet = alreadyOpenSheet(pc);
  const mark = F.calls.length;
  assert.equal(await Known.openKnownEntry(pc, NPC), true); // un-hidden by the test above
  assert.deepEqual(F.calls.slice(mark).filter(c => c.op === "update"), [], "no document write");
});
