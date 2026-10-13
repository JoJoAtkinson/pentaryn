---
created: 2026-10-07
last_modified: 2026-10-11
tags: ["foundry", "vtt", "module", "lights", "dnd5e"]
status: active
---

# Pentaryn Senses (`pentaryn-senses`)

**Read this when:** you are changing or calling `pentaryn-senses` (carried lights, the Light
cantrip, torches and lanterns, the broken glow, token chains, the darkvision sight reset). **Not
this file:** why the Light feature is shaped as it is →
[`context/plans/senses-light-cantrip.md`](../../../context/plans/senses-light-cantrip.md) · how
every addon is built → [`context/foundry/addon-blueprint.md`](../../../context/foundry/addon-blueprint.md)

Lights for dnd5e 6 (verified 6.0.6). Full tier. Token vision from the sheet's senses is dnd5e's own
since 6.0 (setting `senseVisionSync`); this module only clears, once per world, the darkvision
sight its retired 0.3 sync stored on tokens.

## What the player sees

**Lights carried by items.** An item with `flags.pentaryn-senses.light` (token light data, e.g.
Caven's Shattered Amethyst Dragon Shard) lights whoever carries it; drop it, trade it or lose it
and the carrier goes dark. A lit torch, lamp, lantern or candle does the same. With several, the
strongest (largest dim, then bright) wins. A light set by hand (a rune glow) is never lost: a
carried light covering it keeps it aside and gives it back when the carried light goes. A token
that changes body (Wild Shape, polymorph, and back) takes the carried lights of the actor it now
shows: a beast form carries none, so a druid's starlight or torch does not come along.

**Torches, lamps, lanterns, candles.** A **flame button** on the inventory row (grey unlit, orange
lit) lights or puts out the item and posts one chat line in the user's chat mode (a GM on "GM only"
stays private). The item's own **Light** activity does the same and **uses nothing up**. A lit
**hooded lantern** also gets a hood button (bright 0 / dim 5 while lowered), with its own chat
line. A lit item that is outshone by a stronger one is drawn dimmer and its tooltip names the
winner. Items stay lit until put out.

| Item (dnd5e identifier) | Bright / Dim (ft) |
|---|---|
| Light cantrip | 20 / 40 |
| `torch` | 20 / 40 |
| `candle` | 5 / 10 |
| `lamp` | 15 / 45 |
| `lantern-hooded` | 30 / 60 (hood down 0 / 5) |
| `lantern-bullseye` | 60 / 120, all round (no cone yet) |

Matched by identifier, then by name (`Lantern, Hooded`). A magic lantern may carry its own
profile in `flags.pentaryn-senses.lightItem`.

**The Light cantrip.** The PHB spell is left as shipped; its floor-token summon is skipped and a
prompt asks **Where does the light go?** — **On me** (your token on the viewed scene glows, and the
glow follows it, through portals too), **Pick a target** (crosshair: click a token or a square;
right-click or Esc cancels; an open Combat HUD panel closes first), **Not now**. The chat card keeps
**On me · Pick a target · End light** as icons in its action row. Casting again moves the light;
**End light** is also on a lit token's HUD for the caster and the GM. If the lit creature is
deleted the light ends and the caster gets a whisper; a GM who deletes a Light square by hand ends
it, one who drags it moves it. Two casters on one token: the newer wins. The cast notice names the
token only if you could see its nameplate.

