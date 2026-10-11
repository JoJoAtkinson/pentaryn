/**
 * Pentaryn Attunement Slots
 * =========================
 *
 * dnd5e (5.x, and still 6.0.6) has the whole attunement data model — `system.attributes.attunement`
 * on the actor, `system.attunement` / `system.attuned` on the item, a live count,
 * and correct effect suppression — and then does almost nothing with it. The sheet
 * renders one small `☀ value / max` widget in the inventory filter row, and there
 * is no cap enforcement anywhere in the system:
 *
 *     // dnd5e 6.0.6 applications/actor/api/base-actor-sheet.mjs, _prepareItemPhysical
 *     ctx.attunement.disabled = !item.isOwner;   // ← the only gate there is
 *
 * So a character sits at 5/3 indefinitely and nothing says so. That is not
 * hypothetical: it is how this module got written.
 *
 * Two problems, two halves of this file.
 *
 * ── The display ───────────────────────────────────────────────────────────────
 *
 * Attunement is rendered as slots in the **sidebar**, between the character card
 * and the favourites list, rather than as a panel on the inventory tab. The
 * reason is adjacency: the stats attunement changes — AC above all — are drawn on
 * that same card, a couple of inches up. Unattune a Cloak of Protection and you
 * watch the icon leave its slot *and* the AC badge tick 15 → 14 in one glance.
 * A panel on the inventory tab can never show the second half of that, and the
 * second half is the whole reason anyone doubts whether the first half worked.
 *
 * It also means attunement state is visible from every tab, not just inventory.
 *
 * Cost of the choice: collapsing the sidebar hides it. That is accepted — the
 * same gesture already hides AC, hit points, hit dice and death saves, and the
 * system's own counter stays in the inventory row as the fallback. This module
 * decorates that counter with an over-cap state so the fallback is not silent.
 *
 * ── Slots are a fiction, so they have to be stored ────────────────────────────
 *
 * There is no slot concept in the data model. `system.attuned` is a boolean per
 * item; nothing orders them. Favourites get away with drag-to-reorder because
 * `ActorFavorites5e` has a real `sort` field. Attunement has no equivalent.
 *
 * Rendering in name order would mean that replacing one item reshuffles its
 * neighbours — the Luckstone hops from slot 2 to slot 1 because the alphabet
 * changed. On a surface whose entire job is answering "did that just change?",
 * icons that move on their own are actively harmful.
 *
 * So slot order is persisted on the actor as an array of item ids:
 *
 *     flags["pentaryn-attunement"].slots = ["abc123", null, "def456"]
 *
 * The flag is a *hint*, never the truth. `computeSlots()` reconciles it against
 * `system.attuned` on every render: entries whose item is gone or no longer
 * attuned become holes, and attuned items missing from the array are dropped into
 * the first hole. Corrupt or absent flag data therefore costs nothing — worst
 * case you get the same order you would have had without it. Nothing is written
 * during render; the flag is only ever updated by a deliberate drop.
 *
 * ── Enforcement: warn on every path, veto on none ─────────────────────────────
 *
 * `preUpdateItem` covers every writer of `system.attuned` — the sheet's sun
 * toggle, the context menu, this module's own drops, macros, and the MCP bridge —
 * because all of them land in the same document update. `preCreateItem` catches
 * the other door: an item arriving *already* attuned via item-piles, an import,
 * or a compendium drop (the system only strips `attuned` on sheet drops, in
 * `_onDropResetData`).
 *
 * Neither hook ever returns `false`. A vetoed update resolves without applying
 * and without throwing, so a macro or an MCP call would carry on believing it
 * succeeded — and this world is scripted through an MCP bridge. Silent divergence
 * between what a script thinks it did and what the database holds is a far worse
 * failure than an over-attuned bard.
 *
 * The cap is unenforceable in principle anyway: delete the feature or expire the
 * effect that raised `attunement.max` and the actor is over cap having fired no
 * item hook at all. Which is exactly why the *display* has to render the over-cap
 * state correctly rather than relying on having caught every write.
 *
 * Console access: `game.pentaryn.attunement.report(actor)`.
 *
 * ENTRY (esmodules[0]): wiring only. Files, in load order:
 *   attunement-core.mjs   PURE constants, slot reconciliation, stash plan, bond decision, strings
 *   actor-adapter.mjs     document writes, Item Piles, the two dnd5e adjustments
 *   strip.mjs             UI: the sidebar strip and the counter's over-cap state
 *   sheet.mjs             FEATURE: renderBaseActorSheet, the strip's listeners
 *   bonds.mjs             FEATURE: preUpdateItem, preCreateItem, createItem
 *   api-manifest.mjs      PURE API rows (describe() reads them)
 *   api.mjs               report, inspect, selftest; buildApiFor (the kit-built API)
 *   lib/*.mjs             vendored kit — never edited here (scripts/foundry/blueprint/vendor.py)
 *
 * The features install synchronously in this body, after init and ready are registered: the
 * registration order (golden/hooks.json) is what other modules' listeners were written against.
 */

import { MODULE, NS } from "./attunement-core.mjs";
import { applyProficiencies, guardItemTooltipPosition, unguardItemTooltipPosition } from "./actor-adapter.mjs";
import { buildApiFor } from "./api.mjs";
import { makeLog } from "./lib/log.mjs";
import { hookRegistry } from "./lib/hooks.mjs";
import { publishNamespace } from "./lib/publish.mjs";
import * as sheet from "./sheet.mjs";
import * as bonds from "./bonds.mjs";

/** Features in load order. */
const FEATURES = [sheet, bonds];

const log = makeLog(MODULE);
const reg = hookRegistry(MODULE, log);

const ctx = { log, reg, api: null, uninstall };

function install() {
  for (const feature of FEATURES) feature.install(reg, ctx);
}

/** Remove every hook, feature state and the tooltip guard (then reload, or re-import the entry). */
function uninstall() {
  for (const feature of [...FEATURES].reverse()) feature.uninstall();
  reg.offAll();
  unguardItemTooltipPosition();
}

function onInit() {
  applyProficiencies();
}

/**
 * The tooltip guard first (a throw there must not stop the publish, items-journal-39), then the
 * API: built first so a manifest drift stops here with one clear line, then published at ready —
 * module.api, game.pentaryn.attunement, and the pentaryn-attunement.ready / pentaryn.ready hooks.
 */
function onReady() {
  try {
    guardItemTooltipPosition();
  } catch (err) {
    log.warn("tooltip guard skipped", err);
  }
  try {
    ctx.api = buildApiFor(ctx);
  } catch (err) {
    log.error("API manifest drift — not published", err);
    return;
  }
  publishNamespace(NS, ctx.api, { moduleId: MODULE });
  console.log(`${MODULE} | ready`);
}

Hooks.once("init", onInit);
Hooks.once("ready", onReady);
install();
