# Pentaryn Portal Cards

**Read this when:** a teleport region's confirmation shows (or should show) a picture and description.

Foundry's core Teleport Token behavior (`choice: true`) asks before moving a token. This module
replaces the dialog's text or destination `<select>` with **cards**: a thumbnail, a title and a
description per destination. With several destinations the cards are radio buttons that submit
the same `destination` field the core callback reads, so the teleport logic is untouched.

- **Data:** on the **destination** region, `flags["pentaryn-portals"] = { title, img, description }`.
  All optional; the fallbacks are the scene's nav name, the scene thumbnail, and no text.
- **Authoring:** Region config → Appearance tab → *Portal card*. The camera button crops the scene
  background around the region (8×5 squares, arrival square circled) into
  `assets/tokens/custom/portals/<sceneId>-<regionId>.webp` and sets it as the image.
- **Console:** `game.pentaryn.portals.snapshot(region)`, `game.pentaryn.portals.cardFor(region)`.
- **Badge (GM always; players once seen):** every region with a Teleport Token behavior gets a violet ring badge on `canvas.interface`, floating just above its square, with the first destination's card image inside. It is drawn above lighting, so it shows at darkness 1, where a Tile does not. Because it draws above fog too, a player sees a badge only once its square has been in sight (lit, or within darkvision) or is already explored; after that it stays, like a map pin (0.3.0). If there are several destinations, a number appears on the badge. A hidden region shows a faded badge to the GM only. Hit-testing is in DOM space, so the badge never takes a click meant for a token.
- **Hover (everyone):** the destination cards appear beside the cursor. An unrevealed passage shows "A way onward" and nothing more.
- **Right-click the badge (GM):**
  - *Teleport party → X*: moves the party to X, spreading them outward from the landing square, skipping squares a wall cuts off or a token already stands on. It then pulls every active player there and moves your view too. **The party** is every linked character token, plus every token a player owns or a PC summoned: Animate Dead skeletons, familiars, Arcane Eye, steeds, transformed forms (0.4.0). Never item piles, Markers (`Marker · N`, the `Markers`/`Temp Markers` folders) or crowd (`(crowd)` names, `Crowd …` folders).
  - *Preview card*: the player view.
  - *Edit card*: the same window, using the edit toggle at the top-left of its header.
  - *Region settings*.
- **Look (GM):** "Look at X" in the badge menu switches only your view to the destination, centred on its landing square. Nobody moves and nobody is pulled. There is deliberately no ping, because pings broadcast to players.
- **Moving a travel spot (GM):** right-click the badge, choose Edit card, and turn on the header toggle. While edit is on, that badge shows a gold dashed square and can be dragged. On release, the region snaps to the grid, using its *bounds*, not the shape's x/y. Every shape moves with it, as do any travel tiles tagged with its region id. Turning edit off, or closing the window, locks it again.
- **Console:** `game.pentaryn.portals.lookAt(region)`, `game.pentaryn.portals.teleportParty(region)`, `.open(region, {edit})`, `.redraw()`.
- **Summons follow their PC (0.4.0):** when a player walks their PC through a link to **another scene**, the active GM's client carries that PC's company along and lands it around the PC, skipping walls and occupied squares. Company means tokens the PC summoned (dnd5e `flags.dnd5e.summon.origin` points at the PC), and tokens every owner of which is also an owner of the PC (that player's skeletons, steed, Arcane Eye). A steed the whole party co-owns stays until all its owners go through together; then it lands by the first of them. The GM gets a notification naming who came along. It only fires for a real portal hop (the PC was standing in a region whose teleport leads to that scene), so a GM cut-and-paste or a dnd5e form reverting drags nothing. Same-scene links move only the walker; summons on the same map can walk. Needs a GM logged in.
- **Rules are pure** in `portals-core.mjs` (`partySelection`, `followersOf`, `ringSpots`); `node test/run.mjs` proves them without Foundry.
- **Same-scene links (0.4.1):** core 14.368+ stores a destination on the same scene *relative* to its behavior (`..<regionId>`). The module resolves every entry against its behavior (`fromUuidSync(u, {relative})`) and compares by absolute UUID (`hasDestination`/`withoutDestination` in `portals-core.mjs`), so cards, badges, Look and Unlink work for same-scene links too.
- **Secrecy:** a behavior with `revealed: false` shows players no card (core shows them no name either).

Install: `make foundry-portals-sync`; first install needs a Foundry restart (module.json is read at startup).