**Broken glow (wandering).** A light animation for a broken crystal: size (from the token's own
square up to the light's Dim radius) and brightness (0.3 to 0.85) ride a wave whose swells never
repeat, mostly small, now and then swelling. The radius really changes (vision follows). Every
client computes the same wave from the server clock.

**Token chains.** An iron chain drawn from an anchor token's centre to a chained token's, just
under the tokens (fog and vision hide it like the map); it follows drags and moves. Graphics only:
the GM judges the reach. Token HUD (GM): **Break chain** on either end; **Chain to <anchor>** on an
unchained token while exactly one other token is targeted. A chain with either end hidden (the
chained token or its anchor) shows to the GM only.

**Darkvision reset.** At the active GM's first ready on dnd5e 6 (with `senseVisionSync` on), every
stored darkvision sight our old sync wrote goes back to basic / 0 so the sheet drives vision.

## Settings

| Key | Scope | Shown | Meaning |
|---|---|---|---|
| `sightReset` | world | no | store row: 1 once the darkvision reset has run in this world |

## API — game.pentaryn.senses

Also `game.modules.get("pentaryn-senses").api`. Kit members: `describe()`, `version`, `contract`,
`settings()`, `trace()`, `uninstall()`. `game.pentaryn.chain` is the same object as
`game.pentaryn.senses.chain`. Legacy rows keep their old positional signatures.

| Call | Does |
|---|---|
| `inspect(ref, {sceneId?, base?, as?})` | why a token is lit as it is: its light and owner flag, the carried light and every carrier, its chain, the Light cantrips. Read-only; a player without OBSERVER gets no `actor`/`lightSpells` |
| `syncLight(actor)` · `syncAll()` · `carriedLight(actor)` | carried lights: sync one actor / the world; what an actor's items give |
| `resetSight({force})` | rerun the darkvision reset → `{prototypes, tokens}` or null |
| `light.cast(item, {token} \| {x, y})` · `.end(item)` · `.onMe(item)` · `.pick()` · `.prompt(item)` | the Light cantrip |
| `light.status(itemRef)` → `{cast, litBy}` · `light.reconcile(uuid)` → summary · `light.recent()` | what a Light does now; force a reconcile; the last 20 summaries |
| `light.toggle(item)` · `.hood(item)` · `.profileFor(item)` · `.setup()` (= `setupLight()`) · `.sweep()` | lit items; give every Torch its Light activity; the GM ready sweep |
| `chain.link(chained, anchor)` · `.break(token)` · `.links(scene?)` · `.repaint()` | tokens as documents, placeables, ids on the viewed scene or Token uuids; a scene or its id |

No `inspect` field is GM-only beyond the `as` rule above.

## Data written

| Where | Flag | Written by |
|---|---|---|
| Token, prototype | `flags.pentaryn-senses.itemLight` (+ `itemLightPrior`, the hand-set light it covers) | carried lights (writer client) |
| Token, AmbientLight | `flags.pentaryn-senses.spellLight` = `{source, prior}` | Light reconcile (active GM) |
| Light item | `flags.pentaryn-senses.lightCast` | the caster |
| Torch, lamp… | `flags.pentaryn-senses.lit`, `.hooded`; activity `psLightToggle000` (`lightToggle`) | the owner; `setupLight` / the GM on create |
| Token (chained end) | `flags.pentaryn-senses.chain` = `{anchor}` | GM |
| Token, prototype | `sight.visionMode`/`range` (basic / 0), once | darkvision reset (active GM) |

## Flags other modules read

| Flag | Who |
|---|---|
| `flags.pentaryn-senses.light` (item) | **written** by pentaryn-transform (the Starry form lights the druid through it) |
| `itemLight`, `spellLight` (token) | pentaryn-creatures leaves a token light alone while either is set |

## Events

n/a — emits none.

## Patches and adjustments

No wraps. Adjustments rows: `dnd5e-sense-vision-reset` (`migrate.mjs`), `dnd5e-chat-message-types`
(the spell card, `light-ui.mjs`), `argon-light-pick-collapse-panels` (`argon.mjs`). Private or
third-party reads (rows pending in the adjustments batch): the light-animation shader classes
(`glow.mjs`), `Token#_preview` and `PrimaryCanvasGroup.SORT_LAYERS` (`chain.mjs`), dnd5e's
`create.summons` / `placeSummons` (`light.mjs`, `light-ui.mjs`), core teleport `replacements`
(`light.mjs`).

## Two sessions / who writes

Carried lights: the active GM's client, or any GM while none is active. The Light reconcile, the
torch-on-create hook, the sweep and the darkvision reset: the active GM only. Chains: any GM.
Players write only their own items (cast, toggle, hood). Two tabs on the GM account both run the
active-GM paths; the carried-light, torch and reset writes are idempotent, the Light reconcile's
square creation is not (see the wave-3 report).

## Extending

- **A light source:** a `LIGHT_PROFILES` row (and an `ALIASES` spelling) in `core/light.mjs`, plus a
  row in `test/light-core.test.mjs`.
- **A feature:** a file exporting `install(reg, ctx)` / `uninstall()`, added to `FEATURES` in
  `senses.mjs`; hooks through `reg.on`, shared state through `ctx.expose`.
- **An API method:** a row in `api-manifest.mjs`, the function exposed by its feature, the binding
  in `api.mjs`, then `GOLDEN_UPDATE=1 node --test test/api.test.mjs`.

## Pitfalls

- `dnd5e.preUseActivity` returns a literal `false` for a lit-item toggle (no consumption); the
  Light cantrip's own use is never vetoed (the card must post). Keep the handler synchronous.
- The pick crosshair uses one `!important` over PIXI's inline cursor (removing it is declared).
- The glow re-initializes at most every 50 ms of the light's own clock (server time × speed / 5)
  and only for a change of 3 px or more, so a faster animation re-inits more often.
- Only the entry registers lifecycle hooks; a feature never self-installs.

## Files

| File | Role |
|---|---|
| `senses.mjs` | entry: wiring only |
| `senses-core.mjs` | pure barrel: constants; re-exports `core/` (`ids`, `util`, `chain`, `light`, `migrate`, `glow`, `inspect`) |
| `settings.mjs` | `SETTINGS` and the setting readers |
| `api-manifest.mjs`, `api.mjs` | API rows; their bindings, `inspect`, `light.status` |
| `carried.mjs`, `light.mjs`, `chain.mjs`, `glow.mjs`, `migrate.mjs` | features |
| `light-ui.mjs` | UI: prompt, pick, spell card, inventory row, Token HUD |
| `light-adapter.mjs`, `argon.mjs` | adapters: documents → plain data; `ui.ARGON` |
| `lib/` | vendored kit — never edited here |

## Tests

```bash
node foundry/module/pentaryn-senses/test/run.mjs   # the gate (make foundry-senses-check)
```

`core`, `core-pure`, `light-core`, `migrate`, `glow`, `util` test the pure files; `glue*`,
`hooks`, `api`, `i18n`, `settings`, `inspect`, `carried*`, `chain*`, `light*`, `adapters`,
`reconcile-summary` the Foundry side on the kit stub.

## Sync

`make foundry-senses-sync`, then reload (a `module.json` change needs a restart). Check:
`game.pentaryn.senses.describe().version`, `game.settings.get("pentaryn-senses", "sightReset") === 1`,
`game.pentaryn.chain.links()`.
