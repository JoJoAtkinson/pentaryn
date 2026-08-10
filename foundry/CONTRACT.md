---
created: 2026-08-10
last-modified: 2026-08-10
tags: ["#foundry", "#vtt", "#contract", "#dnd5e"]
status: draft
---

# `actors.json` — the generator ⇄ importer contract

> The seam between **Stage 1** (`scripts/foundry/build_actors.py`, Python) and **Stage 2**
> (`foundry/module/pentaryn-importer/`, JS). Both are built against this document.
> See [`playbooks/foundry-vtt.md`](../playbooks/foundry-vtt.md) for why the pipeline is shaped
> this way (D3, D8) and what each gate protects (D10).

**Target:** Foundry **v14.365** (`generation: 14`) · dnd5e **5.3.3** · world `ardenhaven`.

**Normative language.** MUST / MUST NOT / SHOULD / MAY as in RFC 2119. Anything marked
**UNCERTAIN** is a best guess with stated reasoning — §11 collects them all in one place, and each
one is a thing to confirm in Gate 1 review or Gate 2 readback rather than trust.

**Every field name in this document was read out of installed source, not recalled.** Citation
keys used below:

| Key | File |
| --- | ---- |
| `[npc]` | `Data/systems/dnd5e/…` → `module/data/actor/npc.mjs` |
| `[attrs]` | `module/data/actor/templates/attributes.mjs` |
| `[common]` | `module/data/actor/templates/common.mjs` |
| `[traits]` | `module/data/actor/templates/traits.mjs` |
| `[base-act]` | `module/data/activity/base-activity.mjs` |
| `[attack]` | `module/data/activity/attack-data.mjs` |
| `[save]` | `module/data/activity/save-data.mjs` |
| `[util]` | `module/data/activity/utility-data.mjs` |
| `[dmg-field]` | `module/data/shared/damage-field.mjs` |
| `[uses]` | `module/data/shared/uses-field.mjs` |
| `[range]` | `module/data/shared/range-field.mjs` |
| `[target]` | `module/data/shared/target-field.mjs` |
| `[activation]` | `module/data/shared/activation-field.mjs` |
| `[consume]` | `module/data/activity/fields/consumption-targets-field.mjs` |
| `[weapon]` | `module/data/item/weapon.mjs` |
| `[feat]` | `module/data/item/feat.mjs` |
| `[desc]` | `module/data/item/templates/item-description.mjs` |
| `[config]` | `module/config.mjs` |
| `[core-token]` | Foundry `common/documents/token.mjs` |
| `[core-proto]` | Foundry `common/data/data.mjs` → `class PrototypeToken` |
| `[core-const]` | Foundry `common/constants.mjs` |
| `[core-valid]` | Foundry `common/data/validators.mjs` |

Sources were recovered from `dnd5e-compiled.mjs.map` (`sourcesContent`, 350 files) and from
`/Applications/Foundry Virtual Tabletop.app/Contents/Resources/app/`. Both are the *installed*
5.3.3 / v14.365 artefacts, not upstream `main`.

---

## 1. Top-level manifest

`foundry/build/actors.json` is a single JSON object. UTF-8, `\n` line endings, **2-space indent,
keys in the order given below** (deterministic output is what makes the golden-file test in
Gate 1 meaningful).

```jsonc
{
  "$contract": "pentaryn/actors.json@1",
  "generator": "scripts/foundry/build_actors.py",
  "generatorVersion": "1.0.0",
  "targetSystem": "dnd5e",
  "targetSystemVersion": "5.3",
  "generation": 14,
  "generatedAt": "2026-08-10T14:02:11+00:00",
  "sourceRevision": "9a4199f",
  "skipped": [ /* §2.3 */ ],
  "actors": [ /* §3 */ ]
}
```

| Field | Type | Rule |
| --- | --- | --- |
| `$contract` | string | Literal `"pentaryn/actors.json@1"`. Importer MUST refuse anything else. Bump the `@N` on any breaking change to this document. |
| `generator` | string | Repo-relative path of the producing script. Informational. |
| `generatorVersion` | string | SemVer of the generator. Bump the **minor** when emitted document shape changes; bump the **patch** for bugfixes that change no output. |
| `targetSystem` | string | Literal `"dnd5e"`. |
| `targetSystemVersion` | string | Literal `"5.3"` — `major.minor` only. |
| `generation` | integer | Literal `14`, the Foundry generation. |
| `generatedAt` | string | RFC 3339 UTC, `timespec="seconds"`, e.g. `2026-08-10T14:02:11+00:00`. Matches the `updated_at` convention already used in `actions.jsonl`. |
| `sourceRevision` | string | Short git SHA of the tree the build read. `"dirty"` MAY be appended (`"9a4199f-dirty"`). |
| `skipped` | array | Every `actions.jsonl` row **not** turned into an Item, with a reason. Gate 1 requires this to be exhaustive: `len(rows) == items_emitted + len(skipped)`. |
| `actors` | array | One entry per Foundry Actor. Sorted by `flags.pentaryn.slug`, ascending, byte order. |

### 1.1 Version gate (importer, normative)

Before creating anything the importer MUST verify **all** of:

```js
manifest.$contract === "pentaryn/actors.json@1"
manifest.targetSystem === game.system.id                                    // "dnd5e"
manifest.targetSystemVersion === game.system.version.split(".").slice(0,2).join(".")   // "5.3"
manifest.generation === game.release.generation                             // 14
```

Any mismatch → abort the whole run with a visible error. Do **not** import a subset.

`generatedAt` and `sourceRevision` MUST NOT be gated on — they change every build and would make
the gate meaningless.

---

## 2. What becomes an Actor, what becomes an Item, what is skipped

### 2.1 Actor identity — slug, and the collision rule

An Actor exists for each **NPC slug** that has (a) at least one `actions.jsonl` row and (b) at
least one `#combat-runner` markdown file. `flags.pentaryn.slug` is that slug; it is the upsert
key in Stage 2.

**Five slugs have two markdown files each** — `bandit`, `tough`, `stirge`, `giant-spider`,
`giant-wolf-spider` each appear in two encounter folders. `actions.jsonl` is keyed by slug alone,
so their Items are by construction identical, and their stat lines agree on every number (only the
armour *prose* differs, e.g. `AC 12 (leather and a work apron)` vs
`AC 12 (oilskin and a leather jerkin)`).

Therefore: **one Actor per slug.** The generator MUST:

1. Collect every markdown source for the slug into `flags.pentaryn.sources` (sorted, repo-relative).
2. Parse each independently and **compare the extracted values** (§3.2 field list).
3. **Fail the build** — non-zero exit, no output written — if any two sources disagree on
   `hp.max`, `hp.formula`, `ac.flat`, `cr`, `size`, `type.value`, `movement`, or `senses`.
   Silent last-write-wins here is exactly the class of drift D10 exists to stop.
4. Take free-text fields (the AC parenthetical, biography) from the **lexicographically first**
   source path, and record that choice in `flags.pentaryn.primarySource`.

### 2.2 Rows → Items

**One `actions.jsonl` row → exactly one Foundry Item.** A `multiattack` row with six attacks
becomes *one* Item carrying *six* attack activities — it does not fan out into six Items.

This deliberately diverges from how the dnd5e SRD compendium models monsters (separate weapon
Items per attack plus a bare "Multiattack" feat). The 1:1 row→Item invariant is what makes
Gate 1's coverage check and Stage 2's replace-embedded-Items strategy simple and checkable.
*Reverse if* the NPC sheet's attack section becomes unusable because bundled attacks don't
surface individually — then fan out and key Items by `(npc, action, attackIndex)`.

### 2.3 Skips (normative, exhaustive)

Every skip MUST append an object to the manifest's `skipped` array:

```jsonc
{ "npc": "_global", "action": "dodge", "type": "utility", "reason": "srd-universal-action",
  "detail": "scope=global; core 5e action already provided by Foundry/dnd5e" }
```

`reason` MUST come from this closed set:

| `reason` | Applies to | Count today | Rationale |
| --- | --- | --- | --- |
| `srd-universal-action` | the 8 `_global` rows (`dash`, `disengage`, `dodge`, `grapple`, `help`, `hide`, `push`, `shove_prone`) | 8 | `scope: "global"`, no owning creature, no `.md`. These are core 5e actions Foundry already surfaces. Emitting them onto all 19 NPCs would add 152 duplicate Items for zero information. *Reverse if* the at-table workflow actually wants them as clickable chips per token. |
| `pc-not-npc` | rows for `grek`, `maela`, `orren`, `vessa`, `zor-gar` | 19 | These are player characters under `world/party/black-ledger/members/`. Their `.md` is a different format (table-based, no status line) and they belong in Foundry as `character` Actors owned by players, not GM-built `npc` Actors. Detector: source path under `world/party/` **or** frontmatter `tags` lacks any `#cr-*` tag. |
| `no-markdown-source` | any row whose slug has no `#combat-runner` `.md` | 0 | Would leave an Actor with no HP/AC/CR. Fail loudly rather than invent. |
| `unmappable-field` | *(row still emitted)* — not a row skip | — | Do **not** use this for rows. Field-level losses go in `flags.pentaryn.unmapped` on the Item (§4.4). |

Anything else → the generator MUST fail rather than invent a reason code.

Expected coverage today: **96 rows = 69 Items + 27 skips** (8 `srd-universal-action` +
19 `pc-not-npc`), across **19 Actors**. The golden test SHOULD pin all four numbers.

---

## 3. Per-Actor shape

```jsonc
{
  "name": "Glacier Stalker",
  "type": "npc",
  "system": { /* §3.1 */ },
  "prototypeToken": { /* §3.3 */ },
  "items": [ /* §4 */ ],
  "flags": {
    "pentaryn": {
      "slug": "glacier-stalker",
      "contentHash": "sha256:1f0c…",
      "sources": ["world/factions/garhammar-trade-league/locations/mountin-pass/npcs/glacier-stalker.md"],
      "primarySource": "world/factions/garhammar-trade-league/locations/mountin-pass/npcs/glacier-stalker.md",
      "encounters": ["mountin-pass"]
    }
  },
  "expected": { /* §7 — NOT a Foundry field; the importer strips it before Document.create */ }
}
```

