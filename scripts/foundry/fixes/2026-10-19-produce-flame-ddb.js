// Fix — a D&D Beyond copy of Produce Flame (feedback DsekWh / JEssbJ, Marwen Ashcroft).
// Body of an async function for the foundry `eval-js` MCP tool (paste the file as `script`). GM only.
// DRY RUN by default: it returns the plan and writes nothing. Set APPLY = true to write.
// Idempotent: a second run (dry or not) finds nothing left to change.
//
// pentaryn-senses 0.6.0 lights the caster from either copy of Produce Flame: the PHB's ("Cast" +
// "Hurl Fire") and ddb-importer's ("Attack" + "Light Effect"). This script is optional tidying of
// the ddb-importer copy so both read the same at the table:
//
//   1. "Light Effect" (utility) → "Cast", and its ActiveEffect link is dropped. That effect
//      ("Produce Flame", token.light.* changes, transfer off) was only ever offered as an
//      "apply effect" button on the chat card; senses now lights the token itself, and applying
//      the effect as well would leave two writers on one token light.
//   2. "Attack" (attack) → "Hurl Fire", the PHB's name for it.
//   3. The item's ActiveEffects that only that utility activity applied, and that change nothing
//      but token.light.*, are deleted.
//
// Activation, range, damage and every id are left as they are. Every world actor is scanned
// (ACTOR = null) or one actor by id or exact name.

const ACTOR = null;     // null = every world actor; or an id / exact name ("46AKGxU7z39hOZ7b" = Marwen)
const APPLY = false;    // false = dry run

const slug = s => String(s ?? "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const isFlame = it => it?.type === "spell"
  && (slug(it.system?.identifier) === "produce-flame" || slug(it.name) === "produce-flame");
const activities = it => {
  const a = it.system?.activities;
  if (!a) return [];
  return typeof a.values === "function" ? [...a.values()] : Object.values(a);
};
const changesOf = e => e?.system?.changes ?? e?.changes ?? [];
const lightOnly = e => {
  const ch = changesOf(e);
  return ch.length > 0 && ch.every(c => String(c?.key ?? "").startsWith("token.light.") || String(c?.key ?? "").startsWith("ATL.light"));
};
const effectIds = act => (act.effects ?? []).map(e => e?._id ?? e?.id ?? e?.effect?.id).filter(Boolean);

let actors = [...game.actors];
if (ACTOR) {
  const one = game.actors.get(ACTOR) ?? game.actors.find(a => a.name === ACTOR) ?? null;
  if (!one) return JSON.stringify({ error: `no actor ${ACTOR}` });
  actors = [one];
}

const out = { apply: APPLY, items: [], applied: [], errors: [] };
for (const actor of actors) {
  for (const it of actor.items) {
    if (!isFlame(it)) continue;
    const update = {};
    const plan = { actor: actor.name, actorId: actor.id, item: it.id, rename: [], unlink: [], deleteEffects: [] };
    const linked = new Map();   // effect id → how many activities apply it
    for (const act of activities(it)) for (const id of effectIds(act)) linked.set(id, (linked.get(id) ?? 0) + 1);
    for (const act of activities(it)) {
      const id = act.id ?? act._id;
      if (act.type === "utility" && act.name === "Light Effect") {
        update[`system.activities.${id}.name`] = "Cast";
        plan.rename.push({ activity: id, from: act.name, to: "Cast" });
        const ids = effectIds(act);
        if (ids.length) {
          update[`system.activities.${id}.effects`] = [];
          plan.unlink.push({ activity: id, effects: ids });
          for (const eid of ids) {
            const eff = it.effects?.get?.(eid);
            if (eff && !eff.transfer && linked.get(eid) === 1 && lightOnly(eff)) plan.deleteEffects.push(eid);
          }
        }
      } else if (act.type === "attack" && act.name === "Attack") {
        update[`system.activities.${id}.name`] = "Hurl Fire";
        plan.rename.push({ activity: id, from: act.name, to: "Hurl Fire" });
      }
    }
    if (!plan.rename.length && !plan.unlink.length && !plan.deleteEffects.length) continue;
    out.items.push(plan);
    if (!APPLY) continue;
    try {
      if (Object.keys(update).length) await it.update(update);
      if (plan.deleteEffects.length) await it.deleteEmbeddedDocuments("ActiveEffect", plan.deleteEffects);
      out.applied.push({ actor: actor.name, item: it.id });
    } catch (err) {
      out.errors.push({ actor: actor.name, item: it.id, error: String(err?.message ?? err) });
    }
  }
}
return JSON.stringify(out);
