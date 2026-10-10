#!/usr/bin/env node
/**
 * Fixtures for creatures-core.mjs — `node test/run.mjs`. No dependencies, no Foundry.
 * The import itself is a check: creatures-core.mjs must load with `game`, `canvas` and `foundry` undefined.
 * Synthetic fixtures only: test/ is published with the module and every client can fetch it.
 */

const { MODULE, LIGHT_FLAG, isPlayerCreature, readOurLight, switchedOff, lightUpdate, ownerShouldSee, stripEntries,
  shouldShowStrip, stripSignature } = await import("../creatures-core.mjs");

let pass = 0;
const failures = [];
function check(name, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; return; }
  failures.push(`  ${name}\n    expected ${w}\n    got      ${g}`);
}
const FK = `flags.${MODULE}.${LIGHT_FLAG}`;
const tok = (bright = 0, dim = 0, ours) => ({
  light: { bright, dim },
  flags: ours === undefined ? {} : { [MODULE]: { [LIGHT_FLAG]: ours } }
});

/* ── isPlayerCreature ─────────────────────────────────────────────────────── */
check("player-owned npc (summon)", isPlayerCreature({ actorType: "npc", hasPlayerOwner: true }), true);
check("GM-only npc", isPlayerCreature({ actorType: "npc", hasPlayerOwner: false }), false);
check("PC never", isPlayerCreature({ actorType: "character", hasPlayerOwner: true }), false);
check("group never", isPlayerCreature({ actorType: "group", hasPlayerOwner: true }), false);
check("vehicle never", isPlayerCreature({ actorType: "vehicle", hasPlayerOwner: true }), false);
check("item pile never", isPlayerCreature({ actorType: "npc", hasPlayerOwner: true, isPile: true }), false);
// pentaryn-aoe's "Area handle" is an npc with ownership.default OWNER, so hasPlayerOwner is true.
check("spell-area handle (prop) never", isPlayerCreature({ actorType: "npc", hasPlayerOwner: true, isProp: true }), false);
check("no actor", isPlayerCreature({ hasPlayerOwner: true }), false);
check("null", isPlayerCreature(null), false);

/* ── readOurLight ─────────────────────────────────────────────────────────── */
check("flag read", readOurLight(tok(5, 5, { bright: 5, dim: 5 })), { bright: 5, dim: 5 });
check("no flag", readOurLight(tok()), null);
check("null flag (cleared)", readOurLight(tok(0, 0, null)), null);
check("array flag", readOurLight(tok(0, 0, [5])), null);
check("junk numbers → 0", readOurLight(tok(0, 0, { bright: "x" })), { bright: 0, dim: 0 });
check("throwing getter", readOurLight({ get flags() { throw new Error("boom"); } }), null);
check("false flag is not a light", readOurLight(tok(0, 0, false)), null);
check("switchedOff: false flag", switchedOff(tok(0, 0, false)), true);
check("switchedOff: null flag", switchedOff(tok(0, 0, null)), false);
check("switchedOff: our light", switchedOff(tok(5, 5, { bright: 5, dim: 5 })), false);
check("switchedOff: throwing getter", switchedOff({ get flags() { throw new Error("boom"); } }), false);

/* ── lightUpdate ──────────────────────────────────────────────────────────── */
const on = { qualifies: true, radius: 5 };
const off = { qualifies: false, radius: 5 };
check("dark creature → lit + flagged", lightUpdate(tok(), on),
  { "light.bright": 5, "light.dim": 5, [FK]: { bright: 5, dim: 5 } });
check("already ours, right radius → nothing", lightUpdate(tok(5, 5, { bright: 5, dim: 5 }), on), null);
check("radius changed → moved", lightUpdate(tok(5, 5, { bright: 5, dim: 5 }), { qualifies: true, radius: 0.5 }),
  { "light.bright": 0.5, "light.dim": 0.5, [FK]: { bright: 0.5, dim: 0.5 } });
check("own torch → left alone", lightUpdate(tok(20, 40), on), null);
check("own dim-only light → left alone", lightUpdate(tok(0, 10), on), null);
check("darkness source (negative) → left alone", lightUpdate(tok(-10, -10), on), null);
check("no longer qualifies → darkened + flag cleared", lightUpdate(tok(5, 5, { bright: 5, dim: 5 }), off),
  { "light.bright": 0, "light.dim": 0, [FK]: null });
check("setting 0 → darkened", lightUpdate(tok(5, 5, { bright: 5, dim: 5 }), { qualifies: true, radius: 0 }),
  { "light.bright": 0, "light.dim": 0, [FK]: null });
check("setting 0, dark creature → nothing", lightUpdate(tok(), { qualifies: true, radius: 0 }), null);
check("hand-edited after we lit it → let go of flag only", lightUpdate(tok(20, 40, { bright: 5, dim: 5 }), on), { [FK]: null });
// Let go, then the replacement light goes away (torch dropped): the creature is lit again.
check("let go, then dark again → relit", lightUpdate(tok(0, 0, null), on),
  { "light.bright": 5, "light.dim": 5, [FK]: { bright: 5, dim: 5 } });
