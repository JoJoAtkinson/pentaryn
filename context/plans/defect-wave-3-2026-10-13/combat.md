---
title: "Defect wave 3 2026-10-13 — combat"
status: done
last_modified: 2026-10-13
tags: [plan, record, defect-wave, foundry]
---

**Read this when:** you want the history of defect wave 3 for combat (pentaryn-combat): what was fixed, how, and how to check it live. This is history, not instructions.

# Defect wave 3 2026-10-13 — combat

Branch `wave3/combat-2026-10-13`, 3 fix commits on top of `e392ba56`. These are the three combat items
in wave 2's "Defects seen live, not fixed in this wave" list. Each fix is a declared behaviour change
that Joe approved on 2026-10-13 ("fix all small bugs found live"). Where Joe gave no ruling, the
wave's recommendation was taken. The gate is `make foundry-combat-check`, and it is green:
299 tests, 329 core fixtures, conformance 48/50 with the accepted exceptions C12 and C23.

Shipped files changed: `api.mjs`, `shapes.mjs`, `turnflow/death.mjs` and `README.md`. There is no
`module.json`, lang or styles change, so a **reload** is enough (blueprint §10).

## Fixes

| item | defect | what changed (plain words) | commits | test |
|---|---|---|---|---|
| combat-1 | `game.pentaryn.combat.inspect(actor, null)` threw an uncoded TypeError (`api.mjs:54` destructured `{ as }` from null) | If `opts` is null or not an object, `inspect` now throws the module's coded `BAD_ARGS: inspect: opts must be an object or omitted, got null`. The row already declared `BAD_ARGS`. Omitted `opts` and `{}` still read as before. | 2cd38a44 | api-kit.test (null, a number, a string); graph golden |
| combat-2 | `api.plan` scanned weapons for a Multiattack actor before its Multiattack check, so it threw when an item's `properties` were not iterable | `planFor` checks the Multiattack first. It picks a default weapon only when there is no Multiattack, because a Multiattack plan never reads that weapon. Plans for actors without a Multiattack are unchanged. | e8d130cf | api.test (an NPC whose Maul has `properties: 5`); legacy-oracle and api-calls golden unchanged |
| combat-3 | the massive-damage GM whisper used the actor's name | The whisper names the token (the speaker alias), the same name the public Death Saving Throw card uses. The README row says so. | 69e8a4aa | turnflow.test ac-6 (token renamed "Masked Knight") |

## Goldens changed

- `graph.json`: combat-1 adds the edge from `api.mjs` to `lib/errors.mjs`, the vendored kit's `codedError`.

Every other golden is byte-identical, including `api-calls.json`, `describe.json` and `turnflow-death.json`.

## Live check after deploy

Use scratch documents only (ZZ prefix) and delete them afterwards. Never use the real PCs or the campaign scenes.

- **combat-1**: create `ZZ Inspect` (any NPC). `game.pentaryn.combat.inspect("ZZ Inspect", null)`
  throws an error whose `code` is `"BAD_ARGS"` and whose message starts `BAD_ARGS: inspect:`.
  `inspect("ZZ Inspect")` and `inspect("ZZ Inspect", {})` still return the full state.
- **combat-2**: this is code only, and `api.test` covers it. A non-iterable `properties` happens only in memory. As a smoke
  check, `game.pentaryn.combat.plan("ZZ Inspect")` on an NPC with a Multiattack returns its
  Multiattack plan as before.
- **combat-3**: put `ZZ Massive`, a character with 20 max HP, on a ZZ scratch scene and rename its token `ZZ Masked`. Set its HP to 0
  and apply 25 damage from a damage card. The public card and the GM whisper both say
  `ZZ Masked`, and neither says `ZZ Massive`. Delete the scratch actor and scene.

## Live check result (FIX-W3, 2026-10-13)

Run in the MCP bridge GM tab on world `pentaryn` (Foundry 14.369, dnd5e 6.0.6), no restart or reload.
The served `api.mjs`, `shapes.mjs` and `turnflow/death.mjs` hash the same as main. Scratch docs were
named `ZZ combat …` (so `ZZ combat Inspect`, `ZZ combat Massive`, token `ZZ combat Masked`, scene
`ZZ combat Scratch`).

| item | result | evidence |
|---|---|---|
| combat-1 | pass | `inspect("ZZ combat Inspect", null)` threw `PentarynError`, `code: "BAD_ARGS"`, "BAD_ARGS: inspect: opts must be an object or omitted, got null"; a number and a string gave the same with "got number" / "got string". Omitted opts and `{}` returned the full state (16 keys) and the same JSON |
| combat-2 | pass | `ZZ combat Inspect` is the SRD Bandit Captain. With its Multiattack set to `makes two [[/item Scimitar]] attacks and one [[/item Dagger]] attack`, `plan()` returned 3 swings (Scimitar, Scimitar, Dagger), the same JSON as the pre-fix computation (`fullAttackPlanOf` with `chosenWeapon` first), and `inspect().plan` agreed |
| combat-3 | pass | a linked character with 20 max HP at 0 HP, with its token renamed `ZZ combat Masked` on the viewed scratch scene, took 25 bludgeoning through `applyDamage` with a GM-roll DamageRoll card as `originatingMessage`. Public card: alias `ZZ combat Masked`, "ZZ combat Masked takes damage at 0 Hit Points: a Death Saving Throw failure (1 of 3)." GM whisper: "ZZ combat Masked took 25 damage, at or over their Hit Point maximum (20). …". Neither says `ZZ combat Massive` |

Seen while checking, and not part of this wave: the SRD Bandit Captain's own 2014-style Multiattack text
("makes three melee attacks: two with its [[/item …]]{scimitar} and one with its [[/item …]]{dagger}")
does not parse, so `plan()` falls back to one swing. `parseMultiattack` handles only the 2024 forms it
lists.

Cleanup: the GM view went back to the active scene. The two ZZ actors, the scratch scene and the three
ZZ chat messages were deleted. No ZZ actor, scene, item, message or combat is left.
