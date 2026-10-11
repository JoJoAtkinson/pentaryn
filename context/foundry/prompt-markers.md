---
title: "Prompt markers — turning Joe's typed map notes into built things"
created: 2026-10-10
last_modified: 2026-10-11
status: active
tags: [context, foundry, markers, mcp, prompt-markers, playbook]
---

# Prompt markers

**Read this when:** "process the prompt markers", "replace the prompts", "what did I put on the
map", or a `Prompt · <size>` token is in the way.
**Not this file:** colour/number markers that point at a spot → [`markers.md`](markers.md) ·
how this was designed → [`../plans/prompt-markers.md`](../plans/prompt-markers.md) · module
internals → [`../../foundry/module/pentaryn-prompts/README.md`](../../foundry/module/pentaryn-prompts/README.md)

---

## What a prompt marker is

A hidden token from the **`Prompt Markers`** actor folder — `Prompt · tiny` (0.5 sq), `small`,
`mid` (1 sq), `large` (2×2), `xl` (3×3), `xxl` (4×4) — carrying the text Joe typed into its
dialog (`flags.pentaryn-prompts.prompt` on the **token**). The footprint is the space the thing
should take. Recognised by `flags.pentaryn-prompts.marker`, never by name.

## First: is the tool there?

The whole job is two calls to the MCP tool **`prompt-markers`** (Claude sees it as
`mcp__foundry__prompt-markers`). Check before anything else:

```
ToolSearch "select:mcp__foundry__prompt-markers"
```

**Subagent, or tool still missing after one retry → use the fallback table now.** A subagent cannot
run `/mcp` and may never receive the tool-list notice, so waiting gets it nothing.

Otherwise (a main session) the session's tool list is older than the bridge build: Claude Code
fetches `tools/list` once when a session starts. Ask Joe to run `/mcp` → reconnect `foundry` (or
start a new session); wrappers built from 2026-10-10 on also announce a changed list within ~30 s
(`notifications/tools/list_changed`), so one wait and a second ToolSearch may be enough. If it is
still missing, check the build: `make foundry-bridge-status` — the backend must have started after
`packages/mcp-server/dist/backend.js` was last built (see "Restarting only the broker" in
[`README.md`](README.md)) — and use the fallback meanwhile.

**The fallback** is the module API through `eval-js`: the same arguments and the same readback text
(the MCP tool prints the module's `text` verbatim); only the images differ.

| MCP call | eval-js fallback |
|---|---|
| `{action: "list"}` | `return game.pentaryn.prompts.list();` — an **object** `{scenes: [{id, name, nav, prompts, empty}]}`, not `.text` |
| `{action: "gather", …}` | `const r = await game.pentaryn.prompts.gather({…}); return r.text + "\n" + r.crops.map(c => c.path).join("\n");` — crop paths are **relative to the Foundry Data dir**: `Read` `~/Library/Application Support/FoundryVTT/Data/<path>` |
| `{action: "replace", call, replacements, dryRun}` | `return (await game.pentaryn.prompts.replaceMany({call, replacements, dryRun})).text;` — **`replaceMany`**, not `replace` (that one takes ONE replacement). The whole result is safe to return too: `results` are flat per-prompt rows (`id, ok, created, ids, markerDeleted, sheet, defaults, warnings…`), nothing reaches eval-js's depth limit |
| `{action: "replace", specFile, dryRun}` | **Write the spec once as JSON** to `~/Library/Application Support/FoundryVTT/Data/pentaryn-prompts-specs/<call>.json` (an array of replacements, or `{call, party, replacements}`), then `return (await game.pentaryn.prompts.replaceMany({specFile: "pentaryn-prompts-specs/<call>.json", dryRun: true})).text;` — the browser reads it from the Data dir, so nothing is pasted into eval-js; `Edit` the file between dry runs. `dryRun`/`force` always come from the call, never the file. Delete the file when done. (The MCP tool's `specFile` takes any absolute local path.) |
| `with: {kind: "npc", npc, features}` | identical — the module builds the npc itself (module 0.3.0+) |
| everything else (`actor`+`patch`, `character`, `hotspot`, `note`, …) | identical — the module does it |

**Confirm the loaded code first:** `return game.pentaryn.prompts.status();` → `version` is the running
code's own constant and must read `0.4.0` or later; `listed` (what `game.modules` says) can lag until
a world rescan, so never judge by it. `npcBridge: false` means the bridge module is not active and
`npc` replacements fail with `BAD_SPEC`. `party` is the world's party setting (`"none set"` when blank —
then ask Joe or leave budgets out; never invent one). The MCP gather's trailer also prints `module=<version>`.

## The one call

```
prompt-markers {action: "gather"}
```

That is the whole context-building step. It returns every prompt on every scene that has one,
already placed in its surroundings. **Do not** re-derive any geometry with `eval-js`, do not read
token coordinates, do not retype the prompt text anywhere — the gather and the replace carry it.

| Knob | Default | When to change it |
|---|---|---|
| `scenes` | `"all"` (every scene with a prompt) | `"current"`, or a list of scene ids/names (which may include `"current"`), to work one board |
| `party` | the module's world setting *Party for encounter budgets* (blank = none) | only when you **know** the party (Joe said it, or the scene's own PCs): `"4x5"` (size × level), `{size, level}` or `[5,5,4,5]` — prints the 2024 DMG XP budget per encounter, and replace reports each encounter's difficulty. The text's `<party>` line says which party it used and where from, or `none set`; with none, design by the prompts and say so to Joe — never take `4x5` from this doc |
| `crops` | `"auto"`: on for a single-scene gather **that has a background image or tiles**; a blank scene says `<crops>crops: skipped — …</crops>` | `true` on a batch when set dressing matters; `false` to save ~800 tokens per crop |
| `maxPrompts` | 60 | lower only if output is cut; if `next` is set, gather `scenes: ["<next>"]` and continue scene by scene (`list` gives the scenes) |
| `chars`, `unseenWithinFt`, `builtWithoutProvenance` | 400, 60, true | rarely |

