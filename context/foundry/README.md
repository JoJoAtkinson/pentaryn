---
title: "Foundry — domain root"
status: active
last_modified: 2026-08-22
tags: [context, foundry, index]
---

# Foundry — domain root

**Read this when:** doing anything in or around Foundry VTT — scenes, actors, tokens, the
server, the tunnel, the updater, the asset pipeline.
**Not this file:** current one-shot state (which scenes exist, who is where, actor IDs) →
[`../space-journey.md`](../space-journey.md) · lore authoring → [`../world/README.md`](../../world/README.md)

> **No dated entries in this file.** Session findings and campaign state go in
> `../space-journey.md`. What lives here is durable: things that stay true after the
> current one-shot ends. This file was 230 lines of both once, and it cost every
> Foundry session a week of stale bed assignments.

---

## The world

World `ardenhaven` · Foundry **v14.365** · system **dnd5e 5.3.3** · **D&D 2024 rules**

Use the 2024 compendium packs: `dnd5e.spells24`, `dnd5e.equipment24`, `dnd5e.feats24`,
`dnd-players-handbook.*`. Not the 2014 `dnd5e.items` pack unless an item exists only there.

**Tools:** `mcp__foundry__*` for world ops (`eval-js` is the escape hatch).
`mcp__dnd-scripts__*` for SRD lookups, campaign-time math, and repo operations.

---

## Route by task

| Doing… | Read |
|---|---|
| Day-to-day server ops — start/stop, tunnel, OneDrive sync, module install | [`ops.md`](ops.md) |
| "Put X here" / "replace the red one" — anything naming a spot on a map | [`markers.md`](markers.md) |
| "The party goes upstairs" — Region + teleport scene links | [`scene-links.md`](scene-links.md) |
| "Set it on fire" / "the building goes up" — the Fire Kit | [`fire.md`](fire.md) |
| Who-knows-who, social graph, possession marks — at the table | [`../../foundry/module/pentaryn-ties/README.md`](../../foundry/module/pentaryn-ties/README.md) |
| One-click Sneak Attack, off-hand damage with no ability mod | [`attack-activities.md`](attack-activities.md) |
| Completing hand-drawn walls | [`../../foundry/module/pentaryn-walls/README.md`](../../foundry/module/pentaryn-walls/README.md) |
| Attunement — the sidebar slots, over-cap warnings, "why is this item doing nothing" | [`../../foundry/module/pentaryn-attunement/README.md`](../../foundry/module/pentaryn-attunement/README.md) |
| Finding one battlemap out of ~1,750 | [`map-library.md`](map-library.md) |
| The unattended Saturday updater — before touching it | [`automated-updates.md`](automated-updates.md) |
| Running the updater as an operator — commands, setup, retention | [`../../automation/README.md`](../../automation/README.md) |
| The `actors.json` generator ⇄ importer contract | [`../../foundry/CONTRACT.md`](../../foundry/CONTRACT.md) |
| **Changing** how any of this was built — design docs, migration records | [`../plans/`](../plans/) |

---

## Token conventions — applied world-wide

Ring tiers: **gold** `#ffcc4d` PC · **red** `#d8433a` foe · **green** `#86c98a` named/talkable ·
**grey** `#9098a0` mook · **no ring** = crowd.

Subject textures follow Foundry's ⅔ safe-area spec, in
`FoundryVTT/Data/assets/tokens/custom/ring-subjects/`. Muted crowd art lives in
`.../generic-villagers/`. Build one with `scripts/foundry/ring_subject.py`.

**Rotation is locked world-wide.** `lockRotation: true` on every actor prototype and every
placed token, plus `core.prototypeTokenOverrides.*.lockRotation = true` so new tokens
inherit it. Tokens face their art's orientation and never spin toward the direction of
travel. Don't re-enable per-token without asking.

**A ringed token draws `ring.subject.texture`, not `texture.src`.** Re-art one without the
subject and it silently keeps the old picture — looks like a stale client, isn't. Placed
tokens don't inherit prototype changes either. See `scripts/foundry/README.md`.

**A ringless crowd token draws the opposite field — `texture.src`.** So crowd art gets the
⅔ subject webp in **both** `texture.src` and `ring.subject.texture`; point `texture.src` at
the raw art and the crowd renders 1.5× the ringed NPCs beside it. Sweep snippet in
`scripts/foundry/README.md`.

**Standing quirk:** derived token/actor data goes stale after writes. Verify with
`actor.reset()` or `await canvas.draw()`, never by reading `_source`.

**Possession is marked per-token, not per-actor** (`pentaryn-ties`). Token HUD →
masks-theater button, GM-only, `token.flags["pentaryn-ties"].worn = {by, note}`. Never mark
a host on the actor — the same actor appears in more than one scene, and the ties graph must
keep showing the *host's* own relationships. See [`../plans/foundry-npc-ties.md`](../plans/foundry-npc-ties.md) for the design, and the module's own README to use it.

---

## Scripts & data

- `scripts/foundry/` — `build_actors.py`, `build_scenes.py`, `prep_map.py`, `cloud.py`,
  `license_key.py`, `ring_subject.py`, `travel_glyph.py` (scene-link indicator art)
- `scripts/foundry/update/` — the unattended updater (scan → adjudicate → apply → smoke →
  recover). `make vtt-update-dry` is read-only and safe with the world up.
- `scripts/foundry/admin_password.py` — server admin password (Infisical + keychain), same
  contract as `license_key.py`
- `foundry/actions.jsonl` — pre-computed action specs; the input to `build_actors.py`.
  Author rows with the `combat_action_upsert` MCP tool, never by hand.
- `foundry/update-policy.yml` — what may auto-apply, pins, retention, the run window
- `foundry/cloudflared/config.yml` — tunnel ingress; **`/setup`, `/auth`, `/update` and
  `/license` are 403 through `vtt.atjoseph.com`**, admin is localhost-only
- `foundry/CONTRACT.md` — the `actors.json` generator ⇄ importer contract
- `foundry/assets-manifest.json`, `foundry/roll20-maps.json`
- `foundry/module/` — six in-house modules: `pentaryn-ties`, `-walls`, `-importer`,
  `-pings`, `-dropbin`, `-attunement`
