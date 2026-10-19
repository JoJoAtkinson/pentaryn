// Fix — a D&D Beyond PC after a ddb-importer transfer (feedback tiDvFa, Marwen Ashcroft).
//
// SUPERSEDED BY THE MODULE (pentaryn-importer 1.2.0, DDB corrections): rules `apparel-as-equipment` and `freecast-innate` now do this
// by itself after every ddb-importer sync, for every D&D Beyond character. Use the API instead:
//   await game.pentaryn.importer.ddbCorrections.plan("<actor>")    // dry run
//   await game.pentaryn.importer.ddbCorrections.apply("<actor>")   // write
// This script stays as the fallback while the module is not live (still dry-run by default).
// Its container report (3. below, read-only) is not in the module: run the script for that.
// Context: context/foundry/importer.md, "Player characters from D&D Beyond".
//
// Body of an async function for the foundry `eval-js` MCP tool (paste the file as `script`). GM only.
// DRY RUN by default: it returns the plan and writes nothing. Set APPLY = true to write.
// Idempotent: a second run (dry or not) finds nothing left to change.
//
// The PCs in the pentaryn world (Bazgar, Marwen, Sabriel) come from D&D Beyond through the
// third-party ddb-importer module (flags.ddbimporter, v7.5.8), not pentaryn-importer (NPCs only)
// or build_actors.py. That code is not ours, so the clean-up is this script, run after each DDB
// (re)import of a PC. What it changes, and why:
//
//   1. Apparel and notebooks the importer typed `consumable` (subtype trinket). D&D Beyond files
//      custom "Adventuring Gear" without a category, and ddb-importer falls back to a consumable
//      trinket — so Witch Robes and Field Notes sat under Consumables with a "use" button.
//      Robes/clothes/cloaks become `equipment` (clothing); notes/journals become `equipment`
//      (trinket). Quantity, weight, price, description, container and equipped state are kept,
//      and so is the item id.
//   2. Free-cast spells (a feat's "once per long rest without a slot": Shadow Touched, Magic
//      Initiate) that ddb-importer files with spellcasting method `atwill` plus 1 use per long
//      rest. dnd5e 6 groups by method, so they showed under "At-Will". They become method
//      `innate` ("Innate Spellcasting", shown with their 1/day uses); the uses are kept. An
//      at-will spell with no uses is left alone (a feat-granted one is listed in atwillFromFeat
//      for a look by hand).
//   3. Container contents are only reported. Nothing was lost in the transfer: the backpack and
//      component pouch items (scrolls included) are on the actor with system.container set, and
//      dnd5e 6 shows them inside the container — open the Backpack / Component Pouch row.

const ACTOR = "46AKGxU7z39hOZ7b";   // id or exact name; Marwen Ashcroft in pentaryn
const APPLY = false;                // false = dry run

const APPAREL = /\b(robes?|clothes|clothing|garb|attire|vestments?|cloak|tunic|gown|dress)\b/i;
const NOTES = /\b(notes|journal|diary|notebook|logbook)\b/i;
// System fields carried across a consumable → equipment change (both models define them).
const KEEP = ["description", "source", "identified", "unidentified", "container", "quantity", "weight",
  "price", "rarity", "equipped", "attuned"];

const clone = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const actor = game.actors.get(ACTOR) ?? game.actors.getName?.(ACTOR)
  ?? game.actors.find?.(a => a.name === ACTOR) ?? null;
if (!actor) return JSON.stringify({ error: `no actor ${ACTOR}` });

const out = { actor: { id: actor.id, name: actor.name, ddb: !!actor.flags?.ddbimporter }, apply: APPLY,
  retype: [], innate: [], atwillFromFeat: [], containers: [], applied: [], errors: [] };

// 1. apparel / notes typed as consumables
for (const it of actor.items) {
  if (it.type !== "consumable") continue;
  const sub = it.system?.type?.value ?? "";
  if (sub && sub !== "trinket") continue;            // a real potion, scroll, food… stays
  const kind = APPAREL.test(it.name) ? "clothing" : NOTES.test(it.name) ? "trinket" : null;
  if (!kind) continue;
  const system = { type: { value: kind, baseItem: "" } };
  for (const k of KEEP) if (it.system?.[k] !== undefined) system[k] = clone(it.system[k]);
  out.retype.push({ id: it.id, name: it.name, from: `consumable/${sub || "-"}`, to: `equipment/${kind}`, system });
}

// 2. 1/day free casts filed as at-will
for (const it of actor.items) {
  if (it.type !== "spell" || it.system?.method !== "atwill") continue;
  const u = it.system?.uses ?? {};
  const max = u.max === "" || u.max == null ? null : u.max;
  if (max == null) {                                 // no uses: a genuine at-will spell, or a feat
    if (/^feat:/.test(it.system?.sourceItem ?? "")) out.atwillFromFeat.push(it.name);   // to check by hand
    continue;
  }
  const rec = (u.recovery ?? []).map(r => r.period).join(",") || "?";
  out.innate.push({ id: it.id, name: it.name, level: it.system?.level, uses: `${max}/${rec}`,
    update: { _id: it.id, "system.method": "innate" } });
}

// 3. containers: report what is inside each
for (const c of actor.items.filter(i => i.type === "container")) {
  const inside = actor.items.filter(i => i.system?.container === c.id);
  out.containers.push({ id: c.id, name: c.name, count: inside.length,
    scrolls: inside.filter(i => i.system?.type?.value === "scroll").map(i => i.name) });
}

if (APPLY) {
  for (const r of out.retype) {
    const it = actor.items.get(r.id);
    try {
      // Changing a Document's type needs the whole system replaced (`==system`).
      await it.update({ type: "equipment", "==system": r.system });
      out.applied.push(`retype ${r.name}`);
    } catch (e) {
      // Fallback: recreate under the same id (delete first so keepId is free).
      // If the create is refused, the original is put back as it was.
      const original = it.toObject();
      const data = { ...clone(original), type: "equipment", system: r.system };
      let deleted = false;
      try {
        await actor.deleteEmbeddedDocuments("Item", [r.id]);
        deleted = true;
        await actor.createEmbeddedDocuments("Item", [data], { keepId: true });
        out.applied.push(`recreate ${r.name}`);
      } catch (e2) {
        let restored = "";
        if (deleted) {
          try { await actor.createEmbeddedDocuments("Item", [original], { keepId: true }); restored = " (original restored)"; }
          catch (e3) { restored = ` (NOT restored: ${e3?.message ?? e3})`; }
        }
        out.errors.push(`${r.name}: ${e?.message ?? e} / ${e2?.message ?? e2}${restored}`);
      }
    }
  }
  if (out.innate.length) {
    try {
      await actor.updateEmbeddedDocuments("Item", out.innate.map(s => s.update));
      out.applied.push(...out.innate.map(s => `innate ${s.name}`));
    } catch (e) { out.errors.push(`innate: ${e?.message ?? e}`); }
  }
}
for (const r of out.retype) delete r.system;
for (const s of out.innate) delete s.update;
return JSON.stringify(out);