`prompt-markers {action: "list"}` gives the scenes and counts first if the board is large.
`{action: "crops", call, encounters: ["E1"]}` adds or re-renders crops after a gather.
`{action: "show", call, id: "p3"}` pans Joe's canvas to a marker so he can look at what you are
asking about.

The reply is three parts: the tagged text (with a `<party>` line after the legend and, when crops were
skipped, a `<crops>` line before `<todo>`), one image per encounter crop, and a trailer line with
`call=pm-xxxx`, counts, `next`, and where the crop files were also written
(`$TMPDIR/pentaryn-prompts/<call>/E1.webp`). **Keep the `call` id** — replace needs it.

## How to read the text

The legend at the top of every gather (quoted exactly):

```
p# = prompt marker to build and replace. t# = already built: context only, never replace, never move.
ft = 5e grid distance between nearest occupied squares (adjacent = 5), scene diagonal rule.
Bands: touching 5 | reach 10 | close 15-30 | near 35-60 | far 65-150 | distant 155+.
LOS = clear sight line through walls with unlimited darkvision (light ignored).
door = blocked only by a closed door (secret doors say "secret door"). wall = no sight line.
Bearing = compass on the map, north is up. at = feet from the map's top-left corner.
Encounter E# = linked by <=30 ft with LOS; a hostile built creature in it brings its pack (the hostile built creatures linked the same way).
Formation = linked by <=15 ft with LOS, inside an encounter.
elev = elevation in ft when not 0. Door lines: each door near a prompt, its state, and who can see it from which side.
Images (if any) are set dressing: what the room looks like. Distances and LOS come from this text, never from the picture.
```

The `<overview>` of each scene carries, in this order: the budget line (with a party), one line
per encounter (`E1: p1 + built t1 "Skrag", t2 "Grek", t3 "Pell", t4 "Snikka". Formation p1 t4. Built
XP already in it: 350.`), how encounters sit relative to each other (`E2 is 30 ft SE of E1, no LOS
between them (a closed door)`), the loners (`Alone: p13 (10 ft NW of t1 Notice board, in sight; 50 ft
E of p10, behind a closed door)` — the nearest **built** thing it can see comes first), one **door
line** per door a prompt can see (`Door at 28,35 ft (closed, E-W wall): N side E1 (p4 at the door); S
side p8 (10 ft), t6 (30 ft), +4 more built. No sight line to it: E2 (p6 50 ft, wall).` — context-only
built things are named for the nearest three per side and counted after that), and the built list.

Each `<built>` prints `type` (a creature's type; a character's `Paladin 5, Oath of Devotion (Human)`),
`stats` (`CR 1/4, AC 15, HP 11`; `HP 7/11` when hurt), `disposition`, the prompt it came from (`p1 of
pm-759c`), the builder's one-line **`Why:`** (the provenance `note`), a hotspot's `Items:` (name,
rarity, `unidentified, shows as "…"`, attunement) or a creature's notable `Carries:` (loot, keys,
potions, anything magic), a `Light:` placed with it (`dim 10 ft, #9fd3ff, pulse`), and up to 400
characters of its description cut at a sentence; a description cut short ends
`… (cut, full text: get-character <id>)` — if a neighbour matters to the design, read its full
sheet. A description prints once per actor: further unlinked tokens of that actor with the same text
say `Description: same as t4 "Goblin"` (a token whose own copy differs prints its own). A stock monster this system built without a new
biography prints no Description (the book's lore is not the builder's); its prompt and `Why:` say what it
is. That is enough to design a neighbour without opening its sheet.

