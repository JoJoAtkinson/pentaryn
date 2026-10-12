# Defect wave 2026-10-12 — names (pentaryn-names)

**Read this when:** you want the history of the 2026-10-12 defect wave for the names module (`pentaryn-names`): what was fixed, why, and how to check it live. History, not instructions.

Source records: [`final-review-2026-10-12/names.md`](../final-review-2026-10-12/names.md),
[`playtest-overnight-2026-10-12.md`](../playtest-overnight-2026-10-12.md). Branch `fix/names-2026-10-12`.
Gate: `make foundry-names-check` — 57/57 tests, vendored kit identical, conformance 100 %.

| id | defect | Joe's ruling | what changed (plain words) | commits | test |
|---|---|---|---|---|---|
| names-edge-1 (+rob-1) | Renaming an unlinked token's actor relabelled every copy of that creature on every scene (and their combatants), and counted and toasted a prototype-name write that Foundry drops | Option A: only that token; no prototype write | Renaming the actor of one unlinked token now changes only that token's label (and, on the GM's client, its combat-tracker entry). Other copies and the prototype token stay as they were. The toast counts just that one token. `api.sync` still treats a token or synthetic actor as its base actor (unchanged). | `d4b2e8a8` | `test/synthetic-rename.test.mjs` (two `names-edge-1:` tests) |
| names-ac-2 (+edge-2) | In a batch rename of several actors, every actor was relabelled from the **last** actor's old name, so the others' tokens kept their old labels | Take the recommendation (key by id) | The old name is saved per actor id (`options.pentarynOldNames[actor.id]`, was the single key `pentarynOldName`), so each actor's tokens switch from its own old name to its new one. Nothing outside the module reads the key. | `425e9c82` | `test/glue.test.mjs:202` (`names-ac-2: …`) |

Both items are declared behaviour changes, with lines under the CHANGELOG `Unreleased` header. No version bump.

## Goldens changed

None. `git diff origin/main...fix/names-2026-10-12 -- '**/golden/**'` is empty.

## Live check after deploy

Use only ZZ-prefixed scratch actors and scenes. Never use Caven, Marrith, Talo or a campaign scene. Delete the scratch documents afterwards.

**names-edge-1**
1. Create an NPC actor `ZZ Goblin` with an **unlinked** prototype token named `ZZ Goblin`, and a scene `ZZ Names Test`. Place two tokens of it (A and B). Add token A to a combat.
2. Open token A's sheet (the synthetic actor) and rename it to `ZZ Gob A`. Expect: token A's label and its combatant read `ZZ Gob A`. Token B still reads `ZZ Goblin`, and the world actor's `prototypeToken.name` is still `ZZ Goblin`. One toast: `Token labels updated to "ZZ Gob A" (1).`

**names-ac-2**
1. Create two actors, `ZZ Bob` and `ZZ Glub`, each with a placed token on `ZZ Names Test` whose label matches its name.
2. Rename both in one call: `Actor.updateDocuments([{_id: bob.id, name: "ZZ Rob"}, {_id: glub.id, name: "ZZ Glubbek"}])`. Expect: the tokens read `ZZ Rob` and `ZZ Glubbek`, and both prototypes match. Before the fix, `ZZ Bob`'s token stayed `ZZ Bob`.
