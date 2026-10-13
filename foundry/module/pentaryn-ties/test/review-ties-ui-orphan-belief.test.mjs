/**
 * Final code review (ties-ui-rob-4): a belief row whose character was deleted could not be cleared.
 * The authoring section resolved the row's character with game.actors.get and handed undefined to
 * reset(), which refused it — Reset confirmed, then did nothing; Deliver warned with '?'.
 * Ruling: reset works by ledger id — reset(characterOrId, subject, ...) accepts the row's id, clears
 * the belief row, and skips the studied-flag update and the name in the toast when the actor is
 * gone. Orphan rows render with a '(deleted)' tag, no Deliver button, Reset still shown.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { bootWorld, settle } from "./fixtures/world.mjs";
import { el } from "./fixtures/dom.mjs";

const NPC = "zzOrphNpc0000001";
const PC = "zzOrphPc00000001";
const GONE = "zzOrphGone000001";
const LORE = [{ id: "l1", label: "Debts", dc: 12, skill: "ins", text: "<p>He owes the guild.</p>", miss: "" }];
const row = (extra = {}) => ({ text: "<p>He owes the guild.</p>", total: 15, pass: true, when: 1, ...extra });

const F = await bootWorld({
  actors: [
    { id: PC, name: "ZZ Orphan Still Here", type: "character" },
    {
      id: NPC,
      name: "ZZ Orphan Brakka",
      flags: {
        "pentaryn-ties": {
          lore: LORE,
          beliefs: {
            [GONE]: { [`lore:${NPC}:l1`]: row() },
            [PC]: { [`lore:${NPC}:l1`]: row({ delivered: 2 }) },
          },
        },
      },
    },
  ],
});
const AUI = await import("../authoring-ui.mjs");
const Study = await import("../study.mjs");
const npc = game.actors.get(NPC);

const mount = () => {
  const section = el("section");
  section.innerHTML = AUI.authoringHTML(npc);
  AUI.bindAuthoring(section, npc, () => {});
  return section;
};
const rowOf = (root, id) => root.querySelectorAll(".pt-belief").find(li => li.dataset.character === id);
const ledgerIds = () => Object.keys(npc.getFlag("pentaryn-ties", "beliefs") ?? {});

test("ties-ui-rob-4: an orphan belief row is tagged '(deleted)', has no Deliver, and keeps Reset", () => {
  const root = mount();
  const orphan = rowOf(root, GONE);
  assert.ok(orphan, "the deleted character's row is listed");
  assert.ok(orphan.querySelector(".pt-belief-orphan"), "the row carries the deleted tag");
  assert.equal(orphan.querySelectorAll("button").filter(b => b.dataset.action === "belief-deliver").length, 0, "no Deliver for nobody");
  const reset = orphan.querySelectorAll("button").find(b => b.dataset.action === "belief-reset");
  assert.ok(reset?.listeners.click?.length, "Reset is shown and bound");
  const live = rowOf(root, PC);
  assert.equal(live.querySelector(".pt-belief-orphan"), null, "a live character's row is not tagged");
});

test("ties-ui-rob-4: Reset on an orphan row clears the ledger row by id and the toast names nobody", async () => {
  const root = mount();
  const reset = rowOf(root, GONE).querySelectorAll("button").find(b => b.dataset.action === "belief-reset");
  F.dialogs.push(true);
  const mark = F.calls.length;
  await settle(reset.dispatch("click"));
  assert.ok(!ledgerIds().includes(GONE), `the orphan row is gone from the ledger: ${ledgerIds()}`);
  assert.ok(ledgerIds().includes(PC), "the live character's row is untouched");
  const toast = F.calls.slice(mark).find(c => c.op === "notify" && c.level === "info");
  assert.ok(toast, "a reset toast is shown");
  assert.ok(!toast.message.includes(GONE) && !toast.message.includes("?"), `the toast does not print an id or '?': ${toast.message}`);
});

test("ties-ui-rob-4: reset() accepts a character id; a live id still clears the studied flag", async () => {
  await npc.update({ [`flags.pentaryn-ties.beliefs.${GONE}`]: { [`lore:${NPC}:l1`]: row() } });
  assert.equal(await Study.reset(GONE, npc, "l1"), true, "a bare id of a deleted character resets");
  assert.ok(!ledgerIds().includes(GONE));
  const pc = game.actors.get(PC);
  const key = `lore:${NPC}:l1`;
  await pc.update({ "flags.pentaryn-ties.studied": { lore: { [key]: { when: 1 } } } });
  assert.ok(Study.studiedOf(pc).lore[key], "the live character is marked studied");
  assert.equal(await Study.reset(PC, npc, "l1"), true, "a bare id of a live character resets");
  assert.ok(!ledgerIds().includes(PC));
  assert.equal(Study.studiedOf(pc).lore[key], undefined, "and their studied flag is cleared");
  assert.equal(await Study.reset("", npc, "l1"), false, "an empty id is refused");
});