**`_id` MUST NOT be emitted.** Foundry assigns it; the upsert key is `flags.pentaryn.slug`.

**`img` MUST NOT be emitted, on Actors or on Items.** Portraits and token art are hand-curated
inside Foundry. The importer MUST NOT write `actor.img` or `prototypeToken.texture.src` on an
update, ever — doing so would destroy GM work on every re-run and break idempotence.

### 3.1 `system` — exact emitted keys

Only these keys. Nothing else. (Playbook: *"Emit the minimum. Every field you write is a field
that can drift."*)

```jsonc
"system": {
  "abilities": {},                                  // §3.4 — SEE WARNING. Normally omitted entirely.
  "attributes": {
    "hp":   { "value": 84, "max": 84, "temp": 0, "tempmax": 0, "formula": "8d10 + 40" },
    "ac":   { "calc": "flat", "flat": 16 },
    "init": { "bonus": "" },
    "movement": { "walk": "50", "climb": "40", "fly": "", "swim": "", "burrow": "",
                  "hover": false, "units": "ft" },
    "senses":   { "ranges": { "darkvision": 90, "blindsight": null,
                              "tremorsense": null, "truesight": null },
                  "units": "ft", "special": "" }
  },
  "details": {
    "cr": 5,
    "type": { "value": "beast", "subtype": "", "swarm": "", "custom": "" },
    "biography": { "value": "<p>A panther-sized predator armored in …</p>", "public": "" }
  },
  "traits": {
    "size": "med",
    "di": { "value": ["cold"], "bypasses": [], "custom": "" },
    "dr": { "value": [],       "bypasses": [], "custom": "" },
    "dv": { "value": [],       "bypasses": [], "custom": "" },
    "ci": { "value": [],                       "custom": "" }
  }
}
```

Field-by-field:

| Path | Type | Source & rule |
| --- | --- | --- |
| `attributes.hp.max` | int, `nullable` | `**HP** 84 (…)` — the bare integer. `[attrs]` `hitPoints.max`. |
| `attributes.hp.value` | int | MUST equal `max`. On **update**, the importer MUST NOT write `hp.value` (a wounded token would be healed mid-session); on **create** it writes both. |
| `attributes.hp.formula` | string, `FormulaField` | The parenthetical, normalised to spaced form: `8d10+40` → `"8d10 + 40"`. `[npc]` adds `formula` to the shared `hitPoints` block. Emit `""` if absent. |
| `attributes.ac.calc` | string | Literal **`"flat"`**. `[attrs]` `prepareArmorClass` — `case "flat": ac.value = Number(ac.flat); return;` — no armour, no Dex, no derivation. |
| `attributes.ac.flat` | int | `**AC** 16 (natural)` — the bare integer. The parenthetical goes to `flags.pentaryn.acNote`, **not** into any system field. |
| `attributes.init.bonus` | string | `""`. See §3.4. |
| `attributes.movement.*` | **strings** (`FormulaField`) | `**Speed** 50 ft., climb 40 ft.` Grammar: `(?:(walk|climb|fly|swim|burrow)\s+)?(\d+)\s*ft\.?`, bare number ⇒ `walk`. `hover` true iff `(hover)` follows a fly entry. `units` literal `"ft"`. `[attrs]`/`movement-field.mjs`. **These are FormulaFields — emit `"50"`, not `50`.** |
| `attributes.senses.ranges.*` | int or null | `**Darkvision** 90 ft.` / `Darkvision 90 ft.` (both spellings occur). Keys restricted to `blindsight, darkvision, tremorsense, truesight` (`[config]` `DND5E.senses`). `units: "ft"`. Note the v5 shape is `senses.ranges.<key>`, **not** `senses.<key>` — the flat form is a migration shim only. |
| `details.cr` | number | `**CR** 5 (1,800 XP)`. Fractions → `1/8 → 0.125`, `1/4 → 0.25`, `1/2 → 0.5`. Cross-check against the `#cr-N` / `#cr-1-8` frontmatter tag; **disagreement fails the build.** |
| `details.type.value` | string | The frontmatter creature-type tag, minus `#`. MUST be a key of `DND5E.creatureTypes`: `aberration beast celestial construct dragon elemental fey fiend giant humanoid monstrosity ooze plant undead`. Every NPC today carries exactly one (`#beast`, `#humanoid`, `#undead`). Zero or two or more matches ⇒ fail the build. |
| `details.biography.value` | HTML string | The `## Description (one line)` body, rendered to HTML. Descriptive only. `biography.public` stays `""`. |
| `traits.size` | string | **Not in the markdown.** Default `"med"`, overridable per slug (§3.5). Keys: `tiny sm med lg huge grg`. This drives token width/height (§3.3) and NPC hit-die denomination — the only place it has numeric consequences. |
| `traits.di/dr/dv` | `{value: string[], bypasses: [], custom: string}` | Damage immunity / resistance / vulnerability. `[traits]` `DamageTraitField`. `value` entries MUST be keys of `DND5E.damageTypes` (13 keys, §6.4). |
| `traits.ci` | `{value: string[], custom: string}` | Condition immunities. `SimpleTraitField` — **no `bypasses` key** (that's damage-only). `value` entries MUST be keys of `DND5E.conditionTypes`. |

**Trait parsing.** The status line uses three phrasings, all present in the corpus:

| Markdown | Emit |
| --- | --- |
| `**Cold immunity**` / `**Poison immunity**` | `di.value += ["cold"]` |
| `**Psychic resistance**` / `**Cold resistance**` | `dr.value += ["psychic"]` |
| `**Vulnerable** bludgeoning` | `dv.value += ["bludgeoning"]` |
| `**Immune** poison damage; exhaustion, poisoned` | before `;` → `di.value`; after `;` → `ci.value` |
| `**No damage resistances, no immunities, no condition immunities**` | all empty |

A token that resolves to neither a `damageTypes` nor a `conditionTypes` key MUST be dropped into
`custom` **and** recorded in `flags.pentaryn.unmapped` — never silently discarded.
`exhaustion` is a valid `conditionTypes` key in 5.3.3, so `Immune … exhaustion, poisoned` maps cleanly.

### 3.2 Not emitted, and why

| Not emitted | Why |
| --- | --- |
| `system.skills` | The status line gives totals (`Stealth +7`) but dnd5e computes skills from ability + proficiency + bonus. Writing a total into a bonus field would double-count once abilities exist. Recorded as `flags.pentaryn.skillNotes`. |
| `system.abilities[*].proficient` (saves) | Same problem: `Saves Str +7, Con +7` are totals, and recovering "is this proficient" from a total requires knowing the ability score. See §3.4. |
| `attributes.hd`, `attributes.prof`, `details.xp` | Derived. `[npc]` line 381: `attributes.prof = Proficiency.calculateMod(max(cr, level, 1))`. Setting `details.cr` correctly is the whole job. |
| `details.alignment`, `source`, `resources.legact/legres/lair` | Not in the source data. Foundry defaults are correct (0 legendary actions). |
| `system.attributes.death`, `spellcasting`, `concentration` | Irrelevant to NPCs built this way. |

### 3.3 `prototypeToken` (Gate 2 checks this explicitly)

The prototype-token block is a Gate 2 assertion because *"wrong defaults surface mid-session and
no other gate catches them."* Emit exactly:

```jsonc
"prototypeToken": {
  "name": "Glacier Stalker",
  "displayName": 20,
  "displayBars": 40,
  "actorLink": false,
  "disposition": -1,
  "width": 1,
  "height": 1,
  "bar1": { "attribute": "attributes.hp" },
  "bar2": { "attribute": null },
  "sight": { "enabled": true, "range": 90, "visionMode": "basic" },
  "lockRotation": true,
  "appendNumber": true,
  "prependAdjective": false
}
```

| Field | Value | Source |
| --- | --- | --- |
| `displayName` | `20` = `OWNER_HOVER` | `[core-const]` `TOKEN_DISPLAY_MODES = {NONE:0, CONTROL:10, OWNER_HOVER:20, HOVER:30, OWNER:40, ALWAYS:50}`. Name visible to the GM on hover, hidden from players. |
| `displayBars` | `40` = `OWNER` | HP bar visible to owners (the GM) only. Players must not read monster HP. |
| `disposition` | `-1` = `HOSTILE` | `[core-const]` `TOKEN_DISPOSITIONS = {SECRET:-2, HOSTILE:-1, NEUTRAL:0, FRIENDLY:1}`. Also Foundry's own default; stated explicitly so a future default change can't move it. |
| `actorLink` | `false` | Each token gets its own HP. Mandatory for mobs — three linked goblins share one HP pool. |
| `width` / `height` | from `traits.size` | `[traits]` `preCreateSize`: dnd5e sets these from `actorSizes[size].token ?? 1` **only if the create payload does not already contain `prototypeToken.width`**. We set them explicitly so the value is in the committed JSON and diffable. Map: `tiny → 0.5`, `sm → 1`, `med → 1`, `lg → 2`, `huge → 3`, `grg → 4`. |
| `bar1.attribute` | `"attributes.hp"` | dnd5e's `system.json` declares `primaryTokenAttribute: "attributes.hp"`. Emitted explicitly rather than relying on the initialiser (which reads `game.system` and so is environment-dependent). |
| `bar2.attribute` | `null` | No secondary bar — dnd5e declares no `secondaryTokenAttribute`. |
| `sight.enabled` | `true` | |
| `sight.range` | max of `senses.ranges.*`, else `0` | Darkvision 90 ⇒ 90. Token vision range in **feet** (grid `units: "ft"`, `distance: 5` per `system.json`). |
| `sight.visionMode` | `"basic"` | Foundry's initial value. Deliberately **not** `"darkvision"` — the mode is a *rendering* effect; the range is what matters for a GM-controlled token. **UNCERTAIN (U6)**. |
| `lockRotation` | `true` | Top-down tokens shouldn't spin on move. |
| `appendNumber` | `true` | Three giant spiders become "Giant Spider 1/2/3" automatically — matches the runner's numbered-combatant model. |

**MUST NOT emit:** `texture` (art is hand-curated), `detectionModes`, `light`, `ring`,
`turnMarker`, `movementAction`, `randomImg`.

> ⚠️ **v14 trap:** `detectionModes` changed from an `ArrayField` in v12/v13 to a
> **`TypedObjectField`** in v14 (`[core-token]`). Any code carried over from a v13 example that
> passes an array will be silently coerced or stripped. We avoid it entirely; the importer MUST
> NOT write it.

`PrototypeToken` accepts only this key set (`[core-proto]`): `name, displayName, actorLink,
width, height, depth, texture, lockRotation, rotation, alpha, disposition, displayBars, bar1,
bar2, light, sight, detectionModes, occludable, ring, turnMarker, movementAction, flags,
randomImg, appendNumber, prependAdjective`. Anything else — `x`, `y`, `elevation`, `_id`,
`actorId`, `hidden`, `scale` — is stripped without error.

### 3.4 ⚠️ `system.abilities` — deliberately omitted

**Default: the `abilities` key is not emitted at all.** dnd5e's `initialKeys` gives every ability
`value: 10` (`[common]`), i.e. modifier `+0`.

Reasoning: no `#combat-runner` markdown records ability scores. Recovering them from the status
line would mean inverting `Saves Str +7, Con +7` through an assumed proficiency — a derivation,
and an ambiguous one (Str 18 + proficient, or Str 24 + not). The playbook is explicit:
*"Pre-compute every roll … No ability-score derivations."* Every number this pipeline cares about
is already flat: attack bonuses via `attack.flat = true`, save DCs via flat `dc.calculation`.

**What this costs:** initiative rolls at `+0` (dnd5e adds the Dex modifier), and ability checks /
saving throws rolled *from the NPC sheet* at `+0`. Both are GM-side conveniences the combat runner
already covers. The generator MUST record this once per actor:

```jsonc
"flags": { "pentaryn": { "notes": ["abilities-omitted: no ability scores in source markdown"] } }
```

If it later matters, the override file (§3.5) is the supported way in — `abilities` there is
emitted verbatim and unvalidated beyond key names.

### 3.5 Per-slug overrides

Optional `foundry/overrides/<slug>.yml`, merged over the parsed values (deep merge, override wins):

```yaml
# foundry/overrides/glacier-stalker.yml
traits:
  size: lg
abilities:
  str: { value: 18 }
  dex: { value: 15 }
attributes:
  init: { bonus: "+2" }
items:
  frozen_bile:                 # keyed by actions.jsonl `action`
    attackClassification: spell
```

Rules: the file is committed; unknown top-level keys fail the build; every override the build
consumed MUST be listed in `flags.pentaryn.overridesApplied` so it shows in the JSON diff. If no
override file exists for a slug, `overridesApplied` is `[]`.

---

## 4. Per-Item shape

### 4.1 Item type selection

| `actions.jsonl` `type` | Foundry Item `type` | `system.type` | Why |
| --- | --- | --- | --- |
| `single_attack` | `weapon` | `{ "value": "natural", "baseItem": "" }` | Surfaces in the NPC sheet's attack section. `"natural"` is right for claws/bites and harmless for a scimitar — `[weapon]` only uses `type.value` for `attackClassification`/`availableAbilities`/`attackType`, all of which are dead code under `attack.flat = true`. |
| `multiattack` | `feat` | `{ "value": "monster", "subtype": "" }` | Multiple attack activities on one Item; `feat` avoids the weapon `proficient`/`damage.base` machinery entirely. |
| `area` | `feat` | `{ "value": "monster", "subtype": "" }` | |
| `utility` | `feat` | `{ "value": "monster", "subtype": "" }` | |
| `reaction` | `feat` | `{ "value": "monster", "subtype": "" }` | |

`"monster"` is a real key of `DND5E.featureTypes` (`[config]` line 1801: `background, class,
monster, race, …`).

### 4.2 Common Item envelope

```jsonc
{
  "name": "Glacial Roar",
  "type": "feat",
  "system": {
    "description": { "value": "<p>…</p>", "chat": "" },
    "type": { "value": "monster", "subtype": "" },
    "uses": { "spent": 0, "max": "1",
              "recovery": [ { "period": "recharge", "type": "recoverAll", "formula": "5" } ] },
    "activities": { "<16-char-id>": { … } }
  },
  "flags": {
    "pentaryn": {
      "npc": "glacier-stalker",
      "action": "glacial_roar",
      "rowType": "area",
      "unmapped": []
    }
  }
}
```

- **`_id` MUST NOT be emitted.** Items are matched by `flags.pentaryn.action` within the actor,
  and Stage 2 replaces the embedded Item set wholesale.
- **`img` MUST NOT be emitted** (§3).
- `name` — derived from the `action` key: `_` → space, title-case each word except the stopword
  set `{of, the, a, an, and, or, to, in, on, at, for, with, vs}` (never the first word).
  `glacial_roar → "Glacial Roar"`, `he_has_a_wife → "He Has a Wife"`,
  `shove_prone → "Shove Prone"`. Deterministic, no lookup table.
- `system.description.value` — `narration`, `effect`, `prerequisite`, and any `rider_on_hit` text,
  rendered from Markdown to HTML and concatenated in that order under `<p>`/`<strong>` headings.
  This is where all the unmodellable prose lands (§6.5). `description.chat` stays `""`.
  `[desc]` — the field is `description: {value, chat}`; there is no `description.unidentified`
  on `feat`.
- `system.identifier` — MUST NOT be emitted (dnd5e derives a slug from the name).

### 4.3 Uses / recharge / slots (Item level, not activity level)

`recharge` and `slots` describe the **feature**, so they live on `system.uses` of the Item and the
activity consumes them via `consumption.targets`.

| Source | `system.uses` | Activity `consumption.targets` |
| --- | --- | --- |
| `recharge: 5` | `{spent: 0, max: "1", recovery: [{period: "recharge", type: "recoverAll", formula: "5"}]}` | `[{type: "itemUses", target: "", value: "1", scaling: {mode: "", formula: ""}}]` |
| `slots: {count: 3, refresh: "long_rest"}` | `{spent: 0, max: "3", recovery: [{period: "lr", type: "recoverAll", formula: ""}]}` | same |
| neither | omit `uses` entirely | `[]` |

- `max` is a `FormulaField` (`[uses]`) — **string**, `"3"` not `3`.
- `period: "recharge"` is special-cased in `[uses]` `prepareData`: it forces `type = "recoverAll"`
  and produces `labels.recharge = "Recharge [5+]"` when `formula < 6`. It is *not* a key of
  `DND5E.limitedUsePeriods` — it is the extra option appended by `limitedUsePeriods.recoveryOptions`.
- `consumption.targets[].target: ""` → `[consume]` `consumeItemUses` line 241:
  `const item = this.target ? this.actor.items.get(this.target) : this.item;` — blank means
  "this Item". Confirmed, not assumed.

`slots.refresh` → `limitedUsePeriods` key. Valid keys are `lr sr day dawn dusk initiative
turnStart turnEnd turn`:

| `refresh` | period | n | Confidence |
| --- | --- | --- | --- |
| `long_rest` | `lr` | 10 | exact |
| `short_rest` | `sr` | 2 | exact |
| `round` | `turnStart` | 3 | **UNCERTAIN (U1)** — no `round` period exists; `turnStart` is the closest ("refreshes at the start of its turn", which is how the runner treats it). |
| `encounter` | `initiative` | 1 | **UNCERTAIN (U2)** — `initiative` recovers when initiative is rolled, i.e. once per combat. Semantically right; `type: "special"` in config, so verify it actually fires. |

### 4.4 `flags.pentaryn.unmapped`

Any field of the source row that carries meaning the Foundry document cannot represent MUST be
listed here, so the loss is visible in the committed JSON rather than discovered at the table:

```jsonc
"unmapped": [
  { "field": "prerequisite", "reason": "free-prose, not machine-readable",
    "renderedInto": "system.description.value" },
  { "field": "attacks[2].rider_on_hit", "reason": "free-prose rider",
    "renderedInto": "system.description.value" }
]
```

`reason` is free text. `renderedInto` is either a document path or the literal `null` when the
content is genuinely dropped (which SHOULD never happen — prose can always go into the description).

---

## 5. Activities

### 5.1 Activity ids — 16 chars, and **deterministic**

Activity ids are keys of `system.activities` **and** MUST be repeated as the activity's own `_id`
(`[base-act]` line 46: `_id: new DocumentIdField({initial: () => foundry.utils.randomID()})`).
`randomID()` defaults to length **16** (Foundry `common/utils/helpers.mjs:1253`), and
`DocumentIdField._validateType` calls `isValidId`, which is `/^[a-zA-Z0-9]{16}$/`
(`[core-valid]:8`). Anything else throws.

Foundry generates these randomly. **We must not** — a random id per build changes `actors.json`
every run, which breaks the golden-file test and makes every `contentHash` differ. So:

```python
ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"  # 62 chars, Foundry's

def activity_id(npc: str, action: str, index: int) -> str:
    digest = hashlib.sha256(f"pentaryn/activity/{npc}/{action}/{index}".encode()).digest()
    n = int.from_bytes(digest, "big")
    out = []
    for _ in range(16):
        n, r = divmod(n, 62)
        out.append(ALPHABET[r])
    return "".join(out)
```

Stable across builds, unique per `(npc, action, index)`, always matches `isValidId`. The generator
MUST assert uniqueness across the whole file and MUST assert the regex before writing.

`index` is the activity's ordinal within the Item, from 0.

### 5.2 Shared activity envelope

Every activity carries these, regardless of type:

```jsonc
{
  "_id": "<same as the map key>",
  "type": "attack" | "save" | "utility",
  "name": "Claw 1",
  "sort": 0,                          // IntegerSortField; 0, 100000, 200000, … in emission order
  "activation": { "type": "action", "value": null, "condition": "", "override": true },
  "consumption": { "targets": [], "scaling": { "allowed": false, "max": "" }, "spellSlot": false },
  "description": { "chatFlavor": "" },
  "duration": { "units": "inst", "value": "", "special": "", "concentration": false, "override": true },
  "effects": [],
  "range":  { "value": "", "units": "self", "special": "", "override": false },
  "target": { "affects": { "count": "", "type": "creature", "choice": false, "special": "" },
              "template": { "type": "", "count": "", "size": "", "width": "", "height": "",
                            "units": "ft", "contiguous": false, "stationary": false },
              "override": true, "prompt": true },
  "uses": { "spent": 0, "max": "", "recovery": [] }
}
```

Notes that are load-bearing:

- **`override` semantics** (`[base-act]` `_setOverride`, line 836): when `override` is `false`
  **and** the parent Item's `system` has a same-named property, the activity's block is
  **overwritten by the Item's**. Weapons have `system.range` — so an attack activity on a weapon
  MUST use `range.override: false` and let the Item's `system.range` be the single source. Feats
  have no `system.range`, so `canOverride` is false and the activity's own values stand
  (`override` value is then irrelevant; emit `false`).
- **`activation.type`** — MUST be a key of `DND5E.activityActivationTypes` (`[config]:994`), whose
  complete set is `action bonus reaction minute hour day longRest shortRest encounter turnStart
  turnEnd legendary mythic lair crew special`. We use only `action`, `bonus`, `reaction`, `special`.
- **`duration.units`** — `"inst"` (`DND5E.specialTimePeriods`) or a `DND5E.timeUnits` key
  (`turn round second minute hour day week month year`). `"inst"` unless the source prose gives a
  duration.
- **`consumption.spellSlot`** defaults to `true` (`[base-act]:62`). Emit `false` — NPCs here have
  no spell slots, and leaving it true invites a slot prompt on use.
- **`uses`** at *activity* level is separate from Item-level `uses`. We use the Item level (§4.3)
  and leave the activity's empty.
- `duration.units: "inst"` for everything except where the source prose says otherwise; duration
  is descriptive only here.

### 5.3 The two traps, encoded

```jsonc
"attack": { "ability": "none", "bonus": "7", "flat": true,
            "critical": { "threshold": null },
            "type": { "value": "melee", "classification": "weapon" } }
```

**Why `flat: true` is sufficient** — `[attack]` `getAttackData()` line 261:

```js
if ( this.attack.flat ) return CONFIG.Dice.BasicRoll.constructParts({ toHit: this.attack.bonus }, rollData);
```

It returns *before* assembling ability mod, proficiency, item bonus or actor bonuses. `labels.toHit`
is then `simplifyRollFormula` of that single part (line 215), so `bonus: "7"` displays exactly `+7`.

**`bonus` is a `FormulaField` — a string.** `"7"`, never `7`.

**`ability: "none"`** — `[attack]` `get ability()` line 50 returns `null` for `"none"`, which keeps
`@mod` out of roll data. Belt and braces alongside `flat`.

**Item-level `proficient: 0`** — `weapon` only (`[weapon]` line 72: `proficient` has
`initial: null`, and `null` means auto-detect). `feat` has no `proficient` field at all
(`[feat]` schema), so it is not emitted there — emitting it would be silently stripped.

```jsonc
"save": { "ability": ["con"], "dc": { "calculation": "", "formula": "15" } }
```

**Flat DC**: `[save]` `prepareFinalData` — `if (this.save.dc.calculation) ability = this.ability;
else this.save.dc.value = simplifyBonus(this.save.dc.formula, rollData);`. An **empty-string**
`calculation` is what selects flat/custom mode. `"flat"` is *not* a valid value here.
`prepareData` rewrites the schema initial `"initial"` to `""` for non-spells, but emit `""`
explicitly — never rely on that rewrite.

`save.ability` is a **`SetField`** (`[save]`), i.e. an **array**, of lowercase ability keys.
`actions.jsonl` writes `"Con"` (capitalised) in `save.ability`/`attacker_save.ability` and
`"str"`/`"wis"` (lowercase) in `apply_condition_on_hit.save_ability` — the generator MUST
lowercase and validate against `str dex con int wis cha` before emitting.

### 5.4 Damage parts

`damage.parts[]` entries are `DamageData` (`[dmg-field]`):

```jsonc
{ "number": 1, "denomination": 8, "bonus": "4", "types": ["slashing"],
  "custom": { "enabled": false, "formula": "" },
  "scaling": { "mode": "", "number": 1, "formula": "" } }
```

- `number` / `denomination` are **integers** parsed from the `NdM` string (`actions.jsonl`
  enforces bare `NdM` — no modifier, no flat numbers).
- `bonus` is a `FormulaField` — string. `damage_modifier: 4` → `"4"`; `0` → `""`.
- `types` is a `SetField` — array. One entry.
- `attacks[].extra_damage` becomes a **second part** on the same activity:
  `{number, denomination, bonus: "", types: [extra_damage.type], …}`.
  There is no `modifier` in any `extra_damage` in the corpus; if one appears, it goes to `bonus`.
- `damage.includeBase: false` on attack activities. `[attack]` `prepareFinalData` would otherwise
  unshift the weapon's `system.damage.base` — a no-op today (we leave `damage.base` empty) but an
  explicit `false` removes the coupling.

---

## 6. Complete known-good examples, one per `actions.jsonl` type

Each is a real row, transformed. `…` never appears — these are complete documents.

### 6.1 `single_attack` — `skeleton.shortbow`

<details open><summary>Source row</summary>

```json
{"npc":"skeleton","action":"shortbow","type":"single_attack","scope":"self",
 "verbs":["shortbow","bow","shoot","ranged","arrow","loose"],"range":"80/320 ft",
 "prerequisite":"Provoked, but no reachable target -- the PC is on a cairn, a ledge, or across a gap. …",
 "narration":"It draws a warped bow with fingers that are more sinew than flesh, and looses.",
 "priority":7,
 "attacks":[{"name":"Shortbow","to_hit_bonus":4,"damage":"1d6","damage_modifier":2,"damage_type":"piercing"}],
 "updated_at":"2026-08-09T18:10:19+00:00"}
```
</details>

```jsonc
{
  "name": "Shortbow",
  "type": "weapon",
  "system": {
    "description": {
      "value": "<p><em>It draws a warped bow with fingers that are more sinew than flesh, and looses.</em></p><p><strong>Prerequisite:</strong> Provoked, but no reachable target — the PC is on a cairn, a ledge, or across a gap. The skeleton will not climb or leave high ground to chase.</p>",
      "chat": ""
    },
    "type": { "value": "natural", "baseItem": "" },
    "proficient": 0,
    "equipped": true,
    "properties": [],
    "range": { "value": 80, "long": 320, "reach": null, "units": "ft" },
    "activities": {
      "Qm4xZb2rT9kLpW7v": {
        "_id": "Qm4xZb2rT9kLpW7v",
        "type": "attack",
        "name": "Shortbow",
        "sort": 0,
        "activation": { "type": "action", "value": null, "condition": "", "override": true },
        "consumption": { "targets": [], "scaling": { "allowed": false, "max": "" }, "spellSlot": false },
        "description": { "chatFlavor": "" },
        "duration": { "units": "inst", "value": "", "special": "", "concentration": false, "override": true },
        "effects": [],
        "range": { "value": "", "units": "self", "special": "", "override": false },
        "target": {
          "affects": { "count": "1", "type": "creature", "choice": false, "special": "" },
          "template": { "type": "", "count": "", "size": "", "width": "", "height": "",
                        "units": "ft", "contiguous": false, "stationary": false },
          "override": true, "prompt": true
        },
        "uses": { "spent": 0, "max": "", "recovery": [] },
        "attack": {
          "ability": "none",
          "bonus": "4",
          "flat": true,
          "critical": { "threshold": null },
          "type": { "value": "ranged", "classification": "weapon" }
        },
        "damage": {
          "critical": { "bonus": "" },
          "includeBase": false,
          "parts": [
            { "number": 1, "denomination": 6, "bonus": "2", "types": ["piercing"],
              "custom": { "enabled": false, "formula": "" },
              "scaling": { "mode": "", "number": 1, "formula": "" } }
          ]
        }
      }
    }
  },
  "flags": {
    "pentaryn": {
      "npc": "skeleton", "action": "shortbow", "rowType": "single_attack",
      "unmapped": [
        { "field": "prerequisite", "reason": "free-prose, not machine-readable",
          "renderedInto": "system.description.value" },
        { "field": "priority", "reason": "combat-runner action ordering; no Foundry equivalent",
          "renderedInto": null },
        { "field": "verbs", "reason": "combat-runner grammar tokens; no Foundry equivalent",
          "renderedInto": null },
        { "field": "scope", "reason": "combat-runner targeting scope; no Foundry equivalent",
          "renderedInto": null }
      ]
    }
  }
}
```

Note `activity.range.override: false` with the range on `system.range` — the weapon is the single
source, per §5.2.

### 6.2 `multiattack` — `glacier-stalker.multiattack`

Three attacks → one `feat` Item, three attack activities. The third carries
`apply_condition_on_hit`, which becomes a **fourth activity** of type `save` (a rider), because a
dnd5e attack activity has no "save-or-be-grappled on hit" field.

```jsonc
{
  "name": "Multiattack",
  "type": "feat",
  "system": {
    "description": {
      "value": "<p><em>It lunges, raking with two crystalline claws and snapping its rime-fanged maw.</em></p><p><strong>Bite rider:</strong> on a hit, the target must make a DC 15 Strength saving throw or be <strong>grappled</strong>.</p>",
      "chat": ""
    },
    "type": { "value": "monster", "subtype": "" },
    "activities": {
      "Hd7pKr3nX2vQmB9c": {
        "_id": "Hd7pKr3nX2vQmB9c",
        "type": "attack", "name": "Claw 1", "sort": 0,
        "activation": { "type": "action", "value": null, "condition": "", "override": true },
        "consumption": { "targets": [], "scaling": { "allowed": false, "max": "" }, "spellSlot": false },
        "description": { "chatFlavor": "" },
        "duration": { "units": "inst", "value": "", "special": "", "concentration": false, "override": true },
        "effects": [],
        "range": { "value": "5", "units": "ft", "special": "", "override": false },
        "target": {
          "affects": { "count": "1", "type": "creature", "choice": false, "special": "" },
          "template": { "type": "", "count": "", "size": "", "width": "", "height": "",
                        "units": "ft", "contiguous": false, "stationary": false },
          "override": true, "prompt": true
        },
        "uses": { "spent": 0, "max": "", "recovery": [] },
        "attack": { "ability": "none", "bonus": "7", "flat": true,
                    "critical": { "threshold": null },
                    "type": { "value": "melee", "classification": "weapon" } },
        "damage": { "critical": { "bonus": "" }, "includeBase": false,
                    "parts": [ { "number": 1, "denomination": 8, "bonus": "4", "types": ["slashing"],
                                 "custom": { "enabled": false, "formula": "" },
                                 "scaling": { "mode": "", "number": 1, "formula": "" } } ] }
      },
      "Ls9wTf4jY6zRnA1e": {
        "_id": "Ls9wTf4jY6zRnA1e",
        "type": "attack", "name": "Claw 2", "sort": 100000,
        "activation": { "type": "action", "value": null, "condition": "", "override": true },
        "consumption": { "targets": [], "scaling": { "allowed": false, "max": "" }, "spellSlot": false },
        "description": { "chatFlavor": "" },
        "duration": { "units": "inst", "value": "", "special": "", "concentration": false, "override": true },
        "effects": [],
        "range": { "value": "5", "units": "ft", "special": "", "override": false },
        "target": {
          "affects": { "count": "1", "type": "creature", "choice": false, "special": "" },
          "template": { "type": "", "count": "", "size": "", "width": "", "height": "",
                        "units": "ft", "contiguous": false, "stationary": false },
          "override": true, "prompt": true
        },
        "uses": { "spent": 0, "max": "", "recovery": [] },
        "attack": { "ability": "none", "bonus": "7", "flat": true,
                    "critical": { "threshold": null },
                    "type": { "value": "melee", "classification": "weapon" } },
        "damage": { "critical": { "bonus": "" }, "includeBase": false,
                    "parts": [ { "number": 1, "denomination": 8, "bonus": "4", "types": ["slashing"],
                                 "custom": { "enabled": false, "formula": "" },
                                 "scaling": { "mode": "", "number": 1, "formula": "" } } ] }
      },
      "Cv2mQx8bN5hJt3Ru": {
        "_id": "Cv2mQx8bN5hJt3Ru",
        "type": "attack", "name": "Bite", "sort": 200000,
        "activation": { "type": "action", "value": null, "condition": "", "override": true },
        "consumption": { "targets": [], "scaling": { "allowed": false, "max": "" }, "spellSlot": false },
        "description": { "chatFlavor": "" },
        "duration": { "units": "inst", "value": "", "special": "", "concentration": false, "override": true },
        "effects": [],
        "range": { "value": "5", "units": "ft", "special": "", "override": false },
        "target": {
          "affects": { "count": "1", "type": "creature", "choice": false, "special": "" },
          "template": { "type": "", "count": "", "size": "", "width": "", "height": "",
                        "units": "ft", "contiguous": false, "stationary": false },
          "override": true, "prompt": true
        },
        "uses": { "spent": 0, "max": "", "recovery": [] },
        "attack": { "ability": "none", "bonus": "6", "flat": true,
                    "critical": { "threshold": null },
                    "type": { "value": "melee", "classification": "weapon" } },
        "damage": { "critical": { "bonus": "" }, "includeBase": false,
                    "parts": [ { "number": 2, "denomination": 10, "bonus": "4", "types": ["piercing"],
                                 "custom": { "enabled": false, "formula": "" },
                                 "scaling": { "mode": "", "number": 1, "formula": "" } } ] }
      },
      "Gt6yPw1sD4kFz8Xa": {
        "_id": "Gt6yPw1sD4kFz8Xa",
        "type": "save", "name": "Bite — Grapple (rider)", "sort": 300000,
        "activation": { "type": "special", "value": null,
                        "condition": "On a hit with Bite", "override": true },
        "consumption": { "targets": [], "scaling": { "allowed": false, "max": "" }, "spellSlot": false },
        "description": { "chatFlavor": "" },
        "duration": { "units": "inst", "value": "", "special": "", "concentration": false, "override": true },
        "effects": [],
        "range": { "value": "5", "units": "ft", "special": "", "override": false },
        "target": {
          "affects": { "count": "1", "type": "creature", "choice": false, "special": "" },
          "template": { "type": "", "count": "", "size": "", "width": "", "height": "",
                        "units": "ft", "contiguous": false, "stationary": false },
          "override": true, "prompt": true
        },
        "uses": { "spent": 0, "max": "", "recovery": [] },
        "save": { "ability": ["str"], "dc": { "calculation": "", "formula": "15" } },
        "damage": { "onSave": "none", "parts": [] }
      }
    }
  },
  "flags": {
    "pentaryn": {
      "npc": "glacier-stalker", "action": "multiattack", "rowType": "multiattack",
      "unmapped": [
        { "field": "attacks[2].apply_condition_on_hit.condition",
          "reason": "dnd5e has no automatic condition application from an attack hit; emitted as a companion save activity plus prose",
          "renderedInto": "system.activities.Gt6yPw1sD4kFz8Xa + system.description.value" },
        { "field": "verbs", "reason": "combat-runner grammar tokens; no Foundry equivalent", "renderedInto": null }
      ]
    }
  }
}
```

> `activation.type: "special"` is used for the rider. `"special"` **is** a valid key of
> `DND5E.activityActivationTypes` (`[config]:994` — the full set is `action bonus reaction minute
> hour day longRest shortRest encounter turnStart turnEnd legendary mythic lair crew special`), so
> this is a listed value, not an improvisation. The trigger text rides in `activation.condition`.

> `apply_condition_on_hit.duration_rounds` (present on 2 of 4) has **no** representation — dnd5e
> would need an ActiveEffect with a duration, and authoring effects is out of scope for Stage 1.
> It goes in `unmapped` with `renderedInto: "system.description.value"`.

### 6.3 `area` — `glacier-stalker.glacial_roar`

```jsonc
{
  "name": "Glacial Roar",
  "type": "feat",
  "system": {
    "description": {
      "value": "<p><em>Throws its head back and bellows a wave of stinging frost.</em></p><p><strong>Area:</strong> 30-ft cone.</p>",
      "chat": ""
    },
    "type": { "value": "monster", "subtype": "" },
    "uses": {
      "spent": 0,
      "max": "1",
      "recovery": [ { "period": "recharge", "type": "recoverAll", "formula": "5" } ]
    },
    "activities": {
      "Rk8nVc5qJ2wXd7Bm": {
        "_id": "Rk8nVc5qJ2wXd7Bm",
        "type": "save",
        "name": "Glacial Roar",
        "sort": 0,
        "activation": { "type": "action", "value": null, "condition": "", "override": true },
        "consumption": {
          "targets": [ { "type": "itemUses", "target": "", "value": "1",
                         "scaling": { "mode": "", "formula": "" } } ],
          "scaling": { "allowed": false, "max": "" },
          "spellSlot": false
        },
        "description": { "chatFlavor": "" },
        "duration": { "units": "inst", "value": "", "special": "", "concentration": false, "override": true },
        "effects": [],
        "range": { "value": "", "units": "self", "special": "", "override": false },
        "target": {
          "affects": { "count": "", "type": "creature", "choice": false, "special": "" },
          "template": { "type": "cone", "count": "1", "size": "30", "width": "", "height": "",
                        "units": "ft", "contiguous": false, "stationary": false },
          "override": true, "prompt": true
        },
        "uses": { "spent": 0, "max": "", "recovery": [] },
        "save": { "ability": ["con"], "dc": { "calculation": "", "formula": "15" } },
        "damage": {
          "onSave": "half",
          "parts": [
            { "number": 8, "denomination": 6, "bonus": "", "types": ["cold"],
              "custom": { "enabled": false, "formula": "" },
              "scaling": { "mode": "", "number": 1, "formula": "" } }
          ]
        }
      }
    }
  },
  "flags": {
    "pentaryn": {
      "npc": "glacier-stalker", "action": "glacial_roar", "rowType": "area",
      "unmapped": []
    }
  }
}
```

**Area parsing** — `target.template.type` MUST be a key of `DND5E.areaTargetTypes` (`[config]:2797`):
`circle cone cube cylinder line radius sphere square wall`. `sizes` per type decides which of
`size`/`width`/`height` is meaningful. The corpus has four distinct strings, all free prose:

| `area` string | `template` | Confidence |
| --- | --- | --- |
| `30-ft cone` | `{type: "cone", size: "30"}` | exact |
| `20-ft radius around the Ancestor-Stir` | `{type: "radius", size: "20"}` | good — `radius` is dnd5e's "emanation", which is what "around the creature" means |
| `20-ft radius, 40-ft tall cylinder (instantaneous)` | `{type: "cylinder", size: "20", height: "40"}` | good — `cylinder.sizes = ["radius","height"]` |
| `5-ft radius, 40-ft tall cylinder (concentration, 1 minute)` | `{type: "cylinder", size: "5", height: "40"}` + `duration: {units: "minute", value: "1", concentration: true, override: true}` | good |

Grammar the generator MUST implement, applied in order; **anything that matches none of these is a
build failure**, not a silent default:

```
^(\d+)-ft cone$
^(\d+)-ft radius(?: around .*)?$
^(\d+)-ft radius, (\d+)-ft tall cylinder(?: \((.*)\))?$
^(\d+)-ft (?:line|cube|square|sphere)$          # not present today; accept for forward safety
```

`save.on_save: "half"` → `damage.onSave: "half"`. `[save]` schema: `onSave` is
`StringField({required: true, blank: false, initial: "half"})`; the values dnd5e uses are
`"half"`, `"none"`, `"full"`.

### 6.4 `utility` — `glacier-stalker.snow_vanish`

`roll: {label, dice, modifier, notes}` → a **utility** activity with a formula.
`[util]`: `roll: {formula, name, prompt, visible}`.

```jsonc
{
  "name": "Snow Vanish",
  "type": "feat",
  "system": {
    "description": {
      "value": "<p><em>Folds itself into a snowdrift; only the steam of its breath gives it away.</em></p><p><strong>Prerequisite:</strong> snowy or icy terrain.</p><p><strong>Note:</strong> Compare result to each PC's passive Perception; PCs whose PP &gt; result are fooled.</p>",
      "chat": ""
    },
    "type": { "value": "monster", "subtype": "" },
    "activities": {
      "Zp3fJd9tM6cVy1Kw": {
        "_id": "Zp3fJd9tM6cVy1Kw",
        "type": "utility",
        "name": "Snow Vanish",
        "sort": 0,
        "activation": { "type": "bonus", "value": null, "condition": "snowy or icy terrain", "override": true },
        "consumption": { "targets": [], "scaling": { "allowed": false, "max": "" }, "spellSlot": false },
        "description": { "chatFlavor": "" },
        "duration": { "units": "inst", "value": "", "special": "", "concentration": false, "override": true },
        "effects": [],
        "range": { "value": "", "units": "self", "special": "", "override": false },
        "target": {
          "affects": { "count": "", "type": "self", "choice": false, "special": "" },
          "template": { "type": "", "count": "", "size": "", "width": "", "height": "",
                        "units": "ft", "contiguous": false, "stationary": false },
          "override": true, "prompt": true
        },
        "uses": { "spent": 0, "max": "", "recovery": [] },
        "roll": { "formula": "1d20 + 6", "name": "Stealth", "prompt": false, "visible": true }
      }
    }
  },
  "flags": {
    "pentaryn": {
      "npc": "glacier-stalker", "action": "snow_vanish", "rowType": "utility",
      "unmapped": [
        { "field": "roll.notes", "reason": "GM-facing guidance", "renderedInto": "system.description.value" },
        { "field": "prerequisite", "reason": "free-prose", "renderedInto": "system.activities.Zp3fJd9tM6cVy1Kw.activation.condition + system.description.value" },
        { "field": "verbs", "reason": "combat-runner grammar tokens; no Foundry equivalent", "renderedInto": null }
      ]
    }
  }
}
```

`roll.formula` composition: `f"{roll.dice} + {roll.modifier}"` when `modifier > 0`,
`f"{roll.dice} - {abs(modifier)}"` when negative, bare `roll.dice` when `0`. `roll.name` is
`roll.label` **truncated at the first `(`** — `"Undead Fortitude (Con save, +3)"` → `"Undead Fortitude"`
— because dnd5e renders `name` as a button label.

A `utility` row with **no** `roll` (38 of 46 have `effect` only) still emits a `utility` activity,
with `roll.formula: ""`. It becomes a describable, clickable feature that posts its description to
chat — which is the right Foundry behaviour for a prose-only monster trait.

`activation.type` from `effect` prose: leading `**Bonus action.**` → `"bonus"`,
`**Reaction**` → `"reaction"`, `**Action.**` or nothing → `"action"`.

### 6.5 `reaction` — `glacier-stalker.rime_reflex`

The only reaction row with mechanics: `damage` + `attacker_save`, no `reaction_kind` (defaults to
`"damage"` in the runner).

```jsonc
{
  "name": "Rime Reflex",
  "type": "feat",
  "system": {
    "description": {
      "value": "<p><em>Shards of ice erupt where the blow lands.</em></p><p><strong>Trigger:</strong> melee damage within 5 ft.</p>",
      "chat": ""
    },
    "type": { "value": "monster", "subtype": "" },
    "activities": {
      "Nb5rGw2kQ8mTx4Ju": {
        "_id": "Nb5rGw2kQ8mTx4Ju",
        "type": "save",
        "name": "Rime Reflex",
        "sort": 0,
        "activation": { "type": "reaction", "value": null,
                        "condition": "melee damage within 5 ft", "override": true },
        "consumption": { "targets": [], "scaling": { "allowed": false, "max": "" }, "spellSlot": false },
        "description": { "chatFlavor": "" },
        "duration": { "units": "inst", "value": "", "special": "", "concentration": false, "override": true },
        "effects": [],
        "range": { "value": "5", "units": "ft", "special": "", "override": false },
        "target": {
          "affects": { "count": "1", "type": "creature", "choice": false, "special": "" },
          "template": { "type": "", "count": "", "size": "", "width": "", "height": "",
                        "units": "ft", "contiguous": false, "stationary": false },
          "override": true, "prompt": true
        },
        "uses": { "spent": 0, "max": "", "recovery": [] },
        "save": { "ability": ["con"], "dc": { "calculation": "", "formula": "15" } },
        "damage": {
          "onSave": "none",
          "parts": [
            { "number": 1, "denomination": 8, "bonus": "", "types": ["cold"],
              "custom": { "enabled": false, "formula": "" },
              "scaling": { "mode": "", "number": 1, "formula": "" } }
          ]
        }
      }
    }
  },
  "flags": {
    "pentaryn": {
      "npc": "glacier-stalker", "action": "rime_reflex", "rowType": "reaction",
      "unmapped": [
        { "field": "trigger", "reason": "combat-runner event hook; dnd5e has no declarative reaction trigger",
          "renderedInto": "system.activities.Nb5rGw2kQ8mTx4Ju.activation.condition + system.description.value" }
      ]
    }
  }
}
```

`attacker_save.on_save: "no damage"` → `damage.onSave: "none"`. A reaction with
`reaction_kind: "movement"` or `"buff"` (5 of 6 rows) has no damage and no save → **`utility`**
activity, `activation.type: "reaction"`, `roll.formula: ""`, all mechanics in the description.

---

## 7. The mapping table

### 7.1 Row-level fields

| `actions.jsonl` field | n | Foundry destination | Notes |
| --- | --- | --- | --- |
| `npc` | 96 | `flags.pentaryn.npc` on the Item; selects the Actor | |
| `action` | 96 | `flags.pentaryn.action`; Item `name` after title-casing | Upsert key within the Actor |
| `type` | 96 | Item `type` + activity `type` (§4.1, §7.2) | |
| `narration` | 96 | `system.description.value` (leading `<em>` paragraph) | |
| `verbs` | 96 | ❌ **SKIP — `unmapped`** | Combat-runner grammar tokens. No Foundry concept. |
| `updated_at` | 96 | ❌ **SKIP** | Superseded by manifest `generatedAt` + `contentHash`. |
| `effect` | 43 | `system.description.value`; leading `**Bonus action.**`/`**Reaction**` also drives `activation.type` | |
| `attacks[]` | 40 | one attack activity per entry | §7.3 |
| `prerequisite` | 36 | `activation.condition` (truncated to 255 chars) **and** `system.description.value` | ⚠️ **Free prose, not machine-readable.** Never becomes a mechanical gate. `unmapped`. |
| `scope` | 36 | ❌ **SKIP — `unmapped`** | `self`/`global` is runner targeting. The 8 `global` rows are skipped entirely (§2.3). |
| `priority` | 34 | ❌ **SKIP — `unmapped`** | Runner action ordering. Foundry has no equivalent. |
| `range` | 23 | weapon → `system.range {value, long, reach, units}`; feat → activity `range {value, units}` | §7.4 |
| `slots` | 16 | Item `system.uses` + activity `consumption.targets` | §4.3 |
| `roll` | 9 | utility activity `roll {formula, name}`; `roll.notes` → description | §6.4 |
| `trigger` | 9 | `activation.type: "reaction"` + `activation.condition` from `trigger.match`; `trigger.scope`/`event` → description | ⚠️ dnd5e has no declarative reaction trigger. `unmapped`. |
| `damage` (top-level) | 5 | activity `damage.parts[0]` | area + damage-kind reaction |
| `reaction_kind` | 5 | selects activity type: absent/`damage` → `save`; `movement`/`buff` → `utility` | |
| `watch` | 5 | ❌ **SKIP — `unmapped`** | Runner's ally-event watcher (`bloodied`, `death`, priority). No Foundry equivalent short of a module. |
| `area` | 4 | activity `target.template` | ⚠️ **Free prose.** Grammar in §6.3; unmatched ⇒ build failure. |
| `save` | 4 | activity `save` + `damage.onSave` | |
| `recharge` | 3 | Item `system.uses.recovery[0] = {period: "recharge", formula: "5"}` | |
| `attacker_save` | 1 | activity `save` + `damage.onSave: "none"` | |
| `pre_save` | 1 | ❌ **SKIP — `unmapped`** → description | A **string**, not a dict: `"DC 15 Str save vs prone (target gets disadvantage on the bite to-hit if knocked prone — DM, apply if save fails)"`. Encodes a conditional-advantage rule with no dnd5e representation. |

### 7.2 `type` → Item type + activity type

| Row `type` | Item | Activities |
| --- | --- | --- |
| `single_attack` | `weapon` | 1 × `attack` (+1 × `save` if `apply_condition_on_hit`) |
| `multiattack` | `feat` | N × `attack` (+1 × `save` per `apply_condition_on_hit`) |
| `area` | `feat` | 1 × `save` |
| `utility` | `feat` | 1 × `utility` |
| `reaction`, kind `damage` (or absent) | `feat` | 1 × `save` |
| `reaction`, kind `movement`/`buff` | `feat` | 1 × `utility` |

### 7.3 `attacks[]` entry fields

| Field | n/63 | Destination |
| --- | --- | --- |
| `name` | 63 | activity `name` |
| `to_hit_bonus` | 63 | `attack.bonus` — **as a string** |
| `damage` (`NdM`) | 63 | `damage.parts[0].number` / `.denomination` |
| `damage_modifier` | 63 | `damage.parts[0].bonus` — string; `0` → `""` |
| `damage_type` | 63 | `damage.parts[0].types[0]` |
| `extra_damage` | 6 | `damage.parts[1]` — `{dice, type}` |
| `apply_condition_on_hit` | 4 | companion `save` activity (§6.2) + description. `duration_rounds` (2/4) ❌ **unmappable** without ActiveEffects. |
| `rider_on_hit` | 14 | ❌ **SKIP — `unmapped`** → description. Free prose (e.g. *"The stirge **attaches** to the target…"*). |

### 7.4 `range` → melee/ranged, and the classification rule

Grammar: `^(\d+)(?:/(\d+))? ft$`. Anything else is a build failure.

```
ranged  ⟺  the string contains "/"  OR  the single value > 10
melee   ⟺  otherwise (including range absent)
```

Verified against **all 40** attack-bearing rows: `5 ft` and absent → melee (bites, claws, maces,
multiattacks, pickaxe, longsword, greataxe); `30/60`, `80/320`, `100/400`, `150/600`, `30/120`,
`30 ft`, `60 ft`, `120 ft` → ranged (crossbows, bows, spat bile, frost ray, fire bolt, produce
flame, eldritch blast). No misclassification.

**Weapon items:** `system.range = {value: <near>, long: <far or null>, reach: <5 if melee else null>, units: "ft"}`.
**Feat items:** activity `range = {value: "<near>", units: "ft", special: "", override: false}`.

Note `[base-act]` `prepareFinalData`: `if (this.range.long > this.range.value) this.range.value = this.range.long`
— so a weapon with 80/320 displays `labels.range = "320 ft"`. That's dnd5e's own behaviour, and
it is why **range labels are excluded from the readback assertion set** (§8).

`attack.type.classification` is always `"weapon"`. Seven rows are plainly spell attacks
(`frost_ray`, `radiant_flame`, `fire_bolt`, `force_ballista_shoot`, `produce_flame`,
`eldritch_blast`, `scorching_ray`) but nothing in the row marks them. Under `flat: true` the
classification affects only the chat-card label and the derived `actionType` (`mwak`/`rwak` vs
`msak`/`rsak`) — **no maths**. Correctable per-action via the override file (§3.5).
**UNCERTAIN (U4).**

### 7.5 Fields that CANNOT be mapped — the full list

Nothing here is a bug; each is a real gap between the runner's model and dnd5e's. All of them MUST
appear in `flags.pentaryn.unmapped` on the owning Item.

| Field | Why unmappable |
| --- | --- |
| `verbs` | Natural-language command grammar. No Foundry surface. |
| `priority` | Runner's action-selection ordering. |
| `scope` | Runner's `self`/`global` targeting namespace. |
| `watch` | Declarative ally-event watcher (`bloodied`/`death`, priority weights). Would need a module with hooks. |
| `trigger` | Declarative reaction trigger. dnd5e's `activation.type: "reaction"` is a *label*, not a hook — nothing fires automatically. Best effort: `activation.condition`. |
| `prerequisite` | Free prose, sometimes several sentences of GM judgement. |
| `pre_save` | Free prose encoding a save that grants *disadvantage on a later attack*. No representation. |
| `attacks[].rider_on_hit` | Free prose (attach, drag, knock prone, ongoing damage). |
| `apply_condition_on_hit.duration_rounds` | Needs an ActiveEffect with a round duration; effect authoring is out of Stage 1 scope. |
| `reaction_kind` | Selects the activity type but carries no further meaning. |
| `updated_at` | Superseded by `contentHash`. |
| Actor: skill totals, save totals, passive Perception | Totals, not components. Emitting them as bonuses double-counts once abilities exist (§3.2, §3.4). |
| Actor: the AC parenthetical (`"natural"`, `"chain shirt, shield"`) | Flavour. `ac.calc: "flat"` has no slot for it. Kept in `flags.pentaryn.acNote`. |

---

## 8. The `expected` block — Stage 2 readback assertions

Every actor carries a sibling key `expected`. **It is not a Foundry field.** The importer MUST
delete it from the payload before `Actor.create` / `Item.create` (Foundry would strip it anyway —
that's the point of asserting rather than trusting).

```jsonc
"expected": {
  "actor": {
    "system.attributes.hp.max":  84,
    "system.attributes.ac.value": 16,
    "system.details.cr":          5,
    "system.details.type.value":  "beast",
    "system.traits.size":         "med",
    "prototypeToken.disposition": -1,
    "prototypeToken.displayBars": 40,
    "prototypeToken.actorLink":   false,
    "prototypeToken.bar1.attribute": "attributes.hp",
    "prototypeToken.sight.enabled":  true,
    "prototypeToken.width":       1
  },
  "items": [
    {
      "action": "multiattack",
      "itemType": "feat",
      "activities": [
        { "id": "Hd7pKr3nX2vQmB9c", "type": "attack",
          "labels.toHit": "+7", "labels.damage.0.formula": "1d8 + 4" },
        { "id": "Ls9wTf4jY6zRnA1e", "type": "attack",
          "labels.toHit": "+7", "labels.damage.0.formula": "1d8 + 4" },
        { "id": "Cv2mQx8bN5hJt3Ru", "type": "attack",
          "labels.toHit": "+6", "labels.damage.0.formula": "2d10 + 4" },
        { "id": "Gt6yPw1sD4kFz8Xa", "type": "save",
          "labels.save": "DC 15", "save.dc.value": 15 }
      ]
    },
    {
      "action": "glacial_roar",
      "itemType": "feat",
      "itemLabels": { "recharge": "Recharge [5+]" },
      "activities": [
        { "id": "Rk8nVc5qJ2wXd7Bm", "type": "save",
          "labels.save": "DC 15", "save.dc.value": 15,
          "labels.damage.0.formula": "8d6" }
      ]
    }
  ]
}
```

### 8.1 Why labels, not recomputed maths

The playbook is explicit: *"compare displayed labels (`activity.labels.toHit`, save DC label), not
recomputed maths. Reimplementing dnd5e's derivation in the assert just moves the bug."*

`labels.toHit` is produced at `[attack]:215` from `getAttackData()` — i.e. it is literally what the
sheet and the chat card show, after every bonus, mod and proficiency has had its chance to apply.
If `flat` were ignored, an NPC with no abilities and CR 5 (proficiency +3) would show **+3 more**
than the baked value, and the assertion catches it. Recomputing `bonus + mod + prof` in the
assertion would agree with the bug.

### 8.2 Resolution and comparison rules (normative)

1. Assertions run against the **prepared** documents after create/update, never against the
   payload. `actor.prepareData()` has run; `item.system.activities` is an `ActivityCollection`
   (`activities-field.mjs`), so `item.system.activities.get(id)` returns the Activity with
   `.labels` populated.
2. `actor.*` paths resolve with `foundry.utils.getProperty(actor, path)`.
3. `items[].activities[].<path>` resolve with
   `foundry.utils.getProperty(item.system.activities.get(a.id), path)`.
   `labels.damage` is an **array of `{formula, label, damageType}`** (`[base-act]:661`), hence the
   `labels.damage.0.formula` path.
4. `itemLabels.<k>` resolves against `item.labels[k]` (that is where `[uses]` writes `recharge`
   and `recovery`).
5. **String comparison is whitespace-normalised**: `String(actual).trim().replace(/\s+/g, " ")`
   compared to the same normalisation of `expected`.
   This matters for `labels.save`: `[save]` formats `DND5E.SaveDC` = `"DC {dc} {ability}"`, and in
   flat mode `ability` is `undefined`, so `CONFIG.DND5E.abilities[undefined]?.label ?? ""` yields
   an **empty second token** and the raw label is `"DC 15 "` with a trailing space. Assert `"DC 15"`.
6. **Number comparison is strict `===`** after `Number()` coercion. No epsilon; every value here is
   an integer or a half-step.
7. `save.dc.value` is included alongside the label because it is the number dnd5e itself derived
   (`[save]` `prepareFinalData`) — reading it is a lookup, not a recomputation.
8. **Excluded from assertions, deliberately:** anything containing a range label (dnd5e rewrites
   `range.value` to the long range, §7.4); anything derived from `details.cr` (proficiency, XP);
   `img`; `hp.value` on updates.

### 8.3 Failure behaviour

- **Abort on first mismatch** across the run (Gate 2 requires this to be demonstrable).
- Per-actor `try/catch` around create/update so a single `ValidationError` doesn't kill the run —
  but an *assertion* failure is fatal to the run, not per-actor. The distinction: creation errors
  are noisy and visible; assertion failures mean the silent-strip failure mode is live and nothing
  else in the batch can be trusted.
- The error MUST name the actor slug, the item action, the activity id, the path, expected and
  actual.

---

## 9. `contentHash`

### 9.1 What it is for

A **change token**, not an integrity check. Stage 2 skips an actor whose stored
`flags.pentaryn.contentHash` equals the incoming one. That is its entire job.

### 9.2 Normative rule: the module does not recompute it

The generator is the **sole producer**. The importer compares two strings:

```js
const existing = actor?.getFlag("pentaryn", "contentHash");
if ( existing === incoming.flags.pentaryn.contentHash ) { skipped++; continue; }
```

This is deliberate. Making both sides compute the hash would put a canonical-JSON implementation
in Python *and* JavaScript, and they disagree by default — `json.dumps(1.0)` is `"1.0"` while
`JSON.stringify(1.0)` is `"1"`, and `prototypeToken.width` for a tiny creature is `0.5`. That
mismatch would present as "every actor is always different", i.e. the pipeline silently loses its
idempotence. One producer, one algorithm, no seam.

### 9.3 Definition (Python, normative for the generator)

```python
import hashlib, json, copy

def content_hash(actor: dict) -> str:
    payload = copy.deepcopy(actor)
    payload.pop("expected", None)                       # assertions are not content
    payload.get("flags", {}).get("pentaryn", {}).pop("contentHash", None)
    canonical = json.dumps(
        payload,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    ).encode("utf-8")
    return "sha256:" + hashlib.sha256(canonical).hexdigest()
```

**Hashed:** the entire actor object — `name`, `type`, the whole `system` tree, `prototypeToken`,
every element of `items` (including activity ids, which are themselves deterministic, §5.1), and
all of `flags.pentaryn` *except* `contentHash`.

**Not hashed:** `expected` (it is derived from the same inputs; including it would be redundant and
would couple assertion-format changes to the change token), `flags.pentaryn.contentHash` itself,
and everything at manifest level — `generatedAt` and `sourceRevision` in particular, since hashing
a timestamp would make every actor differ on every build.

**Format:** lowercase hex, prefixed `sha256:`. 71 characters.

**Consequence to accept:** any change to this contract that alters emitted field ordering or
defaults changes every hash, so the next import rewrites every actor. That is correct and cheap —
replace-embedded-Items does not recreate Actors, so placed tokens survive (playbook, Stage 2).

### 9.4 Manifest-level `payloadHash` — deliberately absent

Not emitted. It would only protect against hand-editing `foundry/build/actors.json`, which is a
generated, committed file whose edits show up in `git diff`. Adding one would imply an integrity
guarantee this design does not make.

---

## 10. `@ref` lint

> **The trap** (playbook): dnd5e validation replaces `@terms` with `1`, so typos **pass**
> validation. Evaluation resolves unknown refs to `0`, so they **roll as zero**.

Every value the generator writes into a `FormulaField` is a literal number or a literal dice
expression, because `actions.jsonl` pre-computes everything. Therefore:

**The `@ref` whitelist is empty. The generator MUST emit no `@` in any formula field.**

Formula fields in scope (the complete list for what we emit):

```
system.attributes.hp.formula
system.attributes.init.bonus
system.attributes.movement.{walk,burrow,climb,fly,swim,bonus}
system.uses.max
system.uses.recovery[].formula
activity.attack.bonus
activity.damage.critical.bonus
activity.damage.parts[].bonus
activity.damage.parts[].custom.formula
activity.damage.parts[].scaling.formula
activity.save.dc.formula
activity.roll.formula
activity.range.value
activity.target.template.{count,size,width,height}
activity.target.affects.count
activity.consumption.targets[].value
activity.consumption.scaling.max
```

Lint, run by the **generator** before writing and by the **importer** before creating:

```python
FORMULA_OK = re.compile(r"^[0-9d+\-*/(). ]*$")   # digits, dice, arithmetic, whitespace — no '@'
ALLOWED_REFS: frozenset[str] = frozenset()       # intentionally empty
```

A non-empty `ALLOWED_REFS` would be the escape hatch if the override file ever needs one; the
three that would be defensible are `@prof`, `@abilities.<key>.mod`, `@attributes.<path>`. Until
one is actually needed, the set stays empty — an empty whitelist is the only one that cannot be
wrong.

The importer MUST run the same check on the JSON it fetched (defence against a hand-edited file)
and MUST refuse the whole run on a hit, naming the actor, item and path.

---

## 11. UNCERTAIN register

Every uncertainty in one place. Each is a Gate 1 review item or a Gate 2 readback item — not
something to take on trust.

| # | Field | Best guess | Reasoning | How to settle it |
| --- | --- | --- | --- | --- |
| **U1** | `slots.refresh: "round"` → `uses.recovery[].period` | `"turnStart"` | `DND5E.limitedUsePeriods` (`[config]:1432`) has no `round`. Keys are `lr sr day dawn dusk initiative turnStart turnEnd turn`. `turnStart` carries `type: "combat"` and matches the runner's "refreshes at the start of its turn". `turn` is also plausible but its label is vaguer. | Import one such Item (3 rows: `_global` excluded, so check `tough.*`, `goblin-boss.*`) and confirm `item.labels.recovery` reads sensibly and uses restore on turn start. |
| **U2** | `slots.refresh: "encounter"` → period | `"initiative"` | `initiative` recovers when initiative is rolled = once per combat, which is what "encounter" means. It is `type: "special"` in config, so the recovery path may differ from the ordinary ones. | Gate 2: roll initiative with the actor in a combat and confirm `uses.spent` resets. |
| **U3** | *(resolved during drafting — kept for the audit trail)* Rider-activity `activation.type: "special"` | **confirmed valid** | Initially flagged as possibly unlisted. `"special"` is a real key of `DND5E.activityActivationTypes` (`[config]:994`, alongside `mythic`, `lair`, `crew`). No uncertainty remains. | — |
| **U4** | `attack.type.classification` for the 7 spell-like attacks | `"weapon"` | Nothing in the row distinguishes them. Under `flat: true` it changes only the chat-card label and `actionType` (`rwak` vs `rsak`) — `getAttackData` (`[attack]:261`) returns before classification is consulted. No maths. | Cosmetic. Fix per-action via `foundry/overrides/<slug>.yml` → `items.<action>.attackClassification: spell` if the labels bother anyone at the table. |
| **U5** | `traits.size` for every NPC | `"med"` | Not present in any markdown. Affects `prototypeToken.width/height` and the NPC hit-die denomination (`[npc]`:356) — the latter is inert because we set `hp.max` and `hp.formula` directly. Several are plainly wrong: the glacier stalker is "panther-sized" (arguably `med`), giant spiders are `lg` in the SRD. | Set per-slug in the override file. Gate 2 checks `prototypeToken.width` explicitly, so a wrong size is visible the moment a token is placed. |
| **U6** | `prototypeToken.sight.visionMode` | `"basic"` | Foundry's own initial value (`[core-token]`). Setting `"darkvision"` changes the *rendering* for whoever controls the token; since all these tokens are GM-controlled and the GM sees everything, it should be inert. But dnd5e ships vision-mode integration I did not trace. | Gate 2: place a darkvision NPC token, control it, confirm the scene renders as expected. If it doesn't, `"darkvision"` when `senses.ranges.darkvision > 0`. |
| **U7** | Foundry accepts an explicit `system.activities` map on `Item.create` inside `Actor.create`'s `items` array | assumed yes | `ActivitiesField` is a `MappingField` over `ActivityField`; `_id` is a `DocumentIdField` with `readOnly: true` in its defaults — supplied source ids are normally honoured on **creation** (only updates are blocked). Gate 0's write probe passes `activities: {"aaaaaaaaaaaaaaaa": {...}}` and the playbook expects it to work. | Gate 0 settles this before Stage 1 output is ever imported. If ids are regenerated, §8 must resolve activities by `name` instead of `id` — a localised change to §8.2 rule 3. |
| **U8** | `system.equipped: true` on weapon Items | assumed harmless | `[attrs]` `prepareArmorClass` only inspects `itemTypes.equipment`, so an equipped weapon cannot alter AC. `equipped` controls sheet grouping and whether the attack is offered. | Gate 2: confirm the AC readback still reads the flat value with weapons present. Already covered by `system.attributes.ac.value` in `expected.actor`. |
| **U9** | `"radius"` as the template type for *"20-ft radius around the Ancestor-Stir"* | `radius` | `DND5E.areaTargetTypes.radius` is labelled `DND5E.TARGET.Type.Emanation.Label` — 2024-rules "emanation", which is exactly "centred on the creature". `sphere` and `circle` are the alternatives; `sphere` implies a point of origin away from the caster. | Place the template in Foundry and look at it. One row (`ancestor-stir.wail`). |

---

## 12. Checklists

### Generator (Stage 1) MUST

- [ ] Fail the build — no output — on: slug stat disagreement (§2.1); a `cr` that contradicts the `#cr-*` tag; zero or ≥2 creature-type tags; an unparseable `area`, `range`, or trait token; a duplicate activity id; an activity id failing `^[a-zA-Z0-9]{16}$`; any `@` in a formula field.
- [ ] Emit `skipped` covering every non-Item row, with a reason from the closed set (§2.3).
- [ ] Assert `len(rows) == items_emitted + len(skipped)` before writing.
- [ ] Emit strings for every `FormulaField` (`attack.bonus`, `uses.max`, `movement.*`, `damage.parts[].bonus`, `save.dc.formula`, `roll.formula`).
- [ ] Emit `attack.flat = true` on **every** attack activity, and `proficient: 0` on **every** weapon Item.
- [ ] Emit `save.dc.calculation = ""` (empty string, not `"flat"`) on **every** save activity.
- [ ] Never emit `_id`, `img`, `detectionModes`.
- [ ] Compute `contentHash` last, over the actor with `expected` and `contentHash` removed (§9.3).
- [ ] Produce byte-identical output for an unchanged tree (golden-file test, Gate 1).

### Importer (Stage 2) MUST

- [ ] Fetch with `{cache: "no-cache"}`.
- [ ] Version-gate on all four manifest fields (§1.1) and abort the run on mismatch.
- [ ] Re-run the `@ref` lint on the fetched JSON (§10).
- [ ] Strip `expected` from every actor and item before `Document.create`.
- [ ] Upsert by `flags.pentaryn.slug`; skip when `contentHash` matches.
- [ ] **Replace embedded Items** — never delete and recreate the Actor.
- [ ] Never write `actor.img`, `prototypeToken.texture.src`, or `system.attributes.hp.value` on an update.
- [ ] Per-actor `try/catch` around document writes; abort the whole run on an *assertion* failure.
- [ ] Run every `expected` assertion against prepared documents, with the normalisation of §8.2.
- [ ] Delete `actors.json` from `Data/` on success.