Work in this order:

1. **Each `<encounter>` as one design.** Roles, a shared CR budget (the budget line), who leads,
   who flees, how they fight together. A `formation` is a group standing together — design them to
   act together. A `t#` inside an encounter is already part of the fight; build around it (the
   boss/shaman relationship, not two strangers). **A prompt dropped beside a hostile built creature
   joins its fight**: one within 30 ft in sight makes it an encounter and brings that creature's
   whole pack (the hostile built creatures chained at 30 ft with sight), so `E1: p1 + built t1
   "Skrag" … Built XP already in it: 350.` is one new member for an existing camp. Take the built XP
   off the budget before you size the new member. Neutral and friendly built creatures (the
   innkeeper, a street crowd, the party) and objects never chain: they join an encounter only where
   they stand within 30 ft of one of its prompts, and never make a lone prompt an encounter.
   `Shared with E2: t3 t4 (built things never merge encounters; decide whether this is one fight)`
   means two prompt groups reach the same built pack and its XP is counted in each line: decide
   whether the new prompts reinforce one fight, and say which in the `note`.
2. **Each `<alone>` prompt** on its own. The built thing named in its alone note is the nearest one it
   can see within 60 ft: an object, a neutral or friendly creature (the villager it is pickpocketing,
   the innkeeper it serves), or a hostile one 35–60 ft off (a hostile one within 30 ft would have made
   it an encounter). Context only — build the prompt to fit beside it. Read its `<unseen>` line:
   a `door` neighbour 20 ft away is the ambush or the alarm ("wakes on noise from the door"), not a
   member of the pack. `wall` means no relation unless the prompt says otherwise. The door lines say
   which door and who can see it from which side: `through another door` means that group sees the
   doorway only past a second closed door, and `No sight line to it:` lists the prompt groups near the
   door but walled off from it — never the other side of that door. A group there is named by its
   nearest prompt (`E1 (p1 25 ft, wall)`); `its prompts p1 p2 are farther` means only a built member is
   in range.
3. **`<context_only>`** built things: they inform tone and continuity. Never rebuild them.
4. **Regions and crops are set dressing.** Use them to tell an altar from a bar; never to judge
   distance or sight.
5. **Never move, replace or edit a `t#`.** If a prompt says "replace the innkeeper", ask Joe.

## Deciding what each prompt becomes

