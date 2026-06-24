# Testbot decision — BUG-RAGER-BERSERK-TYPE (fire #256 check-in)

- **Run timestamp:** `20260624T000000`
- **Fire:** #256
- **Phase:** B (generative playtest — scenario: thrulm-rager-berserk-gate)
- **Result:** FAIL (expected — bug still open)
- **Bug age:** 15+ fires (first logged before R241; still open)

## What was found

The `derro-rager.berserk` action in `combat-runner/actions.jsonl` is authored as type
`"utility"`. The runner narrates when "berserk" is typed but rolls **no dice**.

The expected behaviour is one Greataxe attack (+4, 1d12+2 slashing) against each creature
within 5 ft. The effect field correctly documents this mechanic but the runner ignores effect
fields for dice — it only rolls for `single_attack`, `multiattack`, and `area` types.

Current DB entry effect field:
> RECHARGE 5-6. Make one Greataxe attack (+4, 1d12+2 slashing) against EACH creature within 5 ft. The rager makes these attacks simultaneously, not sequentially. [...]

The attack info lives only in the effect text — it's never rendered as dice output.

## Why not auto-fixed

The hard rule: **"Never commit actions.jsonl changes unless you used `combat_action_upsert`
via the MCP server AND ran `python scripts/combat_actions_db.py validate` with 0 errors."**

The MCP server is not available in the remote execution environment that fires this cron.

## Recommended fix (for next interactive session with MCP)

Re-author via `combat_action_upsert`:

```python
combat_action_upsert(
  npc="derro-rager",
  action="berserk",
  spec={
    "type": "area",
    "verbs": ["berserk", "frenzy", "rampage", "spin", "sweep"],
    "area": "each creature within 5 ft",
    "recharge": 5,
    "narration": "The rager's eyes go black — the greataxe describes a full circle and everything in reach pays for it.",
    "damage": {"dice": "1d12", "type": "slashing"},
    "save": {
      "dc": 0,
      "ability": "none",
      "on_save": "half",
      "notes": "No save — this is an attack roll per target, not a save. Use attacks array instead if attack-per-target semantics are needed."
    }
  }
)
```

Actually, since this hits multiple individual targets with an attack roll (not a save), it's more
accurately a `multiattack` type where the number of attacks is dynamic (equals number of creatures
within 5 ft). The `area` type with `save` is a workaround — a better long-term fix is a custom
spec that supports "repeat attack for each creature in range." If that's not currently possible,
use `area` type (simplest path) and accept that the runner treats it as a DC-less save effect.

**Simplest unblocking fix:** Re-author as `area`, `damage: {"dice": "1d12", "type": "slashing"}`,
`save: null` or omit save. The runner will emit the 1d12 roll on any creature in range.

## At-table impact until fixed

The DM must manually roll 1d12+2 for each creature within 5 ft when "berserk" fires. The runner
provides the narration but no mechanical output. This has been the workaround for 15+ fires.
