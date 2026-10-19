// Transmuter's Stone as pick-one passive effects (feedback tNdOEx, tiDvFa — Marwen Ashcroft).
//
// HOW TO RUN: this file is an eval-js BODY (the body of an async function; top-level `await` and
// `return` work). Paste it into mcp__foundry__eval-js, or into a GM browser console wrapped in
// `(async () => { … })()`. It is a DRY RUN unless APPLY is true: it returns the plan and writes
// nothing. Needs pentaryn-riders 0.4.0 live for the one-at-a-time behaviour (the effects work as
// plain toggles without it). Idempotent: a second run finds everything in place and plans nothing.
//
// WHY: the D&D Beyond import gave the stone's Transmuter's Stone feat no effects at all and baked
// its chosen benefit into the actor's BASE data: `system.attributes.senses.ranges.darkvision = 60`
// (Marwen is Human: no species darkvision) and `system.abilities.con.proficient = 1` (Wizard saves
// are INT/WIS; no other feat grants CON). So there was nothing to switch, and she was "stuck on
// Darkvision".
//
// WHAT IT DOES (on the actor's Transmuter's Stone feat, identifier `transmuters-stone`):
//   1. creates passive (transfer) effects, keyed by flags.pentaryn-riders.stone so a re-run finds them:
//        "Transmuter's Stone"                      always on: proficiency in CON saving throws
//        "Transmuter's Stone: Darkvision"          +60 ft darkvision            ┐ flags.pentaryn-riders.choice
//        "Transmuter's Stone: Speed"               +10 ft walking speed         │ = { group: "transmuters-stone",
//        "Transmuter's Stone: Resistance (Acid)" … one per type: acid, cold,    │     max: 1 at Wizard 1-9,
//          fire, lightning, poison, thunder                                      ┘     2 from Wizard 10 }
//      The benefit she has today (Darkvision) starts on; the others start off.
//   2. removes what the import baked in, only while it is still the stone's: base darkvision 60 → 0,
//      base CON save proficiency 1 → 0 (the always-on effect now grants it).
// It never touches another actor, item or effect.

const APPLY = false;
const ACTOR = "Marwen Ashcroft";
const START_ON = "darkvision";             // the benefit chosen today (her report: "Stuck on the Darkvision option")

const SCOPE = "pentaryn-riders";
const GROUP = "transmuters-stone";
const MAX = "min(2, 1 + floor(@classes.wizard.levels / 10))";
const IMG = "icons/commodities/gems/gem-rough-cushion-green.webp";
const change = (key, type, value) => ({ key, type, value, phase: "initial", priority: 20 });
const RESIST = ["acid", "cold", "fire", "lightning", "poison", "thunder"];
const cap = s => s[0].toUpperCase() + s.slice(1);

const WANT = [
  { key: "bearer", name: "Transmuter's Stone", choice: false,
    description: "While you have the stone: proficiency in Constitution saving throws (always on). Pick one benefit below.",
    changes: [change("system.abilities.con.proficient", "upgrade", 1)] },
  { key: "darkvision", name: "Transmuter's Stone: Darkvision", choice: true,
    description: "Darkvision 60 ft, or +60 ft to the darkvision you have. Turning this on turns the other stone benefit off.",
    changes: [change("system.attributes.senses.ranges.darkvision", "add", 60)] },
  { key: "speed", name: "Transmuter's Stone: Speed", choice: true,
    description: "Your Speed increases by 10 feet. Turning this on turns the other stone benefit off.",
    changes: [change("system.attributes.movement.speeds.walk", "add", "10")] },
  ...RESIST.map(t => ({ key: `resist-${t}`, name: `Transmuter's Stone: Resistance (${cap(t)})`, choice: true,
    description: `Resistance to ${cap(t)} damage. Turning this on turns the other stone benefit off.`,
    changes: [change("system.traits.dr.value", "add", t)] })),
];

const actor = game.actors.getName(ACTOR);
if (!actor) return { ok: false, why: `no actor named ${ACTOR}` };
const stone = actor.items.find(i => i.type === "feat" && (i.system.identifier === "transmuters-stone" || i.name === "Transmuter's Stone"));
if (!stone) return { ok: false, why: `${ACTOR} has no Transmuter's Stone feat` };

const have = new Map(stone.effects.contents.map(e => [e.getFlag(SCOPE, "stone"), e]).filter(([k]) => k));
const create = WANT.filter(w => !have.has(w.key)).map(w => ({
  name: w.name, img: IMG, type: "base", transfer: true,
  disabled: w.choice ? w.key !== START_ON : false,
  description: w.description,
  system: { changes: w.changes },
  flags: { [SCOPE]: { stone: w.key, ...(w.choice ? { choice: { group: GROUP, max: MAX } } : {}) } },
}));

// The baked-in base data: only reset while it is still the stone's (species gives none; no other CON source).
const src = actor.system._source;
const speciesDark = Number(actor.items.find(i => i.type === "race")?.system?.senses?.ranges?.darkvision) || 0;
const otherConSave = actor.items.some(i => i.id !== stone.id && /resilient/i.test(i.name) && /con/i.test(JSON.stringify(i.system?.advancement ?? {})));
const actorUpdate = {};
if (Number(src.attributes?.senses?.ranges?.darkvision) === 60 && !speciesDark) actorUpdate["system.attributes.senses.ranges.darkvision"] = 0;
if (Number(src.abilities?.con?.proficient) === 1 && !otherConSave) actorUpdate["system.abilities.con.proficient"] = 0;

const plan = {
  actor: `${actor.name} (${actor.id})`, item: `${stone.name} (${stone.id})`,
  createEffects: create.map(c => `${c.name}${c.disabled ? "" : " [on]"}`),
  alreadyThere: [...have.keys()],
  actorUpdate,
};
if (!APPLY) return { ok: true, dryRun: true, plan };

if (create.length) await stone.createEmbeddedDocuments("ActiveEffect", create);
if (Object.keys(actorUpdate).length) await actor.update(actorUpdate);
actor.reset();
const d = actor.system;
return {
  ok: true, applied: true, plan,
  after: {
    darkvision: d.attributes.senses.ranges.darkvision, walk: d.attributes.movement.walk ?? d.attributes.movement.speeds?.walk,
    dr: [...(d.traits.dr.value ?? [])], conSaveProficient: d.abilities.con.proficient,
    on: stone.effects.filter(e => !e.disabled).map(e => e.name),
  },
};
