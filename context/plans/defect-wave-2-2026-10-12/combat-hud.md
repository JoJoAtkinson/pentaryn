# Defect wave 2 2026-10-12 — combat-hud

**Read this when** you want the history of defect wave 2 (2026-10-12) for the combat-hud group
(module `pentaryn-combat`): what was fixed, why, which goldens moved, and how to check it live.
History, not instructions — the use-doc is the module's own
[`README.md`](../../../foundry/module/pentaryn-combat/README.md).

Branch `fix2/combat-hud-2026-10-12`. Joe approved defect wave 2 on 2026-10-12 ("Let's create a
dynamic workflow to solve all of these things"); where he gave no ruling the review's
recommendation was taken. Sources: the final review records in
[`final-review-2026-10-12/`](../final-review-2026-10-12/). Gate `make foundry-combat-check`:
276/276 tests, 327 core fixtures, vendored kit identical, conformance 96.0 % (accepted
exceptions C21, C23 — unchanged). Nothing was reverted. Only `.mjs`, `.css` (a comment) and the
README changed — no `module.json`, `lang/` or kit change, so a reload is enough.

| id | defect | ruling | what changed (plain words) | commits | test |
|---|---|---|---|---|---|
| ext-3 | Each special action's follow-up was hand-coded; the Shove-uses-an-Attack rule lived in several places. | Approved (recommendation) | Dash, Disengage, Dodge, Hide and Shove work as before. Their follow-ups come from one table, and the Shove rule is one row. | `4f03f494` `eb80d0b9` | `turnflow.test.mjs`; golden `turnflow-specials.json` (new off-turn Dodge/Hide rows pinned first, then byte-identical) |
| perf-1 | One flag write recomputed each actor's attack state 10–18 times. | Approved (recommendation) | The HUD works each actor's attack state out once per burst; bars look the same. | `fd862292` | `hud.test.mjs` (Fighter 5 flag burst → one `fullAttackState`) |
| ac-2 | A HUD that closed mid-redraw after a setting change left an uncaught error. | Approved (recommendation) | The failed redraw goes to the debug log. | `490a3cde` | `failure-paths.test.mjs` |
| ac-1 | A failed save of "picker tutorial seen" was an uncaught error. | Approved (recommendation) | One console warning instead; nothing on screen. | `59375cbc` | `hud.test.mjs` |
| ac-3 | A HUD refresh after a finished sequence or deleted combat could throw uncaught. | Approved (recommendation) | Goes to the debug log quietly. | `cdaf5d37` | `hud.test.mjs` |
| rob-5 | A held token that vanished before the HUD caught up threw from a timer. | Approved (recommendation) | The HUD skips it and logs a warning. | `aac57c52` | `turnflow.test.mjs` |
| perf-2 | Follow-up attacks were worked out three times per change. | Approved (recommendation) | Worked out once; bars look the same. | `aecb4b17` | `hud.test.mjs`; follow-ups-now golden byte-identical |
| perf-3 | A Multiattack monster with one broken weapon item lost its Full Attack count. | Approved (recommendation) | Multiattack actors no longer scan weapons for an off-hand Nick swing, so the Multiattack total always shows. | `4bef2729` | `hud.test.mjs` |
| perf-4 | Deleting several combats ran the orphan-flag sweep once per combat, possibly overlapping. | Approved (recommendation) | One sweep, 1.5 s after the last delete; a running sweep is never re-entered; the timer is cancelled on uninstall. | `7f996e46` | new `orphan-sweep.test.mjs` |
| ac-4 | Two GM tabs both ended Dodge/Dash/Disengage/Reckless and returned Reactions; a combat delete warned on an effect the other tab had removed. | Approved (recommendation) | One tab claims each turn change and sweeps; the other stands down. An already-gone effect counts as removed. | `91657bad` | `turnflow.test.mjs` (two socket ids); goldens `describe.json`, `graph.json`, `turnflow-boundary.json` |
| ac-5 | Orphan turn/Reaction flags were cleared with one save per actor. | Approved (recommendation) | One batched save for all affected actors. | `102b1a48` | `flag-cleanup.test.mjs`; goldens `ready-calls.json`, `turnflow-delete-combat.json` |
| ac-6 | Death-save failure / massive-damage cards posted before the damage landed, and the public card used the actor's name. | Approved (recommendation; token names in cards) | Cards post only after the damage is applied (a cancelled application posts none); the public card speaks as the token. | `6ebdb7f1` | `turnflow.test.mjs`, `hooks.test.mjs`; goldens `describe.json`, `hooks.json`, `listeners.json`, `turnflow-death.json` |
| ext-7 | With no range/reach set, Full Attack used the grid size but follow-ups and Retarget did not. | Approved (recommendation) | All three fall back to the scene's grid distance. | `0a0b2b5e` | `hud.test.mjs` |
| ext-8 | Dash, Disengage and Steady Aim each built their until-end-of-turn effect separately. | Approved (recommendation) | One shared builder; effects look and expire as before. | `c451a257` | `core.test.mjs`, `core-fixtures.mjs`, `api.test.mjs`; golden `surface.json`; `turnflow-specials.json` byte-identical |
| M7 | Each feature file had its own temp-hook and hook-label helper. | Approved (recommendation) | One shared helper in `context.mjs`. Nothing changes at the table. | `949b2eba` | `hooks.test.mjs`; goldens `graph.json`, `graph-allow.json` (hooks golden byte-identical) |
| M8 | The HUD bars did the sequence and riders' cleanup on turn change / shape change. | Approved (recommendation) | The runner and riders own their cleanup listeners; bars only redraw. | `5602e5ac` | `hooks.test.mjs`, `session-maps.test.mjs`; goldens `hooks.json`, `listeners.json`, `describe.json`, `graph.json` |
| M9 | README explained the per-player Quick / rider Ask-Auto flags twice. | Approved (recommendation) | Explained once. | `d9a0a90f` | `docs.test.mjs` |
| ext-11 | README's "add a follow-up kind" recipe missed two HUD spots. | Approved (recommendation) | It now names the per-source tooltip text and hiding the duplicate off-hand slot. | `27f8b571` | `docs.test.mjs` |
| css-40 | A combat.css comment named the wrong file for the follow-up pulse. | Approved (recommendation) | Comment points at `hud/bars.mjs` `pulseNew`. | `1a7ec66d` | `css.test.mjs` |

## Goldens changed

`describe.json`, `graph.json`, `hooks.json`, `listeners.json`, `ready-calls.json`,
`surface.json`, `turnflow-boundary.json`, `turnflow-death.json`,
`turnflow-delete-combat.json`, `turnflow-specials.json` (new rows only), plus
`test/graph-allow.json`. Each move is named in the row that caused it.

## Live check after deploy

Reload the GM tab after the deploy. ZZ scratch docs only; delete each after.

- **ext-3 / ext-8 / perf-1 / perf-2** — On a ZZ scene with a ZZ Fighter 5 in a ZZ combat:
  use Dash, Disengage, Dodge and Shove from the HUD; the follow-up buttons and until-turn-end
  effects match the pre-wave behaviour, and Shove spends an Attack swing, not the Action.
- **perf-3** — Create a ZZ NPC with a Multiattack and one weapon whose range field is broken;
  the HUD Full Attack tile shows the Multiattack total and `api.plan(<ZZ NPC>)` does not throw.
- **perf-4 / ac-5** — Start three ZZ combats with ZZ tokens that get turn flags, delete all three
  quickly; after ~1.5 s the console shows one orphan sweep and the ZZ actors' turn/Reaction
  flags are gone.
- **ac-4** — Code only (one GM tab rule): turnflow test with two socket ids.
- **ac-6** — ZZ PC at 0 HP on the ZZ scene: apply 5 damage from a damage tray → exactly one
  death-failure card, posted after the HP update, under the token's name. Apply a hit of 2×
  max HP → one massive-damage card whispered to the GM.
- **ext-7** — ZZ scene with grid distance 10 ft: a ZZ Fighter with a weapon lacking range;
  the off-hand follow-up picker, the Retarget picker and the Full Attack picker all highlight
  the same 10 ft ring.
- **ac-1 / ac-2 / ac-3 / rob-5** — Code only (failure paths); during the checks above the
  console shows no uncaught errors from `pentaryn-combat`.
- **M7 / M8 / M9 / ext-11 / css-40** — Code/docs only; advance a turn in the ZZ combat and the
  HUD bars redraw normally.
