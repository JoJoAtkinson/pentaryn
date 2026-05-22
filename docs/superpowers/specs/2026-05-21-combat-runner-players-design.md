---
created: 2026-05-21
tags: ["#spec", "#combat-runner"]
status: draft
---

# Combat Runner — Players as First-Class Combatants

## Summary

Add player characters (PCs) to the Combat Runner as first-class combatants:
their own tabs in the turn order, addressable by a permanent number,
able to act on targets, fire events, and accrue tracked state and a combat
log. The LLM stops being a fallback and becomes an always-on reviewer behind
every command.

This is an additive feature built **onto the existing framework** (Approach 1
below) — not a rewrite.

## Goals

- PCs appear as tabs alongside NPCs, sharing the turn-order tab strip.
- Every combatant (PC and NPC) has a **permanent number** that is stable for
  the whole encounter and independent of tab position.
- A snappy directed-command grammar: `<id> <amount> <tags…>` — apply damage,
  healing, conditions to any combatant from any tab.
- The LLM reviews **every** state-changing command asynchronously, with full
  actor/target context — catching resistances, triggers, and free-form
  ("33 is taunted") commands.
- PCs can cast, retreat, dodge, etc. — declarative actions that log and fire
  events (e.g. spellcast → counterspell prompt; retreat → opportunity-attack
  prompt).
- A combat log with actor attribution; per-combatant tracked state visible on
  that combatant's tab.

## Non-goals (YAGNI)

- No full PC character sheets. PCs carry name, number, HP, AC — nothing more.
- No grid or zone positioning. Melee is a flag set by a tag; opportunity
  attacks are always a dismissible prompt.
- PCs do not roll dice in the app — players roll physically; the DM records
  outcomes via the command grammar.
- No CI gate, no migration of legacy `launch.py`.

## Approach

**Approach 1 — players are a flavored combatant.** The existing architecture
(`EncounterState`, `EventBus`, `HPBar`, conditions, draggable turn-order tabs)
is already generic over "a thing in the turn order". A PC is that thing minus
roll-ahead actions. We add a `kind` discriminator and a thin player-tab
variant, reusing everything else.

