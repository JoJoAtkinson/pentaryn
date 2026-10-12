/**
 * The cast (synthetic): built in the current world (setupWorld first). Shapes follow the 2024 PHB
 * classes and a 2024 MM stat block as dnd5e 6 stores them.
 *
 *   fighter    Extra Attack; Longsword (ver, Sap), Dagger (lgt fin thr, Nick), Shortbow; Two-Weapon Fighting
 *   rogue      a Nick pair (Scimitar lgt fin Nick + Dagger lgt fin thr Nick… second is the partner); Sneak Attack 3d6
 *   monk       Monk's Focus (`focus` points left, of 2) with a Flurry of Blows activity; Martial Arts; Unarmed Strike
 *   wolf       NPC: Multiattack "makes two [[/item .bite]] attacks"; Bite
 *   druid      a polymorphed character (Wild Shape) with the bear's Multiattack
 *   barbarian  Reckless Attack (stock "Reckless" effect), Frenzy (rage-damage 2), Rage; Greataxe (hvy two)
 *   slayer     Great Weapon Master + Polearm Master (Pole Strike); Glaive (hvy rch two); Divine Strike; Colossus Slayer
 */

import { feat, makeActor, weapon } from "./world.mjs";

const unarmedStrike = (id = "unarmedStrike001") => ({
  ...weapon(id, "Unarmed Strike", { identifier: "unarmed-strike", equipped: false, damageTypes: ["bludgeoning"], props: "fin" }),
});

export function fighter(o = {}) {
  return makeActor({
    id: "fighter000000001", name: "Fighter", ...o,
    items: [
      { id: "fighterClass0001", name: "Fighter", type: "class", system: { identifier: "fighter" } },
      feat("extraAttack00001", "Extra Attack"),
      feat("twoWeaponFight01", "Two-Weapon Fighting"),
      weapon("longsword0000001", "Longsword", { props: "ver", mastery: "sap" }),
      weapon("dagger0000000001", "Dagger", { props: "lgt fin thr", mastery: "nick", damageTypes: ["piercing"] }),
      weapon("shortbow00000001", "Shortbow", { props: "two", attackType: "ranged", damageTypes: ["piercing"], range: { value: 80, long: 320 } }),
      ...(o.extraItems ?? []),
    ],
  });
}

export function rogue(o = {}) {
  return makeActor({
    id: "rogue00000000001", name: "Rogue", ...o,
    system: { scale: { rogue: { "sneak-attack": { number: 3, faces: 6, formula: "3d6" } } } },
    items: [
      { id: "rogueClass000001", name: "Rogue", type: "class", system: { identifier: "rogue" } },
      feat("sneakAttack00001", "Sneak Attack", { activities: [{ id: "sneakDmg00000001", type: "damage", activation: "special" }] }),
      weapon("scimitar00000001", "Scimitar", { props: "lgt fin", mastery: "nick" }),
      weapon("dagger0000000002", "Dagger", { props: "lgt fin thr", mastery: "nick", damageTypes: ["piercing"] }),
      ...(o.extraItems ?? []),
    ],
  });
}

export function monk({ focus = 2, ...o } = {}) {
  return makeActor({
    id: `monk${focus}00000000000`.slice(0, 16), name: `Monk (${focus} Focus)`, ...o,
    items: [
      { id: "monkClass0000001", name: "Monk", type: "class", system: { identifier: "monk" } },
      feat("monksFocus000001", "Monk's Focus", {
        identifier: "monks-focus", uses: { max: 2, spent: 2 - focus, value: focus },
        activities: [{ id: "flurryAct0000001", type: "utility", name: "Flurry of Blows", activation: "bonus" }],
      }),
      feat("martialArts00001", "Martial Arts"),
      unarmedStrike(),
      ...(o.extraItems ?? []),
    ],
  });
}

export function wolf(o = {}) {
  return makeActor({
    id: "wolf000000000001", name: "Wolf", type: "npc", ...o,
    items: [
      { id: "multiattack00001", name: "Multiattack", type: "feat", system: { description: { value: "<p>The wolf makes two [[/item .bite]] attacks.</p>" } } },
      { ...weapon("bite", "Bite", { damageTypes: ["piercing"], equipped: true }), type: "weapon", system: { ...weapon("bite", "Bite").system, type: { value: "natural", baseItem: "" } } },
    ],
  });
}

export function druid(o = {}) {
  return makeActor({
    id: "druidBear0000001", name: "Druid (Bear)", polymorphed: true, ...o,
    items: [
      { id: "multiattack00002", name: "Multiattack", type: "feat", system: { description: { value: "<p>The bear makes one [[/item .bite]] attack and one [[/item .claw]] attack.</p>" } } },
      { ...weapon("bite", "Bite"), system: { ...weapon("bite", "Bite").system, type: { value: "natural", baseItem: "" } } },
      { ...weapon("claw", "Claw"), system: { ...weapon("claw", "Claw").system, type: { value: "natural", baseItem: "" } } },
    ],
  });
}

export function barbarian(o = {}) {
  return makeActor({
    id: "barbarian0000001", name: "Barbarian", ...o,
    system: { scale: { barbarian: { "rage-damage": { value: 2 } } } },
    items: [
      { id: "barbClass0000001", name: "Barbarian", type: "class", system: { identifier: "barbarian" } },
      feat("extraAttack00002", "Extra Attack"),
      feat("recklessAttack01", "Reckless Attack", {
        effects: [{ id: "stockReckless001", name: "Reckless", system: { changes: [] }, flags: {} }],
      }),
      feat("frenzy0000000001", "Frenzy", { activities: [{ id: "frenzyDmg0000001", type: "damage", activation: "special" }] }),
      feat("rage000000000001", "Rage", { activities: [{ id: "rageAct000000001", type: "utility", activation: "bonus" }] }),
      weapon("greataxe00000001", "Greataxe", { props: "hvy two", mastery: "cleave" }),
      ...(o.extraItems ?? []),
    ],
  });
}

export function slayer(o = {}) {
  return makeActor({
    id: "slayer0000000001", name: "Slayer", ...o,
    items: [
      { id: "slayerClass00001", name: "Paladin", type: "class", system: { identifier: "paladin" } },
      feat("greatWeaponMast1", "Great Weapon Master"),
      feat("polearmMaster001", "Polearm Master", {
        activities: [{ id: "poleStrikeAct001", type: "attack", name: "Pole Strike", activation: "bonus", classification: "weapon" }],
      }),
      feat("divineStrike0001", "Divine Strike", { activities: [{ id: "divineDmg0000001", type: "damage", activation: "special" }] }),
      feat("colossusSlayer01", "Colossus Slayer", { activities: [{ id: "colossusDmg00001", type: "damage", activation: "special" }] }),
      weapon("glaive0000000001", "Glaive", { props: "hvy rch two", mastery: "graze" }),
      ...(o.extraItems ?? []),
    ],
  });
}