| The prompt describes… | `with.kind` | Notes |
|---|---|---|
| A stock monster that fits as written | `actor` + `uuid` | compendium monster; imported into `Foundry MCP Creatures` |
| **A stock monster plus changes** (a name, a bio, another weapon, a carried item, a size, one extra trait) | `actor` + `uuid` + **`patch`** | the module imports and patches it before placing — no eval-js. See below |
| A new creature or NPC with no stock base | `npc` | the `dnd5e-create-npc` arguments + `features` (`dnd5e-add-feature` arguments without `actorIdentifier`, plus `recharge`) + optional `patch`. Built by the module (eval-js too); every field checked in the dry run, unknown keys refused; `languages` as names or keys. A `spells` feature searches `compendiumPacks`, default `["dnd5e.spells"]` — the **2014** SRD: pass `["dnd-players-handbook.spells", "dnd5e.spells24"]` for 2024 spells; the dry run warns on any name the packs lack. Biography/description as **raw HTML**, never pre-escaped. Rules from the owned books → [`rules-lookup.md`](rules-lookup.md) |
| **A player character** ("the party: level-5 paladin…") | **`character`** | class/subclass/species/background from the PHB, dnd5e's own advancements run headlessly. See below |
| A creature that already exists in the world | `actor` + `actorId` | placed, not copied (`copy: true` to duplicate; required for a `patch`) |
| Loot, a container, something to search | `hotspot` | `name`, `description`, `items: [{name \| uuid, quantity, rename, system} \| {data}]`, `light?` (AmbientLight config — a glowing relic: `{dim: 10, color: "#9fd3ff", animation: {type: "pulse"}}`, placed at its centre); eye icon, 0.5 sq — the [`markers.md`](markers.md) hotspot recipe. The actor lands in the template's folder, **`Scene Props`** |
| Something only to read or look at | `note` | `name`, `html` (GM-only parts in `<section class="secret">`), `light?` (a lantern by the board); OBSERVER, `global: false`, eye pin |
| A light source and nothing else | `light` | `config` = AmbientLight config |
| A picture on the floor (rug, blood, rubble) | `tile` | `src` under `assets/`; `width`/`height` in grid squares (default: the marker's footprint) |
| Nothing after all ("cut this", a note to self) | `none` | `reason`; the marker is deleted, the text stays in the readback |

**Size word → creature size:** tiny→tiny, small→small, mid→medium, large→large, xl→huge,
xxl→gargantuan. A `tiny` on a table is usually an **object** (hotspot/note), not a creature.

**Prompt text vs footprint:** the **footprint wins** — it is the space Joe drew on the map. "A huge
guardian" on a `large` marker is a Large creature (`patch.size: "large"` if the stock one is Huge); a
Small stock goblin boss on a `mid` marker becomes Medium (`patch.size: "medium"`). Say the call in the
`note` and in the report to Joe. Ask instead only when the size is the point of the prompt ("a dragon
that fills the hall" on a `tiny`).

**Picking a stock creature or the PHB names** — never from memory (rules from the books →
[`rules-lookup.md`](rules-lookup.md)), one eval-js each:
`game.pentaryn.rules.monsters({size: "large", type: "construct", cr: "5-8"})` (Monster Manual then
2024 SRD, lowest CR first; returns `{count, shown, monsters: [{name, cr, size, uuid}]}`, not a list); `game.pentaryn.rules.monster("Shield Guardian", {text: true})`
(returns an **object** of per-feature text, not a string: digest plus every feature's rules text with `[[lookup]]`/attack/damage enrichers resolved — what you
need to decide what a patch removes); `game.pentaryn.rules.names()` (PHB classes, subclasses by class,
species as the PHB spells them, backgrounds, feats by category).

**Custom items go inline**, never through `manage-world-items`: a world item is a stray document
in the Items sidebar with no provenance, which cleanup cannot find. Use `{data: {name, type,
system}}` in `hotspot.items`, `patch.addItems` or `character.items`. An unidentified artifact:

```js
{data: {name: "The Ember Crown", type: "equipment", system: {
  rarity: "artifact", attunement: "required", identified: false,
  unidentified: {name: "Soot-Blackened Bronze Circlet", description: "<p>Warm to the touch.</p>"},
  description: {value: "<p>Wondrous item, artifact (requires attunement). …</p>"}}}}
```

`attunement` is dnd5e's value (`"required"` | `"optional"` | blank). Leave it out and the module sets
`"required"` when the item's text says *requires attunement* (not "does not require attunement"; and
only on types that have the field — weapon, equipment, consumable, tool, container: a `loot` item is
named instead, so make a wondrous item `equipment`); the dry run prints that as
`DEFAULTED (check): The Ember Crown: attunement set to required (its text requires attunement)`. An
explicit value is never changed. Gathers then list it as `The Ember Crown (artifact; unidentified,
shows as "Soot-Blackened Bronze Circlet"; attunement required)`.

### `patch` — stock monster plus changes

```js
{id: "p3", ring: "mook", with: {kind: "actor", uuid: "Compendium.dnd-monster-manual.actors.Actor.mmGoblinWarrior0",
  patch: {
    name: "Yark", size: "small", biography: "<p>Grub's cousin. Flees when Skrag falls.</p>",
    removeItems: ["Scimitar"],
    addItems: [{name: "Spear"}, {name: "Arrows", quantity: 20},
               {data: {name: "Crown-Room Key", type: "loot", system: {description: {value: "<p>…</p>"}}}}],
    traits: [{name: "Sound the Horn", activation: "bonus", html: "<p>…</p>"},
             {name: "Earthsplitter", activation: "action", recharge: 5, html: "<p>…</p>"},
             {name: "Half Asleep", html: "<p>Passive Perception 5.</p>"}],
    recharge: {"Breath Weapon": 5},                 // an item it already has
    hp: 60, ac: 17, cr: 3, speed: 15, disposition: "hostile",
    creatureType: "construct",                       // or "humanoid (goblinoid)"
    languages: ["Common", "Goblin"],                 // names or keys; replaces; [] for none
    itemUpdates: [{item: "Spear", set: {"name": "Rusty Spear"}}],     // escape hatch: paths must exist in the item schema
    set: {"system.attributes.movement.climb": 30}                    // escape hatch
  }}}
```

- `addItems` by **name** searches the PHB equipment, then the 2024 SRD; a uuid works for anything.
  Weapons and armour are equipped. A PHB weapon on an NPC uses the NPC's own ability and
  proficiency (a spear is Str). dnd5e 6 weapons have **no** `system.ability` (only activities carry
  `attack.ability`), so an `itemUpdates` `set` of `system.ability` is accepted by the dry run and silently dropped by
  the real run; to make a weapon Dex, patch the item's attack activity by hand after the replace.
- `traits` make monster features; `activation` passive (default) | action | bonus | reaction |
  special; `recharge` 2–6 (5 = "Recharge 5–6"); `uses: {max, per: "day"|"lr"|"sr"}`. Attacks and
  saves with dice are `npc` features, not traits.
- **Languages are dnd5e keys** (`common`, `goblin`, `cant`); names become keys for you (`Elven`,
  `Orcish` too), and a word that is no dnd5e language is kept as custom text with a note. The dry run
  prints `languages → common, goblin, elvish`. A `creatureType` change without `languages` **clears
  the inherited languages** (a construct made from an earth elemental does not keep Terran; a 2024
  goblin is `fey`, not humanoid) — the dry run says so and `patched:` names what went; pass
  `languages` to keep some.
- The dry run checks every key and resolves every item; an unknown key or item is `BAD_SPEC`, and a
  missed item name lists the nearest PHB names.
- `patch` needs an actor this run owns: a compendium `uuid`, `copy: true`, or an `npc`.

### `character` — a level-N player character

```js
{id: "p9", with: {kind: "character", name: "Hale Brightwater", level: 5,
  class: "Paladin", subclass: "Oath of Devotion", species: "Human", background: "Soldier",
  abilities: {str: 15, dex: 10, con: 13, int: 8, wis: 12, cha: 14},   // BASE scores, before any increase
  abilityMethod: "array",                                             // array (default) | pointbuy | manual
  choices: {
    "Background Ability Score Improvement": {str: 2, con: 1},
    "Skill Proficiencies": ["insight", "persuasion"],
    "Weapon Mastery": ["longsword", "javelin"],
    "Fighting Style": "Defense",
    "Ability Score Improvement@4": {str: 1, cha: 1},                  // or {feat: "Great Weapon Master"}
    "Skillful": ["perception"], "Versatile": "Magic Initiate", "Size": "medium",
    // keys of the feat chosen above; {spells, ability} sets its casting ability (a plain list keeps the default)
    "Magic Initiate: Learn Two Cantrips": {spells: ["Guidance", "Light"], ability: "wis"},
    "Magic Initiate: Level 1 Spell": {spells: ["Healing Word"], ability: "wis"}
  },
  spells: ["Bless", "Cure Wounds", "Command"],      // prepared; cantrips go here too
  // spellbook: ["Identify", "Web"],                // a wizard's: in the book, not prepared
  startingEquipment: "A",                           // the PHB's class + background gear (B: their gold; default none)
  items: ["Emblem", {data: {name: "Prayer Beads", type: "loot"}}],   // extras; a named holy symbol picks the focus
  biography: "<p>…</p>",
  folder: "ZZ usability"}}                          // optional: an Actor folder id or name (default Foundry MCP Characters)
```

A cleric's pick is titled **`Divine Order Choice`** in the book; `"Divine Order"` works too (any title
ending in *Choice* answers to the bare title as well).

