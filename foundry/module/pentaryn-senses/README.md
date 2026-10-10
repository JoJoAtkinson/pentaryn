# pentaryn-senses

Token vision follows the sheet's Darkvision. dnd5e computes senses (Goggles of Night, the
Darkvision spell, species traits, Wild Shape forms) but never touches token vision, so a
character with 60 ft Darkvision on the sheet still sees nothing in an unlit scene.

On any change to an actor, its items or its effects, the prototype token and every placed token
with **vision enabled** get `visionMode: darkvision` and the sheet's range, or `basic` / 0 when
Darkvision is gone (goggles taken off or confiscated). Tokens with vision disabled are ignored,
so monsters and crowds are untouched. Unlinked tokens read their own synthetic actor.

Only the active GM's client writes. A full sweep runs at ready.

API: `game.pentaryn.senses.sync(actor)`, `.syncAll()`, `.desiredSight(actor)`, `.light`, `.setupLight()`.

Sync: `make foundry-senses-check` / `make foundry-senses-sync`. First install needs a server restart.

## Broken glow light (2026-10-07)

`glow.mjs` (imported by `senses.mjs`) registers the light animation **Broken glow (wandering)**,
`pentaryn-brokenglow`.

- **The wave:** the light follows a sine-like wave whose swells never repeat. At each turn it picks
  the next peak height (weighted low), trough depth and half-period (0.7–2.4 s).
- **What it drives:**
  - Size, from the token's own square up to the light's Dim radius, which is the ceiling.
  - Brightness, from 0.3 to 0.85.
- **Real radius:** the source's radius is re-initialized as the wave moves (throttled to about
  20 Hz, at 3 px or more of change), so vision follows the light.
- **Synced:** the wave is seeded from the source id and the server clock, so every client shows
  the same swell.
- **Testing the curve:** `waveLevel`, `brightnessFor` and `LIMITS` are exported for offline checks.

## Lights carried by items

An item with `flags.pentaryn-senses.light` (token light data) lights whoever carries it. The GM
writes that light to the actor's prototype token and placed tokens, and marks them
`flags.pentaryn-senses.itemLight: true`. When no carried item has a light, only marked tokens are
reset. A light set by hand is never lost: when a carried light covers it (Marrith lights a torch
over her rune glow), it is kept in `flags.pentaryn-senses.itemLightPrior` and comes back when
the carried light goes. The API adds `syncLight(actor)` and `carriedLight(actor)`.

Caven's Shattered Amethyst Dragon Shard is the first one. Lit torches, lamps and lanterns use the
same path (next section); when an actor carries several lights, the one with the largest dim
radius wins.

## Token chains (2026-10-08)

`chain.mjs` (imported by `senses.mjs`, pure parts in `chain-core.mjs`) draws a **chain** between
two tokens: a straight line of iron links (`assets/chain-link.webp`, tiled and rotated along the
line) from the anchor's centre to the chained token's centre. Graphics only: no movement limit,
no rules. The GM judges the reach.

- **Data:** `flags.pentaryn-senses.chain = { anchor: "<token id>" }` on the **chained** token. One
  chain per chained token; an anchor can hold several. Same scene only.
- **Drawn on every client**, just under the tokens in `canvas.primary`, so fog and vision hide it the
  way they hide the map. It follows drags and move animations. If the chained token is hidden, only
  the GM sees the chain. A hidden anchor (a GM stake token) is fine.
- **Break it:** Token HUD (GM) → **Break chain** (link-slash icon) on either end. This removes every
  chain touching that token.
- **Make one:** target the anchor (T), right-click the creature → **Chain to <anchor>** (link icon).
  The button only shows on an unchained token while exactly one other token is targeted.
- **Console:** `game.pentaryn.chain.link(chained, anchor)`, `.break(token)`, `.links()`.
- **Safety:** every hook is wrapped. A bug logs `pentaryn-senses | chain …` and draws nothing; it
  never breaks token rendering.
- **Tests:** `node test/run.mjs` (also run by `make foundry-senses-check`).

## Light cantrip and lit items (2026-10-09, v0.3.0)

