#!/usr/bin/env node
/**
 * Fixtures for light-core.mjs — run by test/run.mjs (or `node test/light.mjs` alone). No Foundry.
 * The import itself is a check: light-core.mjs must load with `game`, `canvas` and `foundry` undefined.
 */

const core = await import("../light-core.mjs");
const {
  MODULE, DARK, SPELL_LIGHT, LIGHT_PROFILES, slug, profileKey, profileFor, lightFor, strongest,
  carriedLightOf, isLit, isHooded, isLightSpellData, isLightToggle, readSpellCast, castFlag,
  readSpellLight, planSpellLight, spellLightUpdate, restoredLight, sourcesUnder,
  isPHBLightActorSource, torchActivityData, TORCH_ACTIVITY_ID
} = core;

let pass = 0;
const failures = [];
function check(name, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; return; }
  failures.push(`  ${name}\n    expected ${w}\n    got      ${g}`);
}
const flags = f => ({ [MODULE]: f });
const item = (name, { identifier, type = "consumable", f, quantity, activities } = {}) =>
  ({ name, type, system: { identifier, quantity, activities }, flags: f ? flags(f) : {} });

/* ── slug / profileKey / profileFor ─────────────────────────────────────── */
check("slug PHB name", slug("Lantern, Hooded"), "lantern-hooded");
check("slug junk", slug(null), "");
check("torch by identifier", profileKey(item("Fancy stick", { identifier: "torch" })), "torch");
check("torch by name", profileKey(item("Torch")), "torch");
check("hooded lantern by name", profileKey(item("Lantern, Hooded")), "lantern-hooded");
check("alias: Hooded Lantern", profileKey(item("Hooded Lantern")), "lantern-hooded");
check("bullseye by identifier", profileKey(item("x", { identifier: "lantern-bullseye" })), "lantern-bullseye");
check("not a light", profileKey(item("Rope, Hempen", { identifier: "rope" })), null);
check("identifier wins over name", profileKey(item("Torch", { identifier: "candle" })), "candle");
check("profile: torch 20/40", [profileFor(item("Torch")).bright, profileFor(item("Torch")).dim], [20, 40]);
check("profile: candle 5/10", [profileFor(item("Candle")).bright, profileFor(item("Candle")).dim], [5, 10]);
check("profile: lamp 15/45", [profileFor(item("Lamp")).bright, profileFor(item("Lamp")).dim], [15, 45]);
check("profile: hooded 30/60", [LIGHT_PROFILES["lantern-hooded"].bright, LIGHT_PROFILES["lantern-hooded"].dim], [30, 60]);
check("profile: bullseye 60/120 all round", [LIGHT_PROFILES["lantern-bullseye"].dim, LIGHT_PROFILES["lantern-bullseye"].angle], [120, 360]);
const magic = item("Lantern of Revealing", { f: { lightItem: { bright: 30, dim: 60, color: "#88f" } } });
check("override flag wins", profileFor(magic).color, "#88f");
check("override without radii ignored → table/null", profileFor(item("Odd", { f: { lightItem: { color: "#f00" } } })), null);
check("a spell named Torch is not a torch", profileFor(item("Torch", { type: "spell" })), null);
check("null item → null", profileFor(null), null);
const throwing = { get flags() { throw new Error("boom"); }, name: "Torch", system: {} };
check("throwing flags getter → still a torch", profileFor(throwing).dim, 40);

