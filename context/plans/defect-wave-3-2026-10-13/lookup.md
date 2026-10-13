# Defect wave 3 2026-10-13 — lookup (pentaryn-lookup)

**Read this when:** you want the history of defect wave 3 (2026-10-13) for the rules-lookup module (`pentaryn-lookup`, `game.pentaryn.rules`): what was fixed, why, and how to check it live. History, not instructions.

Source: the "Still open" list in [`../defect-wave-2-2026-10-12/README.md`](../defect-wave-2-2026-10-12/README.md) (lookup row). Branch `wave3/lookup-2026-10-13`.
Gate: `make foundry-lookup-check` — 199/199 tests, vendored kit identical (9 files), conformance 100 % (45/45).

Joe gave no item-specific ruling, so the item takes the recommendation. It is a declared behaviour change, with a line under the CHANGELOG `Unreleased` header. No version bump. Only `.mjs` files (and docs/goldens) changed: a **reload, not a restart** (blueprint §10).

| item | defect | what changed (plain words) | commits | test |
|---|---|---|---|---|
| lookup-2014-uuid | `onList(<2014 SRD spell uuid>, "wizard")` answered `onList: false` for a spell that is on the wizard list. dnd5e's spell-list registry holds the 2024 copies (PHB, SRD 5.2), and `SpellList#has` matches by uuid, so the 2014 copy never matched. | When the 2014 spell itself is not on the list, `onList` looks for its 2024 counterpart in the PHB and 2024 SRD spell packs — same `system.identifier` first (2014 "Melf's Acid Arrow" → 2024 "Acid Arrow"), else the same name — and answers `true` if that copy is on the list. The answer still names the 2014 spell (`uuid`, `edition: "2014"`) and adds `listedAs`, the counterpart's uuid. A 2014 spell with no counterpart, or whose counterpart is off the list, still answers `false`. 2024 spells answer exactly as before. The manifest's `returns`/`doc` for `onList` name `listedAs` (one `describe.json` golden row). | `b72a4bd2` (fix), `2714fb7c` (golden) | `test/onlist-2014-uuid.test.mjs` (fails on the parent `e392ba56`: 2 of 5) |

## Live check after deploy

Read-only: no ZZ docs needed, nothing is created or changed. One GM tab, after a **reload** (no restart).

1. Find the 2014 SRD Fireball's uuid:
   `const i = await game.packs.get("dnd5e.spells").getIndex(); const u = "Compendium.dnd5e.spells.Item." + i.find(e => e.name === "Fireball")._id;`
2. `await game.pentaryn.rules.onList(u, "wizard")` → `onList: true`, `edition: "2014"`, `uuid` is `u`,
   `listedAs` is a `Compendium.dnd-players-handbook.spells.Item.…` (or `dnd5e.spells24`) uuid. Before
   the fix: `onList: false`, no `listedAs`.
3. `await game.pentaryn.rules.onList(u, "cleric")` → `onList: false`, no `listedAs`.
4. `await game.pentaryn.rules.onList("Fireball", "wizard")` → `onList: true`, no `edition`, no `listedAs` (unchanged).
5. Optional rename case: the 2014 "Melf's Acid Arrow" uuid against `"wizard"` → `onList: true` with
   `listedAs` the 2024 "Acid Arrow" uuid — only if the two copies share `system.identifier` in the
   installed packs; if they do not, `false` is the expected (unchanged) answer.
6. `await game.pentaryn.rules.selftest()` → `ok: true`.
