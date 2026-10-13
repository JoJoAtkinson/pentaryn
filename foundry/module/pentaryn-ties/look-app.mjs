/**
 * The Look window — the player's own page on someone, opened by taking a closer look.
 *
 * ## What this is, in one paragraph
 *
 * Joe's GM inspect window (`preview-app.mjs`, Player view) draws every fact a subject could hand a
 * player, with the Known tab's own grant cards, in the order a player would meet them. He asked
 * for the same view on the player's side: double-click someone, take a closer look, and a window
 * pops up showing **what this character now knows about that person** — none of the GM's
 * switches, and nothing that says whether a roll passed or failed (2026-10-07). This is that
 * window: read-only, one per (character, subject), the GM's player view with everything
 * GM-plane removed.
 *
 * ## The one rule — it reads the player plane only
 *
 * The cards come from `character.flags.pentaryn-ties.granted` and from nothing else. That map is
 * written only on **delivery** or a **GM tell** (`applyPlayerWrites`, `commitGrants`,
 * `deliverHeldIdentifications`, `shareFact`, `grantKind`), so it never holds a failed rung, a
 * locked ladder, a held answer or a roll in flight. The card's words are the grant record's words
 * — what the character was actually told, at the tier they bought, with "— shared by …" where a
 * friend told them — never the GM's authored rung prose, never a lore row's current wording.
 *
 * The one other ledger it touches is the subject's `beliefs` flag, through `visibleAttributesFor`
 * — the Known tab's own secrecy filter, used purely as a GATE on where an `attr:` grant may
 * render. A guild fact learned on one carrier must not appear under a second creature before the
 * character has identified that creature as a carrier (and the GM has released it), or the card's placement would
 * announce a membership nobody rolled for. `identifiedState(...).carries` requires text AND the
 * GM's release, so a held identification gates exactly like no identification.
 *
 * `known-core.mjs`'s `factOrder` (via `facts.mjs`) supplies the order and the keys — ids only,
 * by design. This file never imports the GM's per-PC status helper, the kind-study composer or
 * the study-state reader, nor an attribute's authored hit/miss prose or a lore row's wording; it
 * never reads a roll's number, a DC, a grade, a verdict bit, an in-flight marker or a release
 * stamp. What it does not read it cannot show. (The plan's §10 grep for those names returns
 * nothing in this file — keep it that way, comments included.)
 *
 * ## The indistinguishability contract (study.mjs, decision 11) — how this window keeps it
 *
 * Every observable consequence of a completed roll must be identical for a triumph, a failure and
 * a deliberate lie. The window keeps that in three ways:
 *
 *   1. **It opens before the dice, every time.** Each door calls `examine` below, which calls
 *      `openLook` synchronously, first, then `Study.inspect`. Same moment, same frame, whatever the target carries and whether the
 *      inspect is then refused (no GM, combat tempo, kill switch). Its opening is never a function
 *      of the result, because the result does not exist yet.
 *   2. **Only grants draw.** A locked, held or in-flight fact — or a failure with no written
 *      failure line — has no `granted` entry, so it draws nothing: not a placeholder, not a lock,
 *      not a greyed card. "Nothing learned" and "nothing arrived yet" print the same single line.
 *      A failure WITH a written line was granted that line and draws as an ordinary card, so it
 *      reads as what they noticed, never as "you failed" (Joe, 2026-10-08).
 *   3. **No repaint without a visible change.** The subject's `beliefs` flag is written on a
 *      failed rung, on the cascade's lazily-taken in-flight marker and on a held row, and this window listens
 *      to that flag (for the secrecy gate). A live refresh therefore builds the HTML string first
 *      and touches the DOM only when it differs from what is on screen. A flicker on a failure
 *      would be a pixel that differs by outcome — the one thing this module must never draw.
 *
 * The only on-screen change ever is a card appearing: the fact itself, which is the thing the
 * player is meant to learn, and which the Known tab repaints for anyway (`commitGrants`).
 *
 * ## Not a GM surface
 *
 * `open` refuses for a GM (they have the flask — `preview-app.mjs`), for a player whose access is
 * switched off (`mayWrite`), for a character this user does not own, and for looking at yourself.
 * GM behaviour is unchanged by this file.
 */

import { MODULE } from "./ties-core.mjs";
import { LiveHooks } from "./ties-adapter.mjs";
import { mayWrite } from "./settings.mjs";
import { inspect, kindActorOf } from "./study.mjs";
import { grantCard, grantedHead } from "./known-ui.mjs";
import { subjectFacts, knowsAbout, groupLabelKey } from "./facts.mjs";
import { REGISTRY_SETTING, touchesFlagScope } from "./known-core.mjs";
import { FALLBACK_ART } from "./core/html.mjs";
import { makeLog } from "./lib/log.mjs";

