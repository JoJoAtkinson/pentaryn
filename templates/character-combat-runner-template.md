# Character (PC-side) — combat-runner template

For **party-side characters** (players' PCs, allied NPCs like the Black Ledger). NPCs use [`npc-combat-runner-template.md`](npc-combat-runner-template.md); characters get this lighter template because their full sheets live elsewhere and are class-feature heavy.

## Discovery

- File path: `world/party/<faction>/members/<slug>.md` (or `world/.../members/<slug>.md` anywhere).
- Frontmatter MUST include `#combat-runner` in the `tags` array.
- The encounter discovery walker now recognizes both `npcs/` and `members/` parent directories — see `combat-runner/gui/encounter_picker.py:_walk_to_encounter_root`.

## Required frontmatter

```yaml
---
name: <Display Name>
tags: ["#world", "#party", "#combat-runner", "#<class-tag>", "#<faction-tag>"]
status: active
---
```

## Required status line (somewhere in the body)

The Markdown-table layout the existing character sheets use **is supported** — the parser at `combat-runner/gui/app.py:_parse_stat_table` picks up:

```markdown
| **HP** | `21` (3d8; ...) |
| **AC** | `17` (scale mail) |
| **Speed** | 25 ft |
| **Challenge** | — |
```

…OR you can add an explicit status line for the snappier path:

```markdown
**HP** 21 (3d8) **·** **AC** 17 **·** **Speed** 25 ft. **·** **CR** 0 **·** **PB** +2
```

CR is left blank/0 for characters (they don't have one). Class/level go in tags.

## Required body sections

```markdown
## Tactics

- Round 1 default: ...
- When bloodied: ...
- Reactions: ...

## Description

(short physical / personality blurb)
```

## DB rows — what to author

Author the **top 3-7 combat-able actions** per character. Don't try to encode every class feature. Focus on:

- **One signature attack** (weapon multiattack or main attack)
- **One signature spell or class feature** (Eldritch Cannon, Sneak Attack, Rage, Eldritch Blast, etc.)
- **One reaction or counter** if class-relevant (Sentinel, Counterspell, Shield, Uncanny Dodge)
- **One per-day or per-encounter slot** if class-defining (Action Surge, Rage uses)

Use the streamline-batch schema fields where they apply:

- `slots: {count: N, refresh: "long_rest"|"short_rest"|"encounter"|"round"}` for class limits (Action Surge 1/short rest, Rage 3/long rest, etc.)
- `apply_condition_on_hit: {condition, save_dc, save_ability, duration_rounds?}` for save-or-suck effects
- `extra_damage: {dice, type}` on an attack for Sneak Attack / Smite / Hex
- `watch: {event, scope, match?, priority?}` for ally-reactive actions (Healing Word watching `bloodied/ally`)
- `trigger: {scope, event, match}` for declarative reactions (Shield on `damage/self`)
- `reaction_kind: "damage"|"movement"|"buff"` to relax the reaction-schema's damage requirement

## Author with the MCP tool

```python
combat_action_upsert(npc="<slug>", action="<action_slug>", spec={
  "type": "single_attack" | "multiattack" | "area" | "utility" | "reaction",
  "verbs": ["...", "..."],
  "narration": "...",
  "attacks": [...],     # for *_attack/multiattack
  "slots": {...},       # if limited use
  ...
})
```

Or use the new bulk helper in scripts: `combat_actions_db.upsert_many([(npc, action, spec), ...])` for one read+write pass on the JSONL.

## Validate

```bash
python scripts/combat_actions_db.py validate
```

## Caveats

- Characters often have a TON of conditional features (Battle Master maneuvers, Eldritch Invocations, Metamagic). Don't try to encode them all. The DM uses the LLM fallback for the rare ones; the chip grid is for the daily-driver actions.
- `slots` is enforced — once a count hits 0 the chip greys out. Use the right-click menu's "Mark AVAILABLE" if you need to manually refund a slot.
- Passive class features (Sneak Attack triggers, Fighting Style, Rage damage bonus) go in the character's tactics section as a Haiku-facing reminder — they're not actions to fire.