`light.mjs` (imported by `senses.mjs`, pure parts in `light-core.mjs`, design in
`LIGHT-DESIGN.md`, plan C4). Strings in `lang/en.json`, styles in `styles/light.css`.

**The Light cantrip.** The PHB spell is left as shipped. When anyone casts it, its floor-token
summon is skipped and a small prompt asks **Where does the light go?**

- **On me**: your token on the scene you are viewing glows (bright 20 / dim 40, a steady pale
  light) and the glow moves with the token, including to another scene through a portal.
- **Pick a target**: the cursor becomes a crosshair and a notice says what to do. Click any token
  (it glows and carries the light) or any square (a light sits there and respects walls).
  Right-click or Esc cancels. A token you can't see counts as the square under it.
- **Not now**: nothing happens. The chat card keeps **On me · Pick a target · End light** (in place
  of Summon), so you can aim, move or end the light later from the card.

Casting again moves the light, because each caster has one Light. **End light** is on the card,
and also on the Token HUD of a lit token (lightbulb-slash icon) for the caster and the GM.

How it works: the caster writes `flags.pentaryn-senses.lightCast` (`{scene, token}` or
`{scene, x, y}`, or null) on their own Light item. The active GM reconciles: the token's light
becomes the spell's and its old light is kept in `flags.pentaryn-senses.spellLight.prior`, or an
AmbientLight is created with `flags.pentaryn-senses.spellLight.source`. When the light ends, the old
token light comes back (a hand-set glow, or a torch the token still holds). With no GM
connected, the flag waits and is applied at the GM's next ready. If the lit creature is
deleted, the light ends and the caster gets a whisper. A GM who deletes a Light square by hand
ends that light (it does not come back at the next sweep); one dragged by hand stays where it was
dropped. If two casters light the same
token, the newer one wins. The cast notice names the lit token only when you could see its
nameplate anyway; otherwise it says "the creature".

**Torches, lamps, lanterns, candles.** Each one gets a **flame button** on its inventory row,
beside the name: grey when unlit, orange when lit. Clicking it lights or puts out the item and
posts one chat line, in the chat mode the user has picked (a GM on "GM only" stays private). The item's own **Light** activity (item image, activity chooser, Argon)
does the same thing and **uses nothing up**; the PHB activities would otherwise burn a lantern's
single use or destroy a candle. A lit item lights its carrier through the carried-light path
above: drop it in a pile and the carrier goes dark, and whoever picks it up glows. A lit
**hooded lantern** also gets a hood button, which drops it to bright 0 / dim 5 and back. Items
stay lit until put out; they do not burn down.

| Item (dnd5e identifier) | Bright / Dim (ft) |
|---|---|
| Light cantrip | 20 / 40 |
| `torch` | 20 / 40 |
| `candle` | 5 / 10 |
| `lamp` | 15 / 45 |
| `lantern-hooded` | 30 / 60 (hood down 0 / 5) |
| `lantern-bullseye` | 60 / 120, all round (no cone yet) |

Items are matched by identifier, then by name (`Lantern, Hooded`). A magic lantern can carry
its own profile in `flags.pentaryn-senses.lightItem`.

**Setup (GM, once, idempotent).** The PHB Torch has only an attack, so
`await game.pentaryn.senses.setupLight()` gives every Torch (world items, actors, unlinked
tokens) a **Light** utility activity (`psLightToggle000`, one action, nothing consumed,
`flags.pentaryn-senses.lightToggle`). It returns how many items it changed. Lamps, lanterns and
candles already have their own Light activity. Torches added later need another run.

**GM ready sweep** (after the carried-light sweep): reconciles every Light item that has a flag,
puts out any spell light whose item no longer exists, and deletes the old floor tokens the PHB
summon left behind (tokens of the PHB "Light" actor carrying `flags.dnd5e.summon.origin`). Every
deletion is logged.

**Console:** `game.pentaryn.senses.light.cast(item, {token} | {x, y})`, `.end(item)`, `.pick()`,
`.toggle(item)`, `.hood(item)`, `.profileFor(item)`, `.sweep()`, `.setup()`.

**Safety:** every hook is wrapped. A bug logs `pentaryn-senses | light …` and does nothing else.
`node test/run.mjs` runs the chain fixtures and then `test/light.mjs`.