/* ── lightFor / strongest ───────────────────────────────────────────────── */
const hooded = LIGHT_PROFILES["lantern-hooded"];
check("lightFor open", [lightFor(hooded).bright, lightFor(hooded).dim], [30, 60]);
check("lightFor hooded", [lightFor(hooded, { hooded: true }).bright, lightFor(hooded, { hooded: true }).dim], [0, 5]);
check("lightFor drops the hooded sub-profile", "hooded" in lightFor(hooded), false);
check("lightFor hooded on a torch is a no-op", lightFor(LIGHT_PROFILES.torch, { hooded: true }).dim, 40);
const l1 = lightFor(LIGHT_PROFILES.torch);
l1.dim = 999;
check("lightFor returns a fresh copy", LIGHT_PROFILES.torch.dim, 40);
check("lightFor junk → null", lightFor(null), null);
check("strongest by dim", strongest([{ bright: 5, dim: 10 }, { bright: 20, dim: 40 }, { bright: 15, dim: 30 }]), { bright: 20, dim: 40 });
check("strongest tie → bright", strongest([{ bright: 0, dim: 40 }, { bright: 20, dim: 40 }]), { bright: 20, dim: 40 });
check("strongest none → null", strongest([]), null);
check("strongest skips junk", strongest([null, "x", { bright: 1, dim: 2 }]), { bright: 1, dim: 2 });

/* ── carriedLightOf ─────────────────────────────────────────────────────── */
const shard = item("Shattered Amethyst Dragon Shard", { type: "loot", f: { light: { bright: 5, dim: 15, color: "#a0f" } } });
const torchOff = item("Torch", { identifier: "torch", quantity: 3 });
const torchOn = item("Torch", { identifier: "torch", quantity: 3, f: { lit: true } });
const lanternShut = item("Lantern, Hooded", { type: "equipment", identifier: "lantern-hooded", f: { lit: true, hooded: true } });
check("nothing carried → null", carriedLightOf([]), null);
check("shard alone (as before)", carriedLightOf([shard]), { bright: 5, dim: 15, color: "#a0f" });
check("unlit torch gives nothing", carriedLightOf([torchOff]), null);
check("lit torch → 20/40", [carriedLightOf([torchOn]).bright, carriedLightOf([torchOn]).dim], [20, 40]);
check("lit torch beats shard", carriedLightOf([shard, torchOn]).dim, 40);
check("hooded lantern 0/5 loses to shard", carriedLightOf([lanternShut, shard]).dim, 15);
check("quantity 0 torch gives nothing", carriedLightOf([item("Torch", { quantity: 0, f: { lit: true } })]), null);
check("a shard flag wins over `lit` on the same item", carriedLightOf([item("Torch", { f: { light: { bright: 1, dim: 2 }, lit: true } })]), { bright: 1, dim: 2 });
check("isLit / isHooded", [isLit(torchOn), isLit(torchOff), isHooded(lanternShut)], [true, false, true]);

/* ── isLightSpellData / isLightToggle ───────────────────────────────────── */
const summonMap = { EnaiVH67oUJzyHsF: { type: "summon", profiles: [{ uuid: "Compendium.dnd-players-handbook.actors.Actor.phbsplLight00000" }] } };
check("Light by identifier", isLightSpellData(item("Light", { type: "spell", identifier: "light" })), true);
check("Light by summon profile (object map)", isLightSpellData(item("Lumen", { type: "spell", activities: summonMap })), true);
check("Light by summon profile (Map / Collection)", isLightSpellData(item("Lumen", { type: "spell", activities: new Map(Object.entries(summonMap)) })), true);
check("Light item that isn't a spell", isLightSpellData(item("Light", { identifier: "light" })), false);
check("Dancing Lights isn't Light", isLightSpellData(item("Dancing Lights", { type: "spell", identifier: "dancing-lights" })), false);
check("null → false", isLightSpellData(null), false);
const lampItem = item("Lamp", { type: "equipment", identifier: "lamp" });
check("lamp utility → toggle", isLightToggle({ type: "utility" }, lampItem), true);
check("torch attack → not a toggle", isLightToggle({ type: "attack" }, torchOff), false);
check("flagged activity → toggle", isLightToggle({ type: "utility", flags: flags({ lightToggle: true }) }, item("Rope")), true);
check("utility on a non-light → no", isLightToggle({ type: "utility" }, item("Rope")), false);

