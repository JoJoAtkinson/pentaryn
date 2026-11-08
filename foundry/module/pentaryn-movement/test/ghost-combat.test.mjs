// Ghost during a fight (feedback nwhjz2, triage I1): the pure rules. An incorporeal creature — a FEAT
// named Incorporeal Passage / Incorporeal Movement / Ethereal…, or the GM's ghostInCombat flag — keeps
// ghosting while a combat runs under the "exploration" policy; everything else still stops. Feats only:
// a wizard's Etherealness SPELL does not make the wizard incorporeal. movement-core.mjs imported bare.
import * as core from "../movement-core.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readJSON } from "./kit/harness.mjs";

const { ghostInCombat, incorporealFeat, ghostAllowed, ghostFor, ghostForCtx, buildGhostContext, playerTool,
  wishToClear, ghostBack, ghostBackKey, statusFrom, INCORPOREAL_FEATS, GHOST_COMBAT_FLAG, HUD_KEYS, TOOL_CLIP_KEYS, NOTIFY_BACK } = core;

/* ── the four fixtures the plan names ───────────────────────────────────── */

const spirit = { items: [{ type: "feat", name: "Incorporeal Passage" }, { type: "weapon", name: "Grave Touch" }], flag: false };
const wizard = { items: [{ type: "spell", name: "Etherealness" }, { type: "feat", name: "Arcane Recovery" }], flag: false };
const flagged = { items: [{ type: "weapon", name: "Longsword" }], flag: true };
const plain = { items: [{ type: "weapon", name: "Longsword" }, { type: "feat", name: "Second Wind" }], flag: false };

test("Undead Spirit with Incorporeal Passage (a feat): exempt", () => {
  assert.equal(ghostInCombat(spirit), true);
  assert.equal(incorporealFeat(spirit.items), "Incorporeal Passage");
});

test("PC with the Etherealness spell: not exempt (feats only)", () => {
  assert.equal(ghostInCombat(wizard), false);
  assert.equal(incorporealFeat(wizard.items), null);
});

test("GM-flagged token: exempt without any feat", () => {
  assert.equal(ghostInCombat(flagged), true);
  assert.equal(incorporealFeat(flagged.items), null);
});

test("plain token: not exempt", () => {
  assert.equal(ghostInCombat(plain), false);
  assert.equal(ghostInCombat({ items: [], flag: false }), false);
  assert.equal(ghostInCombat(), false);
  assert.equal(ghostInCombat({ items: null, flag: "true" }), false, "the flag must be the boolean true");
});

/* ── the name rule ───────────────────────────────────────────────────────── */

test("INCORPOREAL_FEATS: Incorporeal Movement, Incorporeal Passage, Ethereal…, case-insensitive; not a substring like Corporeal", () => {
  assert.equal(GHOST_COMBAT_FLAG, "ghostInCombat");
  for (const name of ["Incorporeal Movement", "Incorporeal Passage", "incorporeal passage", "Ethereal Jaunt", "Etherealness", "Ethereal Sight"]) {
    assert.equal(incorporealFeat([{ type: "feat", name }]), name, name);
  }
  for (const name of ["Corporeal Form", "Incorporeal", "Amorphous", "Ghostly Gaze"]) {
    assert.equal(incorporealFeat([{ type: "feat", name }]), null, name);
  }
  assert.equal(incorporealFeat([{ type: "feat" }, null, { name: "Incorporeal Movement" }, { type: "feat", name: "Incorporeal Movement" }]),
    "Incorporeal Movement", "junk rows skipped; the first matching FEAT wins");
  assert.ok(INCORPOREAL_FEATS.test("Incorporeal Movement"));
});

/* ── exempt in the policy rules ──────────────────────────────────────────── */

test("ghostAllowed: exempt lifts the combat block only; off stays off; always unchanged", () => {
  assert.deepEqual(ghostAllowed({ policy: "exploration", combatActive: true }), { allowed: false, reason: "combat" });
  assert.deepEqual(ghostAllowed({ policy: "exploration", combatActive: true, exempt: true }), { allowed: true, reason: null });
  assert.deepEqual(ghostAllowed({ policy: "exploration", combatActive: false, exempt: true }), { allowed: true, reason: null });
  assert.deepEqual(ghostAllowed({ policy: "off", combatActive: true, exempt: true }), { allowed: false, reason: "off" });
  assert.deepEqual(ghostAllowed({ policy: "off", combatActive: false, exempt: true }), { allowed: false, reason: "off" });
  assert.deepEqual(ghostAllowed({ policy: "always", combatActive: true, exempt: false }), { allowed: true, reason: null });
});

test("ghostFor: the exempt owned token ghosts in combat; the plain one does not; GM, no wish, not owner still false", () => {
  const P = { isGM: false, policy: "exploration", combatActive: true, wish: true, isOwner: true };
  assert.equal(ghostFor({ ...P, exempt: ghostInCombat(spirit) }), true, "spirit");
  assert.equal(ghostFor({ ...P, exempt: ghostInCombat(wizard) }), false, "wizard with Etherealness spell");
  assert.equal(ghostFor({ ...P, exempt: ghostInCombat(flagged) }), true, "flagged");
  assert.equal(ghostFor({ ...P, exempt: ghostInCombat(plain) }), false, "plain");
  assert.equal(ghostFor({ ...P, exempt: true, isGM: true }), false);
  assert.equal(ghostFor({ ...P, exempt: true, wish: false }), false);
  assert.equal(ghostFor({ ...P, exempt: true, isOwner: false }), false);
  assert.equal(ghostFor({ ...P, exempt: true, policy: "off" }), false);
});

