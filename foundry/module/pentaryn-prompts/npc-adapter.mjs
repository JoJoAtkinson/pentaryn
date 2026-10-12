/**
 * pentaryn-prompts — `with: {kind: "npc", npc, features, patch}` built in the module (plan §13).
 *
 * The same engines as the dnd5e-create-npc / dnd5e-add-feature MCP tools: this calls the bridge
 * module's own query handlers (`CONFIG.queries["foundry-mcp-bridge.createNpcActor"]`, `.add…ToActor`)
 * in this GM client, with the arguments npc-core.mjs checked and defaulted the way those tools did.
 * So an npc replacement now works through eval-js as well as the MCP tool, and the actor is this
 * module's to delete when its replacement fails later in the run.
 *
 * Differences from the tools, on purpose:
 *   - language words become dnd5e keys ("Common" → common); unknown ones go to languagesCustom;
 *   - a name another NPC already has is allowed (the bridge refuses duplicates by name, so the actor
 *     is created under a temporary name and renamed once its features are on);
 *   - recharge is applied by the patch after the features exist (same shape the tool wrote).
 */

import { codedError } from "./geometry-core.mjs";
import { checkNpcSpec } from "./npc-core.mjs";
import { flattenLanguages, languageKeys, nearestNames } from "./build-core.mjs";

const BRIDGE = "foundry-mcp-bridge";

function bridgeQuery(name) {
  const fn = globalThis.CONFIG?.queries?.[`${BRIDGE}.${name}`];
  if (typeof fn !== "function") {
    throw codedError("BAD_SPEC", `npc needs the ${BRIDGE} module active in this GM client (no ${name} handler); ` +
      "or build the actor first and replace with {kind: \"actor\", actorId}");
  }
  return fn;
}

/** dnd5e language keys for the npc's `languages` (labels accepted); unknown words → languagesCustom. */
function withLanguageKeys(npc, warnings) {
  if (!npc.languages?.length) return npc;
  const flat = flattenLanguages(globalThis.CONFIG?.DND5E?.languages ?? {});
  const { keys, unknown } = languageKeys(npc.languages, flat);
  if (unknown.length) warnings.push(`npc.languages: ${unknown.join(", ")} not a dnd5e language; kept as custom text`);
  const custom = [npc.languagesCustom, ...unknown].filter(Boolean).join("; ");
  return { ...npc, languages: keys, languagesCustom: custom };
}

/**
 * A `spells` feature's names against its packs, the way the bridge's addSpellsToActor looks them up
 * (index names, case-insensitive, first pack wins): → warnings for missing packs and names, so the
 * dry run says what the real run would skip.
 */
async function spellWarnings(f) {
  const out = [];
  const packs = f.args.compendiumPacks ?? ["dnd5e.spells"];
  const names = new Set();
  const all = [];
  let usable = 0;
  for (const id of packs) {
    const pack = game.packs?.get(id);
    if (!pack || pack.metadata?.type !== "Item") { out.push(`${f.label}: compendium pack "${id}" not found (or not Items) — skipped`); continue; }
    usable++;
    for (const e of await pack.getIndex()) if (e.name) { names.add(e.name.toLowerCase()); all.push(e.name); }
  }
  if (!usable) return [`${f.label}: no usable pack in ${packs.join(", ")} — no spell would be added`];
  const missing = (f.args.spellNames ?? []).filter(n => !names.has(String(n).toLowerCase()));
  for (const n of missing) {
    const near = nearestNames(n, all, 2);
    out.push(`${f.label}: "${n}" is not in ${packs.join(", ")}${near.length ? ` (nearest: ${near.join(", ")})` : ""} — the real run skips it`);
  }
  return out;
}

/**
 * Check an npc replacement for the dry run (and again before the real one). Throws BAD_SPEC with
 * every problem; → `{npc, features, recharge, warnings}`.
 */
export async function checkNpc(w) {
  const r = checkNpcSpec(w);
  if (!r.ok) throw codedError("BAD_SPEC", r.errors.join("; "));
  bridgeQuery("createNpcActor");
  for (const f of r.features) bridgeQuery(f.query);
  const warnings = [...r.warnings];
  for (const f of r.features) if (f.args.featureType === "spells") warnings.push(...await spellWarnings(f));
  return { npc: withLanguageKeys(r.npc, warnings), features: r.features, recharge: r.recharge, warnings };
}

/** Unwrap a bridge handler's answer: the GM check answers `{success: false, error}` rather than throwing. */
function answer(res, what) {
  if (!res || res.success === false || res.error) throw new Error(`${what}: ${res?.error ?? "no answer"}`);
  return res;
}

/**
 * Create the npc actor and add its features. `own(doc)` registers the actor with the run (deleted
 * again if the replacement fails later). → `{actor, warnings, notes}`; a feature that would not add
 * is a note, the actor stays.
 */
export async function createNpc(checked, own) {
  const { npc, features } = checked;
  const warnings = [...checked.warnings];
  const notes = [];
  const temp = `${npc.name} [pp-${foundry.utils.randomID(6)}]`;
  const made = answer(await bridgeQuery("createNpcActor")({ ...npc, name: temp }), `createNpcActor "${npc.name}"`);
  const actor = game.actors.get(made.actor?.id);
  if (!actor) throw new Error(`createNpcActor "${npc.name}" returned no actor`);
  own({ type: "Actor", id: actor.id, name: npc.name });
  // the bridge repeats the damage-type / condition warnings npc-core already gave in the dry run
  warnings.push(...(made.warnings ?? []).filter(w => !/^Unknown (damage type|condition) "/.test(String(w))));
  for (const f of features) {
    try {
      const res = answer(await bridgeQuery(f.query)({ ...f.args, actorIdentifier: actor.id }), f.label);
      for (const w of res.warnings ?? []) warnings.push(`${f.label}: ${w}`);
      if (f.args.featureType === "spells") {
        const miss = [...(res.notFound ?? []), ...(res.failed ?? []).map(x => `${x.name} (${x.error})`)];
        if (miss.length) notes.push(`spells not added: ${miss.join(", ")}`);
      }
    } catch (err) {
      notes.push(`feature "${f.label}" not added: ${err?.message ?? err}`);
    }
  }
  await actor.update({ name: npc.name, "prototypeToken.name": npc.name });
  return { actor, warnings, notes };
}