/* ── readSpellCast / castFlag ───────────────────────────────────────────── */
const spell = f => ({ type: "spell", flags: flags({ lightCast: f }) });
check("token cast", readSpellCast(spell({ scene: "S", token: "T", at: 5 })), { scene: "S", token: "T" });
check("square cast rounds", readSpellCast(spell({ scene: "S", x: 150.4, y: 249.6 })), { scene: "S", x: 150, y: 250 });
check("null flag", readSpellCast(spell(null)), null);
check("no scene", readSpellCast(spell({ token: "T" })), null);
check("no target", readSpellCast(spell({ scene: "S" })), null);
check("NaN square", readSpellCast(spell({ scene: "S", x: NaN, y: 1 })), null);
check("no flags at all", readSpellCast({}), null);
check("castFlag token", castFlag("S", { token: "T" }, 7), { scene: "S", token: "T", x: null, y: null, at: 7 });
check("castFlag square", castFlag("S", { x: 10.6, y: 20 }, 7), { scene: "S", token: null, x: 11, y: 20, at: 7 });
// Foundry merges a flag object into the one already stored; the next cast must still win.
const merged = (...writes) => spell(writes.reduce((acc, w) => ({ ...acc, ...w }), {}));
check("square after token (merged) → square", readSpellCast(merged(castFlag("S", { token: "T" }, 1), castFlag("S", { x: 50, y: 60 }, 2))),
  { scene: "S", x: 50, y: 60 });
check("token after square (merged) → token", readSpellCast(merged(castFlag("S", { x: 50, y: 60 }, 1), castFlag("S", { token: "U" }, 2))),
  { scene: "S", token: "U" });
check("castFlag no scene", castFlag("", { token: "T" }), null);
check("castFlag junk target", castFlag("S", {}), null);

/* ── readSpellLight ─────────────────────────────────────────────────────── */
const tok = (id, sl, light) => ({ id, flags: sl ? flags({ spellLight: sl }) : {}, light });
check("spellLight read", readSpellLight(tok("a", { source: "Actor.x.Item.y", prior: { dim: 5 } })), { source: "Actor.x.Item.y", prior: { dim: 5 } });
check("spellLight prior defaults null", readSpellLight(tok("a", { source: "u" })), { source: "u", prior: null });
check("spellLight without source → null", readSpellLight(tok("a", { prior: {} })), null);
check("no spellLight → null", readSpellLight(tok("a")), null);

/* ── planSpellLight ─────────────────────────────────────────────────────── */
const T = (scene, id) => ({ kind: "token", scene, id });
const A = (scene, id, x, y) => ({ kind: "ambient", scene, id, x, y });
const empty = { restore: [], remove: [], light: null, create: null };
check("nothing wanted, nothing lit", planSpellLight({}), empty);
check("first cast on a token", planSpellLight({ desired: { scene: "S", token: "T" } }), { ...empty, light: { scene: "S", token: "T" } });
check("already lit there → nothing", planSpellLight({ desired: { scene: "S", token: "T" }, existing: [T("S", "T")] }), empty);
check("move token → token", planSpellLight({ desired: { scene: "S", token: "U" }, existing: [T("S", "T")] }),
  { ...empty, restore: [{ scene: "S", id: "T" }], light: { scene: "S", token: "U" } });
check("token → square", planSpellLight({ desired: { scene: "S", x: 50, y: 50 }, existing: [T("S", "T")] }),
  { ...empty, restore: [{ scene: "S", id: "T" }], create: { scene: "S", x: 50, y: 50 } });
check("square → token", planSpellLight({ desired: { scene: "S", token: "T" }, existing: [A("S", "L", 50, 50)] }),
  { ...empty, remove: [{ scene: "S", id: "L" }], light: { scene: "S", token: "T" } });
check("square already there", planSpellLight({ desired: { scene: "S", x: 50, y: 50 }, existing: [A("S", "L", 50, 50)] }), empty);
check("duplicate squares → keep one", planSpellLight({ desired: { scene: "S", x: 50, y: 50 }, existing: [A("S", "L", 50, 50), A("S", "M", 50, 50)] }),
  { ...empty, remove: [{ scene: "S", id: "M" }] });