- The module runs dnd5e's own advancements (species → background → class levels → subclass), so
  HP, saves, skills, armour/weapon training, mastery, speed, darkvision, casting ability, spell
  slots and always-prepared domain spells come from the books. Nothing to compute by hand.
- **Abilities are validated**: standard array (one each of 15 14 13 12 10 8) or point buy (≤ 27,
  8–15), *before* the background's +2/+1 (or +1/+1/+1, only to the abilities the background
  allows) and level ASIs (exactly 2 points, max +2 each). Over budget is `BAD_SPEC`.
- **The dry run builds the character on an unsaved actor** — dnd5e's own advancement steps, nothing
  written — so it prints the real run's `sheet:` (HP, AC with the gear, spell DC, skills, languages,
  feats, spell counts, spell slots — a new character starts with every slot full, `slots 1st 4/4,
  2nd 3/3` / `slots pact 2/2 (3rd)`) and **every** `DEFAULTED (check)` and `WARN` line the real run will: a High
  Elf's *Detect Magic not added: already granted (race:elf-high, always prepared)*, *4 spells prepared
  of 9 — 5 slot(s) open*, a default Fighting Style, the background's tool and languages, the starting
  focus. Verified line for line against the real run (§14 of the plan). Fix those in the spec before
  the real run, not after.
