---
name: NPC Combat-Runner Template
description: Canonical template for creating a `#combat-runner`-tagged NPC. The .md is a slim human-readable stat sheet; action mechanics live in the central DB at `combat-runner/actions.jsonl`, populated via the `combat_action_upsert` MCP tool.
tags: ["#template", "#combat-runner-template"]
---

# NPC Combat-Runner Template

> **Author note (delete this whole block when filling in the template):**
>
> A combat-runner NPC is **one .md file + N entries in the actions DB**:
>
> 1. **`<slug>.md`** — human-readable stat sheet under `world/.../<encounter>/npcs/`. Status line, start-of-turn checklist, tactics, description. The `#combat-runner` frontmatter tag is what the launcher discovers.
> 2. **Entries in `combat-runner/actions.jsonl`** — one row per action. Composite key = `(npc_slug, action_name)`. Authored via the **`combat_action_upsert`** MCP tool (Opus call) — the tool validates the spec before persisting, so malformed structures bounce back with a specific error.
>
> The .md does NOT need a verb table or any roll mechanics — the launcher queries the DB at boot and injects a "Ready actions" reference into the at-table session.
>
> **Where to save the .md:** `world/factions/<faction>/locations/<encounter>/npcs/<slug>.md`. The `#combat-runner` tag in the frontmatter is required for discovery.
>
> **Reference exemplar:** `world/factions/garhammar-trade-league/locations/mountin-pass/npcs/glacier-stalker.md` and the corresponding rows in `combat-runner/actions.jsonl`.

---

## Part 1 — `<slug>.md` (human-readable stat sheet)

```markdown
---
name: <Display Name>
created: YYYY-MM-DD
status: active
location: <encounter-slug>
tags: ["#combat-runner", "#<creature-type>", "#<theme>", "#<encounter-slug>", "#cr-<X>"]
---
# <Display Name>

**HP** XX (XdY+Z) **·** **AC** XX (<armor source>) **·** **Speed** 30 ft. **·** **Saves** Str +X, Con +X **·** **<Resistances/Immunities>** **·** **<Senses>** **·** **CR** X (XXX XP)

> Action mechanics live in `combat-runner/actions.jsonl` (DB) — see the launcher-injected **Ready actions** reference for verbs and call signatures.

---

## Start-of-turn checklist

1. <Reaction> refreshes to AVAILABLE.
2. If <recharge ability> is USED, roll `roll_dice(1, 6)` — recovers on N–6.
3. <Bonus action> available each turn.

---

## Tactics — when the DM asks "what does it do?"

- **Round 1:** <opener and positioning>.
- **Mid-fight:** <target priority + when to spend recharges/reactions>.
- **<Special situation>:** <e.g. "DM names a backline target 25+ ft away → ranged action beats melee opener">.
- **Below <HP threshold>:** <retreat / desperation behavior>.

## Description (one line)

<One sentence of physical flavor.>
```

---

## Part 2 — Author actions via `combat_action_upsert`

For each action this NPC has, call:

```
combat_action_upsert(
  npc="<slug>",
  action="<snake_case_action_name>",
  spec={ ... type-specific fields ... }
)
```

The tool validates the spec; malformed input gets a specific error (`{"ok": false, "error": "..."}`) without writing.

### Spec by action type

**Multiattack** — multiple attack rolls in one action; per-attack riders:
```python
{
  "type": "multiattack",
  "verbs": ["attack", "hit", "swing", "<species verb>"],
  "narration": "<one-line italic flavor>",
  "attacks": [
    {"name": "Claw 1", "to_hit_bonus": 7, "damage": "1d8", "damage_modifier": 4, "damage_type": "slashing"},
    {"name": "Claw 2", "to_hit_bonus": 7, "damage": "1d8", "damage_modifier": 4, "damage_type": "slashing"},
    {"name": "Bite", "to_hit_bonus": 6, "damage": "2d10", "damage_modifier": 4, "damage_type": "piercing",
     "rider_on_hit": "DC 15 Str save vs grappled (escape DC 15)"}
  ]
}
```

**Single attack** — one attack roll, optionally ranged:
```python
{
  "type": "single_attack",
  "verbs": ["ranged", "<weapon verb>"],
  "range": "30/60 ft",
  "narration": "<flavor>",
  "attacks": [
    {"name": "Frozen Bile", "to_hit_bonus": 5, "damage": "2d6", "damage_modifier": 3, "damage_type": "cold"}
  ]
}
```

**Area** — AoE with save; optional `recharge` (available when next start-of-turn d6 ≥ N):
```python
{
  "type": "area",
  "verbs": ["breath", "<recharge verb>"],
  "area": "30-ft cone",
  "recharge": 5,
  "narration": "<flavor>",
  "damage": {"dice": "8d6", "type": "cold"},
  "save": {"dc": 15, "ability": "Con", "on_save": "half"}
}
```

**Opener with movement requirement** — same as multiattack but with `prerequisite` and `pre_save`:
```python
{
  "type": "multiattack",
  "verbs": ["pounce", "charge", "<opener verb>"],
  "prerequisite": "Must move at least 20 ft. straight at the target this turn",
  "pre_save": "DC 15 Str save vs prone",
  "narration": "<flavor>",
  "attacks": [...]  # same shape as multiattack above
}
```

**Utility** — single non-attack roll (Stealth, Insight, etc.):
```python
{
  "type": "utility",
  "verbs": ["vanish", "<bonus verb>"],
  "prerequisite": "<situational gate>",
  "narration": "<flavor>",
  "roll": {"label": "Stealth", "dice": "1d20", "modifier": 6,
           "notes": "Compare result to each PC's passive Perception."}
}
```

**Reaction** — auto-trigger; `verbs=[]`; damage rolled upfront, attacker saves:
```python
{
  "type": "reaction",
  "verbs": [],
  "trigger": {"scope": "self", "event": "damage",
              "match": "hit by a melee attack within 5 ft"},
  "narration": "<flavor>",
  "damage": {"dice": "1d8", "type": "cold"},
  "attacker_save": {"dc": 15, "ability": "Con", "on_save": "no damage"}
}
```
`trigger` MUST be a dict: `scope` is `"self"` or `"global"`; `event` is one of
`damage | heal | condition_applied | condition_removed | action_executed |
spell_cast | round_advanced | death | bloodied | note`; `match` is a non-empty
descriptor string. (For a non-damage reaction, set `"reaction_kind": "movement"`
or `"buff"` and provide an `"effect": "<text>"` instead of a `damage` block.)

---

## Authoring checklist

Before declaring the NPC ready:

- [ ] `#combat-runner` is in the .md frontmatter `tags` array.
- [ ] If this is a NEW encounter, you've also created at least a brief `_overview.md` at the encounter root (terrain, hazards, hooks).
- [ ] `combat_action_upsert` returned `ok: true` for every action this NPC has.
- [ ] Each action's `verbs` list contains the natural words a DM is likely to say.
- [ ] Pre-computed `to_hit_bonus`, `damage_modifier`, save DCs — no derivations from ability scores.
- [ ] Riders (e.g. grapple-on-hit) attached to the specific attack with `rider_on_hit`.
- [ ] Every action has a `narration` field (italic flavor line in the reply).
- [ ] **Tactics** in the .md has at least: round 1, mid-fight, low-HP behavior.
- [ ] Run `python scripts/combat_actions_db.py validate` — all DB records pass schema validation.
- [ ] Optional sanity check: `python scripts/combat_actions_db.py list --npc <slug>` shows every action you upserted.