Rejected: a parallel `PlayerState`/`PlayerTab` hierarchy (forks HP / conditions
/ events / dispatch into two of everything — the duplication the recent code
review flagged as the codebase's main weakness); and a `Combatant` base-class
extraction (rewrites `state.py`, a currently-clean tested module, and the LLM
JSON boundary — high risk for modest gain).

---

## 1. Data model

In `gui/state.py`, `NPCState` becomes a generic combatant:

| Field | Notes |
|-------|-------|
| `kind: str` | `"npc"` or `"pc"`. Default `"npc"` (back-compat). |
| `id: str` | Permanent number **label** (see §2). String, not int — `"0"` ≠ `"00"`. |
| `ac: int \| None` | Populated for PCs from the party config; `None` for NPCs unless set. |
| `in_melee: bool` | Set true when this combatant deals or takes a `melee`-tagged command. |
| `pinned_notes: list[str]` | Free-form tracked state shown on the tab (see §8). |

PCs have no roll-ahead `actions` from `actions.jsonl`; they use the generic
action set (§7).

`EncounterState` keeps **one ordered list** of all combatants — PCs and NPCs
together. List order is the turn order, reorderable by tab drag. `kind` and
`id` flow through the existing JSON snapshot and the LLM tool boundary.

## 2. Permanent numbers — the repeated-digit alphabet

Combatant numbers are drawn in order from a **repeated-digit alphabet** so any
combatant is referenced by pressing one key 1–3 times:

```
tier 1 (single press):  1 2 3 4 5 6 7 8 9 0          (10 ids)
tier 2 (double press):  11 22 33 44 55 66 77 88 99 00 (10 ids)
tier 3 (triple press):  111 222 … 000                 (10 ids)
… extends indefinitely if ever needed.
```

- The `id` is the **string label** the DM types and the tab displays.
- A valid id is *one digit repeated*. This tightens the parser: `44` is a
  valid id, `45` is rejected as a non-id.
- **Players** take their label from the party config (§3) — a player's number
  is forever. **NPCs/monsters** are auto-assigned the next free alphabet
  entries at combat start, skipping labels claimed by players.
- A **mob** is one combatant with one id; members are addressed with the
  existing `m<n>` token (§5), e.g. `44 m2 …`.
- Numbers are stable for the whole encounter; dragging tabs to reorder the
  turn order never changes an id.
- Tab titles show `id · name`, e.g. `44 · Giant Spider`, `1 · Vessa`.
- `Ctrl+1..9` changes from "jump to tab position N" to "jump to combatant
  `#N`" for consistency with the numbering.

## 3. Roster loading

### Party config file

A new launch arg `--party <path>` points at a party config YAML. It is also
selectable in the launcher. Location convention:
`world/party/<party>/combat-roster.yml`.

```yaml
party: Black Ledger
players:
  - { name: Vessa, id: "1", max_hp: 31, ac: 15 }
  - { name: Orren, id: "2", max_hp: 40, ac: 17 }
  - { name: Grek,  id: "3", max_hp: 33, ac: 16 }
```

The file is **static** — `name`, `id`, `max_hp`, `ac`. It does not store
current HP (that changes session to session).

### Launcher

The encounter picker (`gui/encounter_picker.py`) gains a **Players** section:
each player from the config is listed with

- a **checkbox** (default on) — unchecked players sit this combat out;
- an editable **current-HP field**, defaulting to `max_hp`.

On Launch: checked players become PC combatants (`kind="pc"`, their config
`id`, `max_hp`, `ac`, current HP from the field). Encounter NPCs are then
assigned ids from the alphabet, skipping the player ids.

## 4. Command pipeline

Every command (DM-typed or LLM-emitted) flows:

```
input
  │
  1. dispatcher parses it
  │
  2. fast path: if it maps 1:1 to a recognized command → apply the effect
     immediately on the UI thread; log the deterministic result.
     (no match → no immediate effect)
  │
  3. LLM review: ALWAYS enqueue an async review job — EXCEPT for
     `note …`, a bare tab-jump, and `/slash` commands — with context:
        • actor   = the combatant whose tab is active
        • target  = the #id combatant (+ known stats & conditions)
        • raw command text + what the fast path did
        • recent combat log
     The LLM may: stay silent · add a note/condition · revise the applied
     effect · flag a trigger · interpret an unknown command and act.
     Results post back as log lines / state changes when the job returns.
```

The async LLM worker is the off-UI-thread mechanism already built for the
LLM fallback (single-thread `QThreadPool`, tool dispatch marshalled back to
the GUI thread). The fast path gives instant feedback; the review lands a
beat later and never blocks input.

**LLM revisions auto-apply.** When the review revises an already-applied
effect (e.g. target resists fire, 12 → 6), it changes the state itself and
writes a clear log line: `⟳ review: #5 resists fire 12 → 6`. No confirmation
step.

Cost note: one LLM call per state-changing command is acceptable for a
single-user tool. The review pass uses a fast model and prompt caching; the
review prompt is kept tight (actor + target + command + recent log only).

## 5. Directed-command grammar

`gui/dispatcher.py` routes by the **first character** (it already works this
way — this adds one branch):

| Starts with | Meaning |
|-------------|---------|
| a digit | **directed command** — `<id> <amount> <tags…>` |
| `-` / `+` | self damage / heal on the **active tab** (unchanged) |
| `@` | condition on the active tab (unchanged) |
| `m` | mob member on the active tab (unchanged) |
| `/` | slash command (unchanged) |
| `note ` | log entry, never hits the LLM (unchanged) |
| anything else | verb fuzzy-match → action, else LLM (unchanged) |

The `#` prefix is **not** used — a leading number *is* the id.

### Directed command — `<id> <amount> <tags…>`

- `<id>` — first token; a repeated-digit label validated against live
  combatants. A non-uniform number (`45`) or unknown id is rejected with a
  clear inline error. An optional `m<n>` token may follow the id to target a
  mob member: `44 m2 5 fire`.
- `<amount>` — second token; a positive integer.
- `<tags…>` — zero or more tags, **any order**, resolved against the faceted
  taxonomy (§6).
- `<id>` **alone** (no amount) → focus that combatant's tab ("jump to").
- The **active tab** is recorded as the **actor** for the log line.

Self-target keeps today's behavior: `-18` / `+10` / `@prone` on the active
tab. The directed form is purely additive. The LLM emits the identical
strings; a thin `apply_command` tool runs the string through the same parser
so LLM-issued commands are validated identically.

## 6. Tag taxonomy — faceted

Tags are organized as a **faceted taxonomy** (the established pattern for
mutually-exclusive-and-exhaustive categories). The taxonomy is a declarative
literal in a new pure module `gui/command_tags.py` (no I/O — keeps
`dispatcher.py` a Qt-free leaf):

```python
TAG_FACETS = {
    "direction": {
        "exclusive": True, "required": True, "default": "damage",
        "values": {
            "damage": {"aliases": ["dmg", "dam"]},
            "heal":   {"aliases": ["healing", "hp"]},
        },
    },
    "delivery": {
        "exclusive": True,
        "applies_when": {"direction": "damage"},
        "values": {"melee": {}, "ranged": {"aliases": ["rng"]}},
    },
    "type": {
        "exclusive": True,
        "applies_when": {"direction": "damage"},
        "values": {"fire": {}, "cold": {}, "acid": {}, "lightning": {}},
    },
}
```

### Validation rules (one small pure validator)

1. Resolve each typed token through the alias map → canonical tag + facet.
2. **≤ 1 value per facet.** A new value in an already-filled facet *replaces*
   the previous one ("remove mutually exclusive").
3. A facet's values are valid only if its `applies_when` holds. Setting
   `direction: heal` makes any `delivery`/`type` tag invalid — those tags are
   dropped. This is how `melee` + `heal` is rejected with no pairwise rule.

`melee` additionally sets the `in_melee` flag (§9) on actor and target — it
is both a `delivery` facet value and an engagement signal.

### Tag hinting (autocomplete)

As the DM types a partial tag, the candidate pool = canonical names + aliases
from facets that are **currently applicable** (`applies_when` satisfied) and
**not yet filled**, filtered by the typed prefix. Pressing **space** commits
the tag and recomputes the pool. After `heal` is committed the pool no longer
offers `fire`/`melee`; after `fire`, the `type` facet drops out of the pool.

Adding a tag = one line under a facet. Adding a facet = one block. No
performance concern at tens–hundreds of tags.

## 7. Player tab

One tab class. When `kind == "pc"` the action area renders a **generic
action chip row** instead of the DB-driven action grid; the `kind`-branch is
contained to the action-area builder. HP bar, conditions, command bar,
suggestion bar, and combat log are identical to NPC tabs.

Generic player actions (chips, also reachable by verb fuzzy-match):
**Cast, Attack, Dodge, Dash, Disengage, Help, Hide, Ready, Retreat.**

All are **declarative** — they write a combat-log line; some fire events:

| Action | Effect |
|--------|--------|
| Cast | Prompts for spell name + level → fires `spell_cast` (§9) → logs `casts Fireball (3rd)` |
| Retreat | Fires `move_away` → opportunity-attack prompt (§9) |
| Disengage | Logs; suppresses the opportunity-attack prompt |
| Dodge | Logs; applies a `dodging` condition |
| Attack / Dash / Help / Hide / Ready | Log a line |

Damage/healing themselves go through the directed-command grammar, not chips.

## 8. Combat log and per-combatant state

The app already has a combat log and `log_combat_event`. Changes:

- Every entry gains **actor attribution** — the active tab's combatant.
  `5 12 fire melee` typed on Vessa's tab logs `Vessa → 5: 12 fire (melee)`.
- Player generic actions log a line (`Orren: Dodge`).
- LLM-review results log as distinct lines (`⟳ review: …`, `note: #33 taunted`).
- `note …` stays explicit, never hits the LLM, attributed to the active tab.

**Per-combatant state visibility.** Each tab's start-of-turn area shows that
combatant's HP, conditions, and `pinned_notes`. When the LLM interprets a
free-form command like `33 is taunted`, it prefers adding a real condition
(`@taunted`) when the input is condition-like, else appends a `pinned_note`.
Either way, when the DM reaches `#33`'s turn the state is visible on the tab.

## 9. Events

Two tiers of reaction:

**Deterministic tier (instant, authored):**

- `spell_cast` — fired by the Cast action; carries caster id, spell name,
  level. The existing `TriggerMatcher` matches monster counterspell-style
  reactions (`{event: "spell_cast", scope: "global"}`) → reaction prompt
  showing spell + level; the DM picks counter-or-ignore.
- `melee` flag — a `melee`-tagged directed command sets `in_melee = True` on
  both actor and target.
- Opportunity attack — Retreat by an `in_melee` combatant fires `move_away`
  → a **dismissible** prompt (reuses `ReactionPromptDialog`); Disengage
  suppresses it.
- Existing events (`bloodied`, `dead`, `condition_applied`, `round_advanced`)
  now fire for PCs too — free with Approach 1, so e.g. a healer NPC's
  watch-suggestion can react to a PC going bloodied.

**LLM-review tier (async, smart):** every state-changing/unknown command, as
in §4 — interprets unknown commands, revises effects, flags anything the
deterministic tier missed.

## 10. Affected files

| File | Change |
|------|--------|
| `gui/state.py` | `kind`, `id`, `ac`, `in_melee`, `pinned_notes` on combatant; id-alphabet assignment; one combined list |
| `gui/command_tags.py` | **new** — faceted tag taxonomy + resolver/validator + hint-pool function |
| `gui/dispatcher.py` | directed-command branch; tag-taxonomy integration |
| `gui/encounter_picker.py` | `--party` handling; Players checkbox + current-HP section |
| `gui/app.py` | `--party` CLI arg; build PC combatants at launch |
| `gui/npc_tab.py` | `kind`-aware action area; generic player action chips |
| `gui/widgets/command_input.py` | tag hinting / autocomplete |
| `gui/main_window.py` | command pipeline (fast path + always-review enqueue); actor attribution; new events; OA prompt wiring |
| `gui/llm_controller.py` | review-job mode; `apply_command` tool; revision auto-apply + log |
| `gui/event_bus.py` | `spell_cast`, `move_away` event kinds |
| party roster | `world/party/<party>/combat-roster.yml` files (data, authored separately) |

## 11. Testing

Headless offscreen Qt, matching the repo's existing conventions:

- **Dispatcher / grammar** — repeated-digit id validation, amount, any-order
  tags, facet replacement, `applies_when` dropping, alias resolution, mob
  `m<n>`, id-alone tab-jump, rejection messages.
- **Tag taxonomy** — the validator's three rules; the hint-pool function.
- **State** — `kind`/`id`, id-alphabet assignment skipping player ids, PCs and
  NPCs in one turn order, `in_melee`.
- **Roster** — `combat-roster.yml` parse; launcher checkbox screen →
  combatant construction with current HP; unchecked players excluded.
- **Command pipeline** — fast path applies instantly; a review job is
  enqueued for both recognized state-changing commands *and* unrecognized
  input, and *not* for `note`/jump/slash; a revision auto-applies and logs;
  `33 is taunted` (unrecognized) yields a note/condition. (Fake Anthropic
  client.)
- **Events** — `spell_cast` → counterspell prompt; Retreat → OA prompt;
  Disengage suppresses it; PCs participate in `bloodied`/`dead`/`round`.
- **Player tab** — chips render for `kind=="pc"`, action grid hidden, generic
  actions log + fire events.
- **Combat log** — actor attribution; per-combatant `pinned_notes` display.

## Open risks

- One LLM call per command increases token spend and background traffic.
  Mitigated by a fast model + prompt caching + tight review prompt; acceptable
  for a single-user tool.
- LLM auto-revision changes state the DM already saw — mitigated by a clear,
  prominent `⟳ review:` log line for every revision.
- `npc_tab.py` is already large (flagged by the code review). The `kind`
  branch is kept narrow (action-area builder only) to avoid worsening it; a
  later split is out of scope here.