- **Every problem of a character comes back at once**, as one `BAD_SPEC: character: 4 problems — (1)
  species: … (2) choices: … (3) spells: … (4) items: …`; fix them all and dry-run again. The checks:
  - every `choices` key against the advancements this build steps through (species, background,
    class levels 1..N and subclass, each only up to the character's level; what they grant; and the
    feats your choices name — so `"Magic Initiate: Learn Two Cantrips"` is known once `"Versatile":
    "Magic Initiate"` is given, and unknown with `"Versatile": "Tough"`); an unknown key lists the
    known ones (`Fighting Style@2, Ability Score Improvement@4, Skillful, …`);
  - every choice **value** the real run would refuse or quietly drop: a level ASI that is not exactly
    its points (`{str: 1, cha: 1}`) or `{feat: "<a real feat>"}` — a bare string is refused; a Fighting
    Style / Versatile / other pool pick that is not one of its options (`"Defence"` → nearest
    `Defense`, options listed); a Magic Initiate spell the books lack. A pool-less spell choice you did
    not answer (a Sage's Magic Initiate) is a `WARN … NOT CHOSEN` line with the exact shape to pass;
  - every `spells` / `spellbook` name against the PHB and the class list (`allowOffList: true` when a
    feature grants it). Spell with the class list in hand (`onList` in [`rules-lookup.md`](rules-lookup.md));
  - every `items` name and the class, subclass, species and background; a miss lists the nearest
    PHB names (`Spellbook` → `"Book"`, or pass `{data}`; `Elf` → `"Elf, Drow", "Elf, High", "Elf,
    Wood"` — species are the PHB's `Elf, High`, `Tiefling, Infernal`, `Gnome, Rock`;
    `game.pentaryn.rules.names()` lists them all).
- **Languages:** an unanswered language choice (the background's *Choose Languages*) takes the
  species' tongue (Elvish for an elf, Draconic for a dragonborn), then Common and the common ones,
  never sign language first, printed as `DEFAULTED (check)`. To choose: `"Choose Languages":
  ["elvish", "goblin"]` (the background grants Common already; naming it too is harmless). The
  `sheet:` line lists the languages as dnd5e keys, and the feats taken (`feats Tough, Savage
  Attacker, Defense`).
- `choices` keys are the advancement's title, most specific first:
  `"<item>: <title>@<level>"`, `"<title>@<level>"`, `"<item>: <title>"`, `"<title>"`, or the type
  (`"Subclass"`, `"Size"`). Values: trait words (`"ath"`, `"Perception"`, `"longsword"`), item names
  (`"Defense"`, `"Protector"`), `{str: 2}` increases, `{feat}`, `{ability: "int"}` for a granted
  spell's casting ability.
- **Anything not chosen gets a stated default** (first options in the book's order; ability
  increases to the highest allowed scores) and is printed as `DEFAULTED (check)` in the readback.
  A spell choice without a fixed list (Magic Initiate) is never guessed: it prints `NOT CHOSEN`.
- `spells` are checked against the class list (`BAD_SPEC` when off-list; `allowOffList: true` when a
  feature grants it); a spell the build already granted is skipped with a warning; counts over the
  class's prepared/cantrip limits warn, and so do open slots (`2 spells prepared of 9 — 7 open`):
  a species' or domain's always-prepared spells do not count, so fill the class's own list.
- **Gear:** `startingEquipment: "A"` adds the class's and the background's PHB gear (packs arrive
  packed, armour and weapons equipped, the gold added) — `"B"` their gold instead, `{class: "A",
  background: "B"}` each separately. "Any holy focus" takes the first in dnd5e's list (`Amulet`) as
  `DEFAULTED` unless `items` names one (`"Emblem"`, `"Reliquary"`); the background's "one gaming set"
  is the one the character is proficient in; an item already in `items` is not added twice. Without
  it, a cleric, paladin, druid, ranger, sorcerer, warlock, wizard or bard with nothing to cast through
  gets `WARN no Holy Focus — the Cleric casts through one: pass startingEquipment: "A", or items:
  ["Amulet"]`. The readback's `notes: starting equipment: …` lists what came.
- The token is actor-linked, friendly, gold `pc` ring; no owner is assigned — say so to Joe.

### Replacement-level options

`{id, with, name?, hidden?, note?, ring?, img?, disposition?}` — `ring`: `pc` (gold) | `foe` (red) |
`named` (green) | `mook` (grey) | `none`, per the token conventions in [`README.md`](README.md);
`img` replaces the token art (and is the ring subject); `disposition`: hostile | neutral | friendly |
secret. `note` is one line on **why** this choice — it is stamped into provenance and printed as
`Why:` in every later gather, so write it for the next builder.

## Writing the replacements

```js
{action: "replace", call: "pm-7f3a", dryRun: true, replacements: [
  {id: "p1", note: "boss of E1; holds the key", ring: "foe", with: {kind: "actor", uuid: "Compendium.…Goblin Boss", patch: {…}}},
  {id: "p6", name: "Kneeling Statue", with: {kind: "npc",
     npc: {name: "Basalt Guardian", creatureType: "construct", size: "large", cr: "3", hpAverage: 76,
           hpFormula: "8d10+32", acMode: "flat", acValue: 17,
           abilities: {str: 18, dex: 8, con: 18, int: 3, wis: 10, cha: 1}, biography: "<p>…</p>"},
     features: [{featureType: "save", featureName: "Earthsplitter", saveAbility: "dex", saveDC: 14,
                 damageParts: [{number: 3, denomination: 8, type: "bludgeoning"}], areaType: "radius",
                 areaSize: 10, recharge: 5}],
     patch: {traits: [{name: "Kneeling Sentinel", html: "<p>Incapacitated until the Crown is lifted.</p>"}]}}},
  {id: "p7", name: "Altar", with: {kind: "hotspot", name: "Stolen Chalice",
     description: "Dented silver chalice on the altar.",
     items: [{data: {name: "Stolen Chalice", type: "loot", system: {price: {value: 150, denomination: "gp"}}}}]}},
  {id: "p9", with: {kind: "character", …}},
  {id: "p10", with: {kind: "note", name: "Notice Board", html: "<p>Three jobs…</p><section class=\"secret\"><p>DC 12…</p></section>"}},
  {id: "p11", with: {kind: "light", config: {dim: 20, bright: 10, color: "#ff9b42", animation: {type: "torch"}}}},
  {id: "p12", with: {kind: "none", reason: "Joe's note to self, nothing to build"}}
]}
```

- Target a marker by `id` (with the gather's `call`) — preferred. **If both `id` and `markerId` are
  given, `id` wins silently**; pass one. `sceneId` + `markerId` is the
  fallback when the call has rotated out (`CALL_UNKNOWN`). A `call` id names one numbering: a
  regather after a marker moved or a door changed may renumber the board and returns a new call —
  always pair `p#`s with the call of the text you read them from.
- `name` overrides the token/pin label. `hidden: true` for anything that should not be seen yet —
  it is set explicitly on the placed token (prototype hidden does not survive placement).
- Placement is the module's job: same footprint → the marker's exact squares; different creature
  size → centred and snapped; hotspot/tile → centred, unsnapped; note/light → marker centre.
  `lockSize` and elevation are handled (a marker at elevation 10 places its replacement at 10).

## Run it

1. **Dry run** — the identical call with `dryRun: true`. Returns one plan line per prompt
   (position and placement, footprint, lockSize, hidden, what it creates: the npc and its features,
   the character's checked spells, gear and starting equipment, the patch, the hotspot's items and
   light), a character's preview `sheet:`, every `DEFAULTED` / `WARN` line, and one **estimate** line per
   encounter (`E1 (estimate, CR XP of the plan): 150 XP from 5 creature(s) vs party 4 x L5: … → under
   low`) — size the fight here, not after. Nothing is written; bad keys, items, spells, choice keys, npc
   fields, light keys and ability scores fail here, all of a replacement's at once.
   **Required for more than 5 replacements** — the tool refuses a real batch over 5 with
   `DRY_RUN_REQUIRED` unless the *identical* spec was dry-run first (same backend session). The count is every replacement in the call, valid or not.
2. **Real run** — the same call without `dryRun`. Actors and journals are made per replacement
   (an `npc`: the actor, then each feature), then everything is placed in one batch per scene,
   provenance stamped (`flags.pentaryn-prompts.provenance`), markers deleted only after their
   replacement exists.
3. **Readback** — one line per prompt: what was created (type, name, id, position) and
   `markerDeleted=true|false`; under it the `patched:` list, a character's `sheet:` (abilities,
   HP, AC, PB, spell DC, saves, skills, speed, darkvision, size, languages, feats, spell counts vs limits,
   spell slots — full on a new character),
   `DEFAULTED (check):` and `WARN:` lines; then `remaining: <sceneId>=<n>`; then one line per
   encounter built into (`remaining: unknown …` when no replacement got as far as its scene — a stale call, a bad spec — never read that as "all built"): `E1: 325 XP from 5 creature(s) vs party 4 x L3: low 600 | moderate 900 |
   high 1600 → under low` (hostile npcs only — the party and neutral/friendly NPCs do not count). A
   group with no hostile creature (the party itself, a shopkeeper) reads `E3: no hostile creature — no
   difficulty to judge`.

One failure does not block the rest. Any actor or journal made for a replacement that then failed
(npc, compendium import, copy, hotspot clone, note journal, character) is deleted again by the
module (a `cleanup:` line under it); the marker stays. An npc feature that would not add is a
`notes:` line, and the actor stays.

| Code | Meaning | Do |
|---|---|---|
| `TEXT_CHANGED` | Joe edited the prompt after your gather | regather and re-read that prompt; `force: true` only if Joe says the old text stands |
| `MARKER_GONE` | the marker is gone; the message says why — `already replaced … (now Token "…" [id])`, `resized … (now marker <id>)`, or deleted | regather |
| `CALL_UNKNOWN` | the call rotated out (last 5 gathers kept) | regather, or target by `sceneId` + `markerId` |
| `SCENE_UNKNOWN` | scene id/name not found | `list` |
| `BAD_SPEC` | the arguments are wrong; the message names the field | fix and resend |
| `DRY_RUN_REQUIRED` | over 5 replacements without a dry run (the tool: the identical spec; `replaceMany`: the same marker set, this GM page) | dry run first |
| `CREATE_FAILED` | Foundry or the npc engine refused a document | read the message; the rest went through |
| `NOT_GM` | the query came from a non-GM | should not happen through the bridge |
| `MODULE_MISSING` | `pentaryn-prompts` is not active in the GM tab | `make foundry-prompts-sync`, world restart on first install, reload the GM tab |
| `TIMEOUT` | no answer within the transport timeout (60 s for gather/replace) | gather one scene, `crops: false`; check the GM tab is in the foreground |

## Afterwards

Tell Joe what each `p#` became, by name, one line each (`p1 → Skarra Wolf-Helm, goblin boss CR 1`),
and each encounter's difficulty line. Say where new actors landed (`Foundry MCP Creatures` for
monsters and NPCs, `Foundry MCP Characters` for PCs unless `folder` named one, `Scene Props` for hotspots), every `DEFAULTED` choice he may want
different, and what still needs a hand: features you could not express, map work the prompt
implies (a hidden door, a ledge's height), art (new NPCs and PCs get the default image unless
you passed `img`; the ring tier is set per replacement).

## Troubleshooting

- **No `prompt-markers` tool** — see "First: is the tool there?" above.
- **A marker with no text** — the gather lists it as `(empty)`. Ask Joe, or replace with `none`.
  Empty fresh drops are deleted by the dialog; reopened-and-emptied ones are kept, tinted red.
- **`levels="n"` / `WARN wall heights present`** — LOS ignores wall heights and levels. Treat
  `sees`/`unseen` on that scene as approximate and say so.
- **Timeouts** — the bridge's transport timeout was a flat 10 s until the fork's per-query
  timeout (gather/crops/replace 60 s). A backend started before that build still has 10 s: see
  "Restarting only the broker" in [`README.md`](README.md).
- **Images arrive as text or not at all** — the backend predates the content passthrough. The
  crops are still on disk at the paths in the trailer; `Read` them.
- **Output cut off** — gather per scene (`scenes: ["<id>"]`), or lower `maxPrompts` and follow `next`.
- **Two GM tabs** double the module's work (two dialogs, two autosaves). One GM client.
- **Tokens stop answering hover/double-click** — the Ruler (or another non-Select) token tool is
  active; core makes every token non-interactive then. Switch back to Select. Keys typed during an
  open are held for the box (`typeahead.mjs`), so they should no longer pick tools by accident.
- **Gather on a scene with no prompts** still lists every built token as `t#` context; harmless.
- **Players never see markers:** actors are ownership NONE, SECRET disposition, tokens hidden.
- **Driving the API by hand** — the batch is `replaceMany({call, replacements, dryRun, force,
  party})` or `replaceMany({specFile, dryRun})`. `replace(spec, opts)` is ONE replacement (`spec` is `{id, with, …}`); passing a batch
  object to it is `BAD_SPEC`.

## Also see

- [`markers.md`](markers.md) — colour/number markers, the hotspot and readable recipes the
  replace follows
- [`attributes.md`](attributes.md) — turning a built NPC's biography into discoverables
- [`rules-lookup.md`](rules-lookup.md) — stat blocks, spell lists (`onList`), roll tables from the owned books
- `foundry/module/pentaryn-prompts/README.md` — the module: dialog keys, settings, API
  (`game.pentaryn.prompts`)

## Known gaps (eval round 3, not fixed in 0.4.0)

Check these on a built result; the dry run does not flag them.

- **Fixed ASI from a feat** (`{feat: "Great Weapon Master"}`): the advancement's `configuration.fixed` +1 is
  not applied and the sheet shows the unboosted score; `{str: 1}` is refused ("spend exactly 0"). Patch the
  ability by hand.
- **Starting equipment**: a compendium item added outside its pack keeps `system.container` (resolves to
  nothing); the `took` line for an AND group can print `AND:undefined`; the PHB Wizard has no Spellbook (add
  one as loot) and can get both a Staff and a Quarterstaff.
- **Choice keys**: an unsuffixed levelled key (`Weapon Mastery`) applies at every level it exists and WARNs
  at the later one; a defaulted Versatile pick can duplicate a feat the background grants (`feats Alert, Alert`).
- **`<built>` lines** do not list custom traits added by `traits`/`patch` (a Dormant Warden's defining
  mechanic) and a PC's `Carries:` includes mundane pack items; read the spec, not only the gather.
- A small stock creature on a `mid` marker becomes Medium (footprint wins) although both occupy one square.
- `replaceMany({specFile})` needs the spec directory to exist; create it first.