const log = makeLog(MODULE);

const { ApplicationV2 } = foundry.applications.api;

const esc = s => foundry.utils.escapeHTML(String(s ?? ""));

/** One window per (character, subject) on this client. */
const open = new Map();
const pairKey = (character, subject) => `${character.id}:${subject.id}`;

export class LookWindow extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "pentaryn-look-{id}",
    classes: ["pentaryn-look", "pt-look-window"],
    window: { icon: "fa-solid fa-eye", resizable: true },
    position: { width: 440, height: 520 }
  };

  /**
   * Open (or front) this character's page on this subject. Returns the window, or `null` when it
   * is not this user's to open — see the header for who is refused and why.
   *
   * `subject` is what was clicked: for an unlinked token that is the token's synthetic actor,
   * whose name and portrait head the window (they are already on the canvas). The DATA comes
   * from the world actor behind it, where grants are keyed and belief rows are written.
   */
  static open(character, subject) {
    if (game.user?.isGM) return null;
    if (!mayWrite()) return null;
    if (!character?.isOwner || !subject || subject.id === character.id) return null;
    const key = pairKey(character, subject);
    const existing = open.get(key);
    if (existing) {
      if (existing.minimized) existing.maximize?.();
      existing.render({ force: true }).catch(err => log.error(`look window`, err));
      existing.bringToFront?.();
      return existing;
    }
    const win = new LookWindow(character, subject);
    open.set(key, win);
    // not awaited: a failed render is logged with the prefix rather than left unhandled
    win.render({ force: true }).catch(err => log.error(`look window`, err));
    return win;
  }

  constructor(character, subject, options = {}) {
    if (game.user?.isGM) throw new Error(`${MODULE} | the Look window is a player surface`);
    super(options);
    // the actor the door passed — never re-derived from `game.user.character` later
    this.character = character;
    this.subject = subject;
    this.base = game.actors?.get(subject.id) ?? subject;
    this.pair = pairKey(character, subject);
    this.lastHTML = null;
    this.live = new LiveHooks();
  }

  get title() {
    return _loc("PENTARYN_TIES.known.look.title", { name: this.subject?.name ?? "?" });
  }

  /* ------------------------------------------ the filter */

  /**
   * The cards this character may see, grouped, in `factOrder` order. The whole rule:
   *
   *   ident   granted[key] exists AND the subject is identified (and released) as a carrier
   *   attr    granted[key] exists AND the same gate on that attribute
   *   lore    granted[key] exists
   *   kind    granted[key] exists
   *
   * Everything else — a held row, a roll in flight, a lock, a failure with no written failure
   * line — has no grant, and is absent. A failure WITH a written line was granted that line, and
   * draws it like any other card (2026-10-08); a failed identification's sits under `identMissKey`.
   */
  shownGroups() {
    const gathered = subjectFacts(this.subject);
    const { base, kind } = gathered;
    const groups = new Map(); // group → cards, insertion order = factOrder order
    for (const c of knowsAbout(this.character, this.subject, gathered)) {
      // the grant record, never the authored source: the words are what they were told
      const card = grantCard({ icon: c.icon, source: c.source, text: c.text });
      if (!card) continue; // a blank grant draws nothing — and must not open its group's header
      if (!groups.has(c.group)) groups.set(c.group, []);
      groups.get(c.group).push(card);
    }
    return { base, kind, groups };
  }

  groupLabel(group, base, kind) {
    const name = this.subject?.name ?? base?.name ?? "?";
    // a separate kind actor's study files under the KIND's page on the Known tab
    const key = groupLabelKey(group, "look", { kindPage: !!(kind && base && kind.id !== base.id) });
    // a group GROUP_LABEL does not know is headed with its own name, never another group's
    return key ? _loc(key, { name, kind: kind?.name ?? "" }) : String(group);
  }

  /** The whole window body, as a string. Sync, so a live refresh can compare before it paints. */
  buildHTML() {
    const subject = this.subject;
    const name = subject?.name ?? "?";
    const { base, kind, groups } = this.shownGroups();
    // the Known tab's own condition and key for the "Kind: X" line
    const kindLine = kind && base && kind.id !== base.id
      ? `<span class="pt-known-kind">${esc(_loc("PENTARYN_TIES.known.study.kindLine", { name: kind.name }))}</span>` : "";
    const head = `<div class="pt-summary pt-look-head">
      <img class="pt-portrait" src="${esc(subject?.img || FALLBACK_ART)}" alt="">
      <span class="pt-who"><span class="pt-name">${esc(name)}</span>${kindLine}</span>
    </div>`;

    let body;
    // one line for every reason there is nothing: nothing learned, nothing arrived, no GM
    if (!groups.size) body = `<p class="pt-look-empty">${esc(_loc("PENTARYN_TIES.known.look.empty", { name }))}</p>`;
    else {
      body = `<section class="pt-granted" aria-label="${esc(_loc("PENTARYN_TIES.known.granted.label"))}">${grantedHead()}`;
      for (const [group, cards] of groups)
        body += `<h4 class="pt-look-group">${esc(this.groupLabel(group, base, kind))}</h4><ul class="pt-granted-list">${cards.join("")}</ul>`;
      body += `</section>`;
    }
    return `<div class="pentaryn-ties pentaryn-known pt-look">${head}<div class="pt-look-body">${body}</div></div>`;
  }

  /* ------------------------------------------ render */

  async _renderHTML() {
    return this.buildHTML();
  }

  _replaceHTML(result, content) {
    // no DOM write without a visible change — see the header, rule 3
    if (result === this.lastHTML && content.firstElementChild) return;
    const top = content.scrollTop;
    content.innerHTML = result;
    content.scrollTop = top;
    this.lastHTML = result;
  }

  /* ------------------------------------------ live */

  /** Repaint only when the string differs. `render()` without force: the window is not raised. */
  liveRender() {
    if (!this.rendered) return;
    let html;
    try { html = this.buildHTML(); } catch (err) { return log.warn(`look refresh`, err); }
    if (html === this.lastHTML) return;
    this.render();
  }

  queueLive() {
    if (!this.rendered) return;
    this.live.debounce(() => this.liveRender());
  }

  /**
   * What the window draws from, hooked:
   *   the character   flags.granted (grants land; forget writes `granted.-=key`)
   *   subject / kind  any module flag (beliefs → the secrecy gate on Deliver; kindOf, attributes,
   *                   attributesOff, lore → structure), and name / img
   *   world setting   the registry (secret flags, ladder parents, lore row ids)
   *   tokens          an unlinked subject's delta (its own rows or attributes)
   *   deleteActor     the subject is gone → close
   * Not watched: attributeBeliefs, attributeKnowledge, holdDefault — nothing drawn here reads them.
   */
  watch() {
    if (this.live.watching) return;
    const regKey = `${MODULE}.${REGISTRY_SETTING}`;
    const onActor = (actor, changes = {}) => {
      if (!actor) return;
      const keys = Object.keys(foundry.utils.flattenObject(changes ?? {}));
      const flags = keys.some(k => touchesFlagScope(k, MODULE));
      if (actor.id === this.character.id) {
        if (flags) this.queueLive();
        return;
      }
      const kindId = log.swallow("look: kind pointer unreadable", () => kindActorOf(this.base)?.id ?? null, null);
      if (actor.id === this.base.id || (kindId && actor.id === kindId)) {
        if (flags || keys.some(k => k === "name" || k === "img")) this.queueLive();
      }
    };
    const onSetting = setting => {
      if ((setting?.key ?? "") === regKey) this.queueLive();
    };
    const onToken = (token, changes = {}) => {
      if (token?.actorId === this.base.id && "delta" in (changes ?? {})) this.queueLive();
    };
    const onDelete = actor => {
      if (actor?.id === this.base.id) this.close();
    };
    const hooks = [
      ["updateActor", onActor],
      ["createSetting", onSetting],
      ["updateSetting", onSetting],
      ["deleteSetting", onSetting],
      ["updateToken", onToken],
      ["deleteActor", onDelete]
    ];
    this.live.start(hooks);
  }

  unwatch() {
    this.live.stop();
  }

  _onFirstRender(context, options) {
    super._onFirstRender?.(context, options);
    this.watch();
  }

  _onClose(options) {
    this.unwatch();
    if (open.get(this.pair) === this) open.delete(this.pair);
    this.lastHTML = null;
    return super._onClose?.(options);
  }
}

/** The player's page on `subject`, as `character`. `null` for a GM or anyone it is not for. */
export const openLook = (character, subject) => {
  try {
    return LookWindow.open(character, subject);
  } catch (err) {
    // a window that fails to open must never stop the inspect that follows it
    log.error(`look window`, err);
    return null;
  }
};

/**
 * The Inspect gesture, for every door (the HUD eye, the look menu's "Take a closer look"): the
 * player's Look window opens FIRST — synchronously, before the dice, whatever the inspect then does
 * (point 1 above) — and then the inspection runs. For a GM `openLook` is null, so only the inspect
 * runs (ties-ui-EXT-10).
 */
export async function examine(who, subject) {
  openLook(who, subject);
  return inspect(who, subject);
}