// The GM set our light to 0 by hand: remember it, or the next pass would light it straight back up.
check("switched off by hand → flag false, light untouched", lightUpdate(tok(0, 0, { bright: 5, dim: 5 }), on), { [FK]: false });
check("switched off → never relit", lightUpdate(tok(0, 0, false), on), null);
check("switched off, radius changed → still nothing", lightUpdate(tok(0, 0, false), { qualifies: true, radius: 10 }), null);
check("switched off, then a light set by hand → left alone", lightUpdate(tok(20, 40, false), off), null);
check("switched off by hand while no longer qualifying → flag false", lightUpdate(tok(0, 0, { bright: 5, dim: 5 }), off), { [FK]: false });
check("hand-edited, no longer qualifies → flag only, light kept", lightUpdate(tok(20, 40, { bright: 5, dim: 5 }), off), { [FK]: null });
check("never ours, not a creature → nothing", lightUpdate(tok(20, 40), off), null);
check("PC in the dark → nothing", lightUpdate(tok(), off), null);
check("missing light data treated as dark", lightUpdate({ flags: {} }, on),
  { "light.bright": 5, "light.dim": 5, [FK]: { bright: 5, dim: 5 } });
check("no want → nothing", lightUpdate(tok()), null);
// The pass after our own write must be a no-op, or the GM would loop.
const lit = tok(5, 5, { bright: 5, dim: 5 });
check("idempotent after write", lightUpdate(lit, on), null);

/* ── ownerShouldSee ───────────────────────────────────────────────────────── */
const base = { enabled: true, isGM: false, isOwner: true, hidden: false, configPreview: false, filteredOut: false, culled: false };
check("owner sees own", ownerShouldSee(base), true);
check("setting off", ownerShouldSee({ ...base, enabled: false }), false);
check("GM path untouched", ownerShouldSee({ ...base, isGM: true }), false);
check("not owner", ownerShouldSee({ ...base, isOwner: false }), false);
check("GM-hidden stays hidden", ownerShouldSee({ ...base, hidden: true }), false);
check("config preview", ownerShouldSee({ ...base, configPreview: true }), false);
check("filtered out", ownerShouldSee({ ...base, filteredOut: true }), false);
check("other level (culled)", ownerShouldSee({ ...base, culled: true }), false);
check("null", ownerShouldSee(null), false);

/* ── stripEntries ─────────────────────────────────────────────────────────── */
const T = (id, o = {}) => ({ id, name: id, img: `tokens/${id}.webp`, actorImg: `actors/${id}.webp`, actorId: `a-${id}`,
  actorType: "npc", isOwner: true, hidden: false, isPile: false, ...o });
const scene = [
  T("zombie"),
  T("eye", { name: "Arcane Eye" }),
  T("pc", { name: "Talo", actorId: "a-pc", actorType: "character" }),
  T("friend", { name: "Brel", actorType: "character", isOwner: false }),
  T("hiddenskel", { hidden: true }),
  T("pile", { isPile: true }),
  T("ghost", { actorId: null }),
  T("handle", { name: "Fireball (Caster)", isProp: true }),
  T("bat", { name: "Bat", img: "tokens/bat.webm" })
];
const entries = stripEntries(scene, { characterId: "a-pc" });
check("order: PC first, then by name; non-owned, hidden, piles, props, actorless dropped",
  entries.map(e => e.id), ["pc", "eye", "bat", "zombie"]);
check("ranks", entries.map(e => e.rank), [0, 2, 2, 2]);
check("video token image → actor image", entries.find(e => e.id === "bat").img, "actors/bat.webp");
check("still image kept", entries[0].img, "tokens/pc.webp");
const form = stripEntries([T("wolf", { name: "Talo (Dire Wolf)", actorType: "character", originalActorId: "a-pc" }), T("eye")], { characterId: "a-pc" });
check("Wild Shape form counts as the PC", form.map(e => [e.id, e.rank]), [["wolf", 0], ["eye", 2]]);
check("other owned PC is rank 1", stripEntries([T("x"), T("p2", { actorType: "character" })]).map(e => [e.id, e.rank]), [["p2", 1], ["x", 2]]);
check("no character set", stripEntries([T("b"), T("a")]).map(e => e.id), ["a", "b"]);
check("same name → id order", stripEntries([T("s2", { name: "Skeleton" }), T("s1", { name: "Skeleton" })]).map(e => e.id), ["s1", "s2"]);
check("no image at all → mystery man", stripEntries([T("n", { img: "", actorImg: "" })])[0].img, "icons/svg/mystery-man.svg");
check("undefined → []", stripEntries(undefined), []);
check("junk entries ignored", stripEntries([null, {}, T("a")]).map(e => e.id), ["a"]);

/* ── shouldShowStrip / stripSignature ─────────────────────────────────────── */
check("PC alone → hidden", shouldShowStrip([{ id: "pc" }]), false);
check("nothing → hidden", shouldShowStrip([]), false);
check("PC + summon → shown", shouldShowStrip([{ id: "pc" }, { id: "s" }]), true);
check("non-array → hidden", shouldShowStrip(null), false);
check("signature stable", stripSignature(entries) === stripSignature(stripEntries(scene, { characterId: "a-pc" })), true);
check("signature changes on rename", stripSignature(entries) === stripSignature(stripEntries(scene.map(t => t.id === "eye" ? { ...t, name: "Eye" } : t), { characterId: "a-pc" })), false);
check("moving does not change signature (no x/y in it)", stripSignature(stripEntries([{ ...T("a"), x: 1 }])) === stripSignature(stripEntries([{ ...T("a"), x: 900 }])), true);

console.log(`pentaryn-creatures core: ${pass} passed, ${failures.length} failed`);
if (failures.length) { console.log(failures.join("\n")); process.exit(1); }
