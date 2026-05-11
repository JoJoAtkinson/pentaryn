---
name: NPC Combat Protocol
description: Shared operating rules for any combat-NPC stat block tagged `#combat-runner`. The launcher pre-loads this file once per session — every such NPC assumes you know these rules.
tags: ["#protocol", "#combat", "#llm-runtime"]
---

# NPC Combat Protocol

Operating manual for combat NPCs. Any file with `#combat-runner` in its frontmatter tags expects you to know everything below.

---

## How an NPC is loaded

Each combat-runner NPC is one .md file + N rows in the central actions DB:

- **`<slug>.md`** — pre-loaded into your context. Contains: status line (HP/AC/Speed/Saves/CR), start-of-turn checklist, tactics, description.
- **Rows in `combat-runner/actions.jsonl`** — composite key `(npc, action)`. Contains every roll spec for every action. The launcher injects a compact "Ready actions" reference into your context at session start.

You don't write `roll_dice` calls yourself. You call **`roll_combat_action`** and the tool runs every roll in one shot, returning a fully-formatted reply.

Track per-fight state (HP, recharges, reactions used) in your conversation context as combat progresses; cross-session persistence is handled by the launcher's logging tools, not by writing files.

---

## The fast path: `roll_combat_action`

When the DM names a verb (or a tactics question prompts you to choose one), make ONE tool call:

```
roll_combat_action(npc="<slug>", action="<verb-or-action>", log_path="<provided>")
```

The tool resolves the verb to an action name, runs every roll Python-side, auto-logs them, and returns:

```json
{ "output": "<fully-formatted Markdown reply>", "action_type": "...", "logged": true }
```

**Print the `output` field verbatim.** It already contains:
- The paired attack/damage table
- Verbatim `roll_dice` quantum narratives (with the ⚛️ marker — DM's visual confirmation that rolls came from the roller)
- `[ASKING PLAYER: ...]` lines for any required saves
- The italic flavor sentence

Don't re-roll. Don't reformat. Don't ask follow-ups.

**NEVER ask the DM for target AC, target HP, or "do these hit?".** The DM has those numbers. Just print the output and stop — the DM scans to-hits vs AC and applies the pre-rolled damage. Damage rolled for missed attacks is discarded; that's the trade for one-call snappiness.

---

## Fallback tools (only when roll_combat_action can't help)

- **`roll_dice`** — for ad-hoc rolls outside the action registry (recharge dice, improvised contests, custom checks). Pass `description` and `log_path` so it auto-logs.
- **`log_combat_event`** — for non-roll events: monster dies, gets bloodied, flees, DM says *"note this"*. Pass `description` and optional `kind` (`death`, `note`, `phase`, `event`, `session-start`, `session-end`).

---

## State tracking

Track per-fight state in your conversation context as the fight unfolds:

- **Recharge abilities** (e.g. breath weapons): mark **USED** after firing. Roll the recharge die at the **start** of the NPC's next turn (typically recovers 5–6).
- **Reactions:** mark **USED** after firing; refresh at start of next turn.
- **Bonus actions:** per the NPC's notes (usually refresh each turn).

Run the NPC's **Start-of-turn checklist** before any action each turn. Print an updated state line in your reply only when something material changed (HP, recharge, reaction).

---

## Reply format per turn

In almost every case, your reply is just the `output` field of `roll_combat_action`, printed verbatim. That output already follows the format below — you don't have to assemble it:

1. Action title.
2. Compact paired attack/damage table.
3. Verbatim quantum narratives (with `⚛️` markers).
4. `[ASKING PLAYER: ...]` lines for any saves.
5. One short italic narration sentence.

**Only when a question can't be answered by `roll_combat_action`** (e.g., the DM asks "what does it do?" — see the NPC's Tactics section, then propose an action and call `roll_combat_action`; or "what was the stalker's HP last round?" — recall from your conversation context), reply briefly in your own words.

Terse. Table speed. The DM is at the table — don't ask for AC, HP, or ranges. Roll, print, stop.