test("ghostForCtx carries exempt; combat is per scene", () => {
  const ctx = buildGhostContext({ policy: "exploration", wish: true, combats: [{ active: true, sceneId: "A", started: true, combatantSceneIds: ["A"] }] });
  assert.equal(ghostForCtx(ctx, { isGM: false, isOwner: true, sceneId: "A" }), false);
  assert.equal(ghostForCtx(ctx, { isGM: false, isOwner: true, sceneId: "A", exempt: true }), true);
  assert.equal(ghostForCtx(ctx, { isGM: false, isOwner: true, sceneId: "B" }), true, "no fight on B");
});

test("playerTool: with an exempt token in the fight the button is usable (ready/on) and flags exempt for the toolclip", () => {
  const base = { isGM: false, policy: "exploration", combatActive: true };
  assert.deepEqual(playerTool({ ...base, wish: false }), { visible: true, active: false, state: "combat", exempt: false });
  assert.deepEqual(playerTool({ ...base, wish: false, exempt: true }), { visible: true, active: false, state: "ready", exempt: true });
  assert.deepEqual(playerTool({ ...base, wish: true, exempt: true }), { visible: true, active: true, state: "on", exempt: true });
  assert.deepEqual(playerTool({ ...base, combatActive: false, wish: true, exempt: true }), { visible: true, active: true, state: "on", exempt: false }, "no fight: nothing to explain");
  assert.deepEqual(playerTool({ ...base, policy: "always", wish: true, exempt: true }), { visible: true, active: true, state: "on", exempt: false }, "always: exempt is moot");
  assert.deepEqual(playerTool({ ...base, policy: "off", wish: true, exempt: true }), { visible: false, active: false, state: "off", exempt: false });
  assert.equal(TOOL_CLIP_KEYS.exempt, "PENTARYN_MOVEMENT.tool.clip.exempt");
});

test("wishToClear: the fight does not clear an exempt player's wish; the GM's off still does", () => {
  assert.equal(wishToClear({ policy: "exploration", combatActive: true, wish: true }), "combat");
  assert.equal(wishToClear({ policy: "exploration", combatActive: true, wish: true, exempt: true }), null);
  assert.equal(wishToClear({ policy: "off", combatActive: true, wish: true, exempt: true }), "off");
  assert.equal(wishToClear({ policy: "exploration", combatActive: true, wish: false, exempt: true }), null);
});

test("ghostBack / ghostBackKey: an incorporeal token arriving mid-fight says back.exempt once; the GM's policy change still says back.off", () => {
  const mid = { cleared: "combat", policy: "exploration", combatActive: true, wish: false };
  assert.equal(ghostBack(mid), false);
  assert.equal(ghostBack({ ...mid, exempt: true }), true);
  assert.equal(ghostBackKey({ ...mid, exempt: true }), NOTIFY_BACK.exempt);
  assert.equal(ghostBackKey({ ...mid, policy: "always", exempt: true }), NOTIFY_BACK.off);
  assert.equal(ghostBackKey({ ...mid, exempt: true, wish: true }), null, "wish already on: nothing to say");
  assert.equal(ghostBackKey({ cleared: "combat", policy: "exploration", combatActive: false, wish: false, exempt: true }), NOTIFY_BACK.combat, "fight over: the usual toast");
});

test("statusFrom: exempt makes allowed true with no reason while combatOnScene stays true", () => {
  const s = statusFrom({ policy: "exploration", combat: true, wish: true, isGM: false, exempt: true });
  assert.equal(s.combatOnScene, true);
  assert.equal(s.allowed, true);
  assert.equal(s.reason, null);
  assert.equal(s.ghost, true);
  assert.deepEqual(Object.keys(s), ["policy", "combatOnScene", "allowed", "reason", "wish", "ghost", "ownedOnTop", "patched"], "the historic eight, unchanged");
});

/* ── the new label keys exist ────────────────────────────────────────────── */

test("HUD_KEYS, TOOL_CLIP_KEYS.exempt and NOTIFY_BACK.exempt are literal keys present in lang/en.json", () => {
  const lang = readJSON(new URL("../lang/en.json", import.meta.url));
  const has = key => typeof key.split(".").reduce((o, k) => o?.[k], lang) === "string";
  assert.deepEqual(Object.keys(HUD_KEYS), ["on", "off", "feat"]);
  assert.ok(Object.isFrozen(HUD_KEYS));
  for (const key of [...Object.values(HUD_KEYS), TOOL_CLIP_KEYS.exempt, NOTIFY_BACK.exempt]) assert.ok(has(key), key);
  assert.match(key(lang, HUD_KEYS.feat), /\{feat\}/, "the feat tip names the feat");
});

function key(lang, path) {
  return path.split(".").reduce((o, k) => o?.[k], lang);
}