check("same square, other scene → new one", planSpellLight({ desired: { scene: "S2", x: 50, y: 50 }, existing: [A("S", "L", 50, 50)] }),
  { ...empty, remove: [{ scene: "S", id: "L" }], create: { scene: "S2", x: 50, y: 50 } });
check("ended → everything goes", planSpellLight({ desired: null, existing: [T("S", "T"), A("S", "L", 0, 0), T("S2", "copy")] }),
  { ...empty, restore: [{ scene: "S", id: "T" }, { scene: "S2", id: "copy" }], remove: [{ scene: "S", id: "L" }] });
check("a copy of the lit token is put back", planSpellLight({ desired: { scene: "S", token: "T" }, existing: [T("S", "T"), T("S", "copy")] }),
  { ...empty, restore: [{ scene: "S", id: "copy" }] });
check("token id on another scene isn't the target", planSpellLight({ desired: { scene: "S2", token: "T" }, existing: [T("S", "T")] }),
  { ...empty, restore: [{ scene: "S", id: "T" }], light: { scene: "S2", token: "T" } });

/* ── spellLightUpdate / restoredLight ───────────────────────────────────── */
const rune = { bright: 0, dim: 10, color: "#4cf", animation: { type: "pentaryn-brokenglow" } };
const u1 = spellLightUpdate(tok("T", null), "src-1", rune);
check("spell light written", [u1.light.bright, u1.light.dim], [SPELL_LIGHT.bright, SPELL_LIGHT.dim]);
check("prior = the hand-set light", u1[`flags.${MODULE}.spellLight`], { source: "src-1", prior: rune });
const litOnce = tok("T", { source: "src-1", prior: rune });
const u2 = spellLightUpdate(litOnce, "src-2", SPELL_LIGHT);
check("second caster keeps the first prior", u2[`flags.${MODULE}.spellLight`], { source: "src-2", prior: rune });
check("unlit token → prior null", spellLightUpdate(tok("T"), "s", null)[`flags.${MODULE}.spellLight`].prior, null);
check("restore → prior", restoredLight(litOnce), rune);
check("restore with no prior → DARK", restoredLight(tok("T", { source: "s" })), JSON.parse(JSON.stringify(DARK)));
u1.light.dim = 1;
check("updates don't share SPELL_LIGHT", SPELL_LIGHT.dim, 40);

/* ── misc ───────────────────────────────────────────────────────────────── */
check("sourcesUnder token", sourcesUnder(["Scene.a.Token.b.Actor.c.Item.d", "Actor.x.Item.y", "Scene.a.Token.bb.Actor.c.Item.d"], "Scene.a.Token.b"),
  ["Scene.a.Token.b.Actor.c.Item.d"]);
check("sourcesUnder empty parent", sourcesUnder(["Actor.x.Item.y"], ""), []);
check("PHB Light actor source", isPHBLightActorSource("Compendium.dnd-players-handbook.actors.Actor.phbsplLight00000"), true);
check("other actor source", isPHBLightActorSource("Compendium.x.Actor.phbmonGoblin00"), false);
const act = torchActivityData();
check("torch activity id is 16 chars", act._id.length, 16);
check("torch activity id constant", act._id, TORCH_ACTIVITY_ID);
check("torch activity flagged + consumes nothing", [act.type, act.flags[MODULE].lightToggle, act.consumption.targets.length], ["utility", true, 0]);
check("torch activity is a toggle", isLightToggle(act, torchOff), true);
check("spell light is never darkness, at any scene darkness", [SPELL_LIGHT.negative, SPELL_LIGHT.darkness], [false, { min: 0, max: 1 }]);
check("torch light is never darkness", [lightFor(LIGHT_PROFILES.torch).negative, lightFor(LIGHT_PROFILES.torch).darkness], [false, { min: 0, max: 1 }]);
check("frozen tables",[Object.isFrozen(DARK), Object.isFrozen(SPELL_LIGHT), Object.isFrozen(LIGHT_PROFILES.torch)], [true, true, true]);

console.log(`pentaryn-senses light-core: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  console.log(failures.join("\n"));
  process.exitCode = 1;
}
