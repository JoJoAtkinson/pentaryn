/**
 * The add/edit dialog — one window for "I can see this person, record what they are to me".
 *
 * Reached from the panel's Add button and from a token on the canvas. It always writes a
 * DIRECTED tie: the word and the notes say what the **source** actor is to the **target**.
 *
 * ## The seeding rule
 *
 * Saving writes the source's side in full — it is theirs, they are looking at it. The
 * reverse side (target → source) is only ever *seeded*, never overwritten:
 *
 *   - no reverse row at all  → create one, copying word/stance/strength/notes across, so a
 *                              new acquaintance shows up on both sheets immediately
 *   - reverse row exists     → fill only the fields that are still EMPTY on it; anything
 *                              already written on the other side is left exactly as it is
 *
 * The point is that both people end up on each other's list without either of them being
 * able to rewrite what the other thinks. To change the other side, open it from that side —
 * which is what "if i go and set a desc from their perspective it overrides" means.
 *
 * A player owns exactly one character and cannot write to anyone else's actor; the server
 * refuses it and `write()` returns false rather than throwing. So the reverse side simply
 * does not happen for them, and the dialog says so instead of pretending it did.
 */

import { NOTES_MAX, read, write, clampStance, clampStrength, mayWrite, baseActorOf } from "./ties-api.mjs";

export { baseActorOf };
import { pips, stanceSelect } from "./editor.mjs";

const esc = s =>
  String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const t = k => game.i18n.localize(`PENTARYN_TIES.${k}`);
const f = (k, data) => game.i18n.format(`PENTARYN_TIES.${k}`, data);

const FALLBACK_ART = "icons/svg/mystery-man.svg";
const artOf = actor => actor?.img || FALLBACK_ART;

/**
 * Whose list can this user write on, among the actors with a token on this scene?
 *
 * Scene-scoped on purpose: the whole point is "you can see them, so you can add them".
 * Deduplicated by actor, because a scene can carry three tokens of the same actor and a
 * dropdown listing "Guard, Guard, Guard" helps nobody.
 */
export function sourceCandidates() {
  if (!mayWrite()) return [];
  const seen = new Map();
  for (const token of canvas?.tokens?.placeables ?? []) {
    const actor = baseActorOf(token);
    if (!actor?.isOwner) continue;
    if (!seen.has(actor.id)) seen.set(actor.id, actor);
  }
  /*
   * Controlled first, then player characters, then alphabetical. A token you have selected
   * is the strongest statement you have made about who you are speaking as, and a GM
   * running a scene is far more often writing on a PC than on the first NPC alphabetically.
   */
  const controlled = new Set((canvas?.tokens?.controlled ?? []).map(tok => baseActorOf(tok)?.id).filter(Boolean));
  const rank = a => (controlled.has(a.id) ? 0 : a.type === "character" ? 1 : 2);
  return [...seen.values()].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

/**
 * Who a tie can point AT, in two scopes.
 *
 * **`"scene"`** — actors with a token on this scene, filtered through `Token#isVisible` for
 * players: the same test the canvas cards use, so a dropdown never names someone the walls
 * are hiding. This is the scope for anything invoked from the canvas, where "you can see
 * them, so you can add them" is the whole gesture.
 *
 * **`"all"`** — every actor this user may know exists, whether or not they are on a scene,
 * or whether a scene is even loaded. This is the scope for the sheet's Add button, and it
 * is load-bearing rather than a nicety: between sessions half an address book is people
 * with no token anywhere, and without it those ties have no door at all. Players are
 * filtered by LIMITED permission, exactly as the old add-row dropdown was — Foundry ships
 * every Actor to every client, so an unfiltered list would name every NPC in the world.
 *
 * The label is taken from the TOKEN for a player looking at someone else's token, because
 * a token wearing a disguise ("Hooded Figure") must not hand back the actor's real name.
 */
export function targetCandidates(sourceId, scope = "scene") {
  const isGM = game.user?.isGM === true;
  const seen = new Map();

  if (scope === "all") {
    for (const actor of game.actors?.contents ?? []) {
      if (actor.id === sourceId) continue;
      if (!isGM && actor.testUserPermission?.(game.user, "LIMITED") !== true) continue;
      seen.set(actor.id, { actor, label: actor.name });
    }
  } else {
    for (const token of canvas?.tokens?.placeables ?? []) {
      if (!isGM && !token.isVisible) continue;
      const actor = baseActorOf(token);
      if (!actor || actor.id === sourceId) continue; // a tie to yourself is not a relationship
      if (seen.has(actor.id)) continue;
      const disguised = !isGM && !actor.isOwner;
      seen.set(actor.id, { actor, label: disguised ? token.document.name : actor.name });
    }
  }
  return [...seen.values()].sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Which of several pens to start in. A controlled token is the strongest signal the user
 * has given about who they are speaking as; failing that, nothing is picked — an
 * alphabetical default is a wrong answer wearing a right answer's clothes.
 */
function preselectSource(options) {
  if (options.length === 1) return options[0];
  // exactly one controlled token, or nothing: two selected tokens is not an answer, and
  // picking the first of them would be a guess dressed as a decision
  const controlled = (canvas?.tokens?.controlled ?? []).map(tok => baseActorOf(tok)?.id).filter(Boolean);
  const hits = options.filter(a => controlled.includes(a.id));
  return hits.length === 1 ? hits[0] : null;
}

const { ApplicationV2 } = foundry.applications.api;

export class TieDialog extends ApplicationV2 {
  /**
   * @param {object} opts
   * @param {Actor} [opts.clicked]   the actor behind the token you invoked this on — it
   *                                 fills whichever half of the link is not already forced
   * @param {Actor} [opts.source]    force the "from" half (the sheet panel's Add button)
   * @param {Actor} [opts.target]    force the "to" half
   * @param {Function} [opts.onSaved] called after a successful write
   */
  constructor({ clicked = null, clickedToken = null, source = null, target = null, onSaved = null } = {}, options = {}) {
    super(options);
    this.onSaved = onSaved;
    // held here, not read off the DOM, so a repaint cannot lose half-typed prose
    this.draft = null;
    this.sourceLocked = false;
    this.targetLocked = false;
    this.source = null;
    this.target = null;

    /*
     * Invoked from the canvas → only what is on the scene and in sight. Invoked from a
     * sheet → the whole address book, because that is the only door an off-scene tie has.
     * Set before the branch: it used to live inside the `else`, where `clicked` is always
     * null, so a clicked dialog left it undefined and a re-aimed one kept the wrong scope.
     */
    this.targetScope = clicked ? "scene" : "all";
    /*
     * The token this was invoked on, kept so the locked chip can wear its name and art.
     * `targetCandidates` already refuses to hand a player an actor's real name for a token
     * they do not own; without this, the very same gesture printed it in the header.
     */
    this.clickedToken = clickedToken ?? null;

    if (clicked) this.#resolveFromClick(clicked);
    else {
      this.source = source ?? null;
      this.sourceLocked = !!source;
      this.target = target ?? null;
      this.targetLocked = !!target;
      if (!this.source && !this.sourceLocked) this.source = preselectSource(this.sourceOptions());
    }
  }

  /**
   * A clicked token fills the **to** half, and the pens you have left fill the **from**.
   *
   * Removing the clicked actor from the source list is what makes this work without a mode:
   * a GM can never pick the target as its own source (that question answers itself), and if
   * removing it empties the list, the thing you clicked was your only pen — so it fills the
   * *from* half instead and you pick who it is to. That is the player clicking their own
   * token, and it needs no identity test to get there.
   */
  #resolveFromClick(clicked) {
    const pens = sourceCandidates().filter(a => a.id !== clicked.id);
    if (pens.length) {
      this.target = clicked;
      this.targetLocked = true;
      this.source = preselectSource(pens);
    } else {
      this.source = clicked;
      this.sourceLocked = true;
      this.target = null;
    }
  }

  /** Who this user could write on, minus whoever the tie already points at. */
  sourceOptions() {
    return sourceCandidates().filter(a => a.id !== this.target?.id);
  }

  static DEFAULT_OPTIONS = {
    classes: ["pentaryn-tie-dialog"],
    window: { title: "PENTARYN_TIES.dialog.title", icon: "fa-solid fa-people-arrows" },
    position: { width: 520, height: "auto" }
  };

  get title() {
    return t("dialog.title");
  }

  /** The tie as it currently stands on the source's sheet, or a blank one. */
  existing() {
    if (!this.source || !this.target) return null;
    return read(this.source).find(x => x.id === this.target.id) ?? null;
  }

  /** What the reverse side already says — what the seeding rule must not tread on. */
  reverse() {
    if (!this.source || !this.target) return null;
    return read(this.target).find(x => x.id === this.source.id) ?? null;
  }

  /**
   * How this viewer should see an actor at the far end of the tie.
   *
   * A GM, and anyone looking at their own actor, gets the real name and portrait. Everyone
   * else sees whatever the actor's **token on this scene** is wearing — because a token
   * called "Hooded Figure" is a deliberate act by the GM, and this window must not answer
   * with who is underneath it.
   *
   * ⚠ It looks up the target's own visible token rather than trusting `clickedToken`. An
   * earlier cut consulted only the token the dialog was invoked on, which closed the
   * obvious path (hover them, press the key) but left the one a player actually takes when
   * they press it on **their own** token: the source locks to them, the target stays a
   * dropdown — correctly labelled from the token — and the moment they picked the disguised
   * entry the header, status line, word label and placeholder all printed the real name,
   * because `clickedToken` resolved to the player's own actor, not the target.
   *
   * With no token on the scene there is nothing to borrow, and the real name is right: an
   * off-scene actor can only have reached the picker through the LIMITED-filtered list.
   */
  #facadeFor(actor) {
    const real = { name: actor?.name ?? "", img: actor?.img || FALLBACK_ART };
    if (!actor) return real;
    if (game.user?.isGM === true || actor.isOwner) return real;

    const wearing = tok => ({
      name: tok.document?.name ?? real.name,
      img: tok.document?.texture?.src || real.img
    });

    // the token this was invoked on, if it is actually the one being named
    const clicked = this.clickedToken;
    if (clicked && baseActorOf(clicked)?.id === actor.id) return wearing(clicked);

    // otherwise any token of theirs this player can see — the same reach the picker uses
    for (const tok of canvas?.tokens?.placeables ?? []) {
      if (!tok.isVisible) continue;
      if (baseActorOf(tok)?.id !== actor.id) continue;
      return wearing(tok);
    }
    return real;
  }

  async _renderHTML() {
    /*
     * Adopt a sole remaining candidate BEFORE anything reads `this.source`. When this ran
     * further down — after the pickers and the locals were built — a candidate set that
     * shrank to one between renders (a token deleted, the scene changed under an open
     * dialog) produced a window showing a fixed source with the status still asking you to
     * pick one, every field disabled, and nothing left that could trigger another render.
     */
    if (!this.sourceLocked && !this.source) {
      const only = this.sourceOptions();
      if (only.length === 1) this.source = only[0];
    }

    const source = this.source;
    const target = this.target;
    const options = this.sourceOptions();
    const targetFace = this.#facadeFor(target);

    /*
     * Who you can write on drives this, not your role. A player owns one character, so there
     * is nothing to choose and it renders as a link to them — a dropdown of one is a question
     * with a single answer. A GM owns everything on the scene and gets the real picker, which
     * opens UNSELECTED: defaulting to the alphabetically-first of forty actors is a
     * wrong-direction landmine once prose starts seeding off it.
     */
    const sourcePicker =
      this.sourceLocked && source
        ? `<a class="pt-dlg-fixed pt-dlg-link" data-action="open" data-id="${esc(source.id)}"
             data-tooltip="${esc(t("row.openSheet"))}" role="link" tabindex="0">${esc(source.name)}</a>`
        : options.length === 1
          ? `<a class="pt-dlg-fixed pt-dlg-link" data-action="open" data-id="${esc(options[0].id)}"
               data-tooltip="${esc(t("row.openSheet"))}" role="link" tabindex="0">${esc(options[0].name)}</a>`
          : options.length
            ? `<select class="pt-dlg-source" aria-label="${esc(t("dialog.source"))}" data-tooltip="${esc(t("dialog.sourceHint"))}">
                <option value=""${source ? "" : " selected"}>${esc(t("dialog.pickSource"))}</option>
                ${options
                  .map(a => `<option value="${esc(a.id)}"${a.id === source?.id ? " selected" : ""}>${esc(a.name)}</option>`)
                  .join("")}
              </select>`
            : `<span class="pt-dlg-fixed">${esc(t("dialog.noOwned"))}</span>`;

    const targetPicker =
      target && this.targetLocked
        ? `<a class="pt-dlg-fixed pt-dlg-link" data-action="open" data-id="${esc(target.id)}"
             data-tooltip="${esc(t("row.openSheet"))}" role="link" tabindex="0">${esc(targetFace.name)}</a>`
        : `<select class="pt-dlg-target" aria-label="${esc(t("dialog.target"))}">
            <option value="">${esc(t("dialog.pickTarget"))}</option>
            ${targetCandidates(source?.id, this.targetScope)
              .map(
                c =>
                  `<option value="${esc(c.actor.id)}"${c.actor.id === target?.id ? " selected" : ""}>${esc(
                    c.label
                  )}</option>`
              )
              .join("")}
          </select>`;

    const tie = this.existing();
    const rev = this.reverse();
    // what this render put in the fields, for #keepOrDropDraft to compare against
    this.loaded = tie ? { word: tie.word, notes: tie.notes } : null;
    const draft = this.draft ?? {
      word: tie?.word ?? "",
      stance: tie?.stance ?? 0,
      strength: tie?.strength ?? 3,
      notes: tie?.notes ?? "",
      reverseWord: "",
      reverseNotes: ""
    };

    /*
     * Until both ends are known there is no direction, and with no direction the word and
     * the notes have nothing to be *about* — so the fields stay disabled rather than
     * inviting prose that would have nowhere to go.
     */
    const ready = !!source && !!target;
    const dis = ready ? "" : " disabled";

    const status = !source
      ? options.length
        ? `<p class="pt-dlg-note">${esc(t("dialog.pickSourceFirst"))}</p>`
        : `<p class="pt-dlg-note notification warning">${esc(t("dialog.noOwned"))}</p>`
      : !target
        ? `<p class="pt-dlg-note">${esc(t("dialog.pickTargetFirst"))}</p>`
        : tie
          ? `<p class="pt-dlg-note">${esc(f("dialog.editing", { a: source.name, b: targetFace.name }))}</p>`
          : `<p class="pt-dlg-note">${esc(f("dialog.creating", { a: source.name, b: targetFace.name }))}</p>`;

    /*
     * ── The mirror pair ──────────────────────────────────────────────────
     *
     * Each directed field gets a second box for the other side, and IDENTITY IS THE LINK
     * STATE — there is no stored flag saying "these two are joined".
     *
     *   the other side is blank, or says exactly what your side says  →  it is LINKED:
     *       the box renders empty with your text greyed in behind it, and leaving it alone
     *       means the other side keeps following yours
     *   the other side says something different                       →  it has DIVERGED:
     *       the box renders that text, and saving writes it back unchanged
     *
     * So one rule covers both at save time: **the other side gets whatever is in the box,
     * and the box falls back to your text when empty.** Nothing else needs checking.
     *
     * The boxes only appear when the other side is actually writable. A player recording
     * what they are to an NPC never sees them, because that write would be refused by the
     * server whatever it said — which is also why their own edits cannot silently rewrite
     * an NPC's side.
     */
    const writableReverse = ready && target.isOwner === true;

    /*
     * Trim only, and case-sensitive. A trailing newline out of a textarea is editor noise;
     * anything else — a one-character typo fix included — is authorship, and under this
     * model text that differs IS the definition of diverged. Nothing else is normalised,
     * because collapsing whitespace would make two visibly different paragraphs "the same".
     */
    const diverged = (mineNow, theirs) =>
      !!theirs && !!String(theirs).trim() && String(theirs).trim() !== String(mineNow ?? "").trim();

    const mirrorBox = (field, theirs, mineStored, labelKey) => {
      const isDiverged = diverged(mineStored, theirs);
      const shown = isDiverged ? String(theirs) : "";
      // remember what we PUT in the box, so Save can tell "untouched" from "typed"
      const seeded = shown;
      const long = field === "reverseNotes";
      const common = `class="pt-dlg-mirror-input${isDiverged ? " pt-diverged" : ""}" data-field="${field}"
        data-mirrors="${field === "reverseNotes" ? "notes" : "word"}" data-seeded="${esc(seeded)}"`;
      return `<label class="pt-field pt-dlg-reverse">
        <span class="pt-field-label">${esc(f(labelKey, { a: targetFace.name, b: source.name }))}</span>
        ${
          long
            ? `<textarea ${common} rows="3" maxlength="${NOTES_MAX}"
                 data-empty-hint="${esc(t("dialog.mirrorNothingYet"))}"
                 placeholder="${esc(draft.notes || t("dialog.mirrorNothingYet"))}">${esc(shown)}</textarea>`
            : `<input type="text" ${common} value="${esc(shown)}"
                 data-empty-hint="${esc(t("dialog.mirrorNothingYet"))}"
                 placeholder="${esc(draft.word || t("dialog.mirrorNothingYet"))}" />`
        }
        <span class="pt-dlg-mirror-hint">${esc(t(isDiverged ? "dialog.mirrorDiverged" : "dialog.mirrorLinked"))}</span>
      </label>`;
    };

    const reverseWordField = writableReverse
      ? mirrorBox("reverseWord", rev?.word, tie?.word, "dialog.reverseWordLabel")
      : "";
    const reverseNotesField = writableReverse
      ? mirrorBox("reverseNotes", rev?.notes, tie?.notes, "dialog.reverseNotesLabel")
      : "";

    /*
     * The mirror boxes say what the other side will get, in the place you would look for
     * it. A paragraph restating that was left over from the seed-if-empty design and had
     * gone actively wrong: it promised "nothing there will be touched" for a reverse side
     * that was non-blank but still LINKED — which is exactly the case that does follow.
     * Deleted rather than rewritten; the boxes are the honest version.
     *
     * Nothing is said about an unwritable target either. That write is delegated to a GM
     * client, silently, and a player can act on none of it.
     */

    return `<div class="pt-dlg">
      <div class="pt-dlg-pair">
        <span class="pt-dlg-side">
          <img class="pt-portrait" src="${esc(artOf(source))}" alt="" />
          <span class="pt-dlg-side-label">${esc(t("dialog.source"))}</span>
          ${sourcePicker}
        </span>
        <span class="pt-dlg-arrow" aria-hidden="true"><i class="fa-solid fa-arrow-right"></i></span>
        <span class="pt-dlg-side">
          <img class="pt-portrait" src="${esc(target ? targetFace.img : FALLBACK_ART)}" alt="" />
          <span class="pt-dlg-side-label">${esc(t("dialog.target"))}</span>
          ${targetPicker}
        </span>
      </div>

      ${status}

      <div class="pt-fields">
        <label class="pt-field">
          <span class="pt-field-label">${esc(
            ready ? f("row.wordLabelOf", { name: targetFace.name }) : t("row.wordLabelPending")
          )}</span>
          <input type="text" class="pt-dlg-word" data-field="word" value="${esc(draft.word)}"
                 placeholder="${esc(t("row.wordPlaceholder"))}"${dis} />
        </label>
        ${reverseWordField}
        <label class="pt-field">
          <span class="pt-field-label">${esc(t("row.stanceLabel"))}</span>
          ${stanceSelect(draft.stance).replace("<select", `<select${dis}`)}
        </label>
        <span class="pt-field">
          <span class="pt-field-label">${esc(t("row.strengthLabel"))}</span>
          <span class="pt-dlg-strength" data-strength="${clampStrength(draft.strength)}">${pips(
            draft.strength,
            ready
          )}</span>
        </span>
      </div>

      <label class="pt-field pt-field-notes">
        <span class="pt-field-label">${esc(t("row.notesLabel"))}</span>
        <textarea class="pt-dlg-notes" data-field="notes" rows="5" maxlength="${NOTES_MAX}"
                  placeholder="${esc(
                    ready ? f("row.notesPlaceholder", { name: targetFace.name }) : t("row.notesPending")
                  )}"${dis}>${esc(draft.notes)}</textarea>
      </label>

      ${reverseNotesField}

      <div class="pt-dlg-actions">
        <button type="button" class="pt-dlg-save"${dis}><i class="fa-solid fa-check"></i> ${esc(t("dialog.save"))}</button>
        <button type="button" class="pt-dlg-cancel">${esc(t("dialog.cancel"))}</button>
      </div>
    </div>`;
  }

  _replaceHTML(result, content) {
    content.innerHTML = result;
    this.#bind(content);
    return content;
  }

  /** Read the form into `draft`, so a re-render does not lose half-typed prose. */
  #capture(root) {
    this.draft = {
      word: root.querySelector('[data-field="word"]')?.value ?? "",
      stance: Number(root.querySelector('[data-field="stance"]')?.value ?? 0),
      strength: clampStrength(root.querySelector(".pt-dlg-strength")?.dataset.strength ?? 3),
      notes: root.querySelector('[data-field="notes"]')?.value ?? "",
      reverseWord: root.querySelector('[data-field="reverseWord"]')?.value ?? "",
      reverseNotes: root.querySelector('[data-field="reverseNotes"]')?.value ?? "",
      // what the render put there — anything still equal to it was never touched
      seededWord: root.querySelector('[data-field="reverseWord"]')?.dataset.seeded ?? "",
      seededNotes: root.querySelector('[data-field="reverseNotes"]')?.dataset.seeded ?? ""
    };
  }

  /**
   * Re-aiming the dialog changes which stored tie is in front of you, so the fields have to
   * change with it — but only when there is something stored to show. If the new pair has
   * no tie yet, whatever was typed still applies to it, and binning a paragraph because the
   * user corrected the dropdown above it is the rudest thing this window could do.
   */
  #keepOrDropDraft() {
    if (this.existing()) return void (this.draft = null);
    /*
     * `#capture` reads the form, which after rendering an existing tie holds THAT pair's
     * stored text rather than anything typed. Carrying it to a fresh pair would offer one
     * person's private paragraph as a draft about someone else — and seed it onto their
     * actor on Save. Only genuinely typed text survives a re-aim.
     */
    const loaded = this.loaded;
    if (
      loaded &&
      this.draft &&
      String(this.draft.word ?? "") === String(loaded.word ?? "") &&
      String(this.draft.notes ?? "") === String(loaded.notes ?? "")
    ) {
      this.draft = null;
    }
  }

  #bind(root) {
    root.querySelector(".pt-dlg-source")?.addEventListener("change", ev => {
      this.#capture(root);
      this.source = ev.target.value ? game.actors.get(ev.target.value) ?? null : null;
      this.#keepOrDropDraft();
      this.render();
    });

    root.querySelector(".pt-dlg-target")?.addEventListener("change", ev => {
      this.#capture(root);
      this.target = game.actors.get(ev.target.value) ?? null;
      // the target just left the source pool; if it WAS the source, that pick is now illegal
      if (this.source && this.source.id === this.target?.id) this.source = null;
      this.#keepOrDropDraft();
      this.render();
    });

    // strength pips: local until Save, so nothing is written by pointing at it
    const strength = root.querySelector(".pt-dlg-strength");
    strength?.querySelectorAll('.pt-pip[data-action="strength"]').forEach(pip => {
      pip.addEventListener("click", () => {
        const n = clampStrength(pip.dataset.n);
        strength.dataset.strength = String(n);
        strength.querySelectorAll(".pt-pip").forEach((p, i) => p.classList.toggle("fill", i < n));
        // the group names itself "Strength n of 5"; leaving that stale lies to a screen reader
        const group = strength.querySelector(".pt-pips");
        const label = f("row.strengthTip", { n });
        group?.setAttribute("aria-label", label);
        group?.setAttribute("data-tooltip", label);
      });
    });

    // the fixed ends are links to the sheet behind them — "its link to them"
    root.querySelectorAll('[data-action="open"]').forEach(a => {
      const open = () => game.actors.get(a.dataset.id)?.sheet?.render(true);
      a.addEventListener("click", open);
      a.addEventListener("keydown", ev => {
        if (ev.key !== "Enter" && ev.key !== " ") return;
        ev.preventDefault();
        open();
      });
    });

    /*
     * The placeholder IS the promise about what the other side will get, so it has to track
     * the field above it as it is typed — a stale mirror would be a lie you could read.
     */
    root.querySelectorAll("[data-mirrors]").forEach(box => {
      const src = root.querySelector(`[data-field="${box.dataset.mirrors}"]`);
      if (!src) return;
      src.addEventListener("input", () => {
        box.placeholder = src.value || box.dataset.emptyHint || "";
      });
      // typing in the mirror is what makes it diverge; say so the moment it happens
      box.addEventListener("input", () => {
        box.classList.toggle("pt-diverged", !!box.value.trim());
        const hint = box.parentElement?.querySelector(".pt-dlg-mirror-hint");
        if (hint) hint.textContent = t(box.value.trim() ? "dialog.mirrorDiverged" : "dialog.mirrorLinked");
      });
    });

    root.querySelector(".pt-dlg-cancel")?.addEventListener("click", () => this.close());

    root.querySelector(".pt-dlg-save")?.addEventListener("click", async () => {
      this.#capture(root);
      let ok = false;
      try {
        ok = await this.#save();
      } catch (err) {
        // an actor deleted under the window, or permission yanked mid-edit: say so and
        // leave the dialog open with the text still in it rather than dying quietly
        console.error("pentaryn-ties | saving a tie failed", err);
        ui.notifications.error(t("dialog.saveFailed"));
        return;
      }
      if (ok) {
        this.onSaved?.();
        this.close();
      }
    });
  }

  /** Write the source's side in full; seed the reverse without ever overwriting it. */
  async #save() {
    const { source, target, draft } = this;
    if (!source || !target || !draft) return false;
    if (source.id === target.id) {
      ui.notifications.warn(t("dialog.noSelfTie"));
      return false;
    }
    if (!source.isOwner) {
      ui.notifications.error(f("dialog.cannotWrite", { a: source.name }));
      return false;
    }

    // what MY side said before this save — the yardstick for "was the other side still linked?"
    const before = this.existing();
    const prevForward = { word: before?.word ?? "", notes: before?.notes ?? "" };

    const word = String(draft.word ?? "").trim();
    const notes = String(draft.notes ?? "");
    const stance = clampStance(draft.stance);
    const strength = clampStrength(draft.strength);

    // ── my side: mine to set ──
    const mine = read(source);
    const keep = mine.filter(x => x.id !== target.id);
    keep.push({ id: target.id, name: target.name, word, notes, stance, strength });
    await write(source, keep);

    /*
     * ── their side ───────────────────────────────────────────────────────
     *
     * Whatever is in the mirror box, falling back to your text when it is empty. The render
     * put text in that box only when the other side had already diverged, so:
     *
     *   linked (blank box)    → they follow you, this save and every later one
     *   diverged (box filled) → their own text is written back unchanged
     *
     * No stored flag, and no way for the two to disagree about which state they are in.
     */
    let mirrored = "none";
    if (!target.isOwner) {
      /*
       * Not ours to write — ask a GM's client to do the reverse hop. Silent either way:
       * the player asked for a tie, not for a lecture about Foundry's permission model,
       * and there is nothing they could do about it if we told them.
       */
      const { requestMirror } = await import("./relay.mjs");
      requestMirror({ source, target });
    } else {
      const theirs = read(target);
      const rev = theirs.find(x => x.id === source.id);

      /*
       * Blank box means "keep following me" — but only if they still ARE following me.
       *
       * The box was rendered when the dialog opened. If the other side has been edited
       * since, by another client or from that actor's own sheet, a blank box would still
       * look linked and would overwrite prose this user never saw. So re-read at save time
       * and re-test against what MY side said BEFORE this save: still blank or still equal
       * means still linked; anything else has diverged behind our back and is left alone.
       */
      const linked = (theirs, prevMine) => {
        const v = String(theirs ?? "").trim();
        return !v || v === String(prevMine ?? "").trim();
      };
      /*
       * `seeded` is what the render put in the box. A box still holding it was never
       * touched — so we must write back what the OTHER SIDE says NOW, not the text we
       * rendered, or a diverged side edited elsewhere while this window sat open would be
       * silently rolled back to whatever it said when the dialog opened.
       */
      const resolve = (box, seeded, mineNow, revNow, prevMine) => {
        const typed = String(box ?? "");
        const wasSeeded = !!String(seeded ?? "").trim();
        const untouched = typed === String(seeded ?? "");
        // typed something new: diverge, or set a side that had none
        if (typed.trim() && !untouched) return { value: typed, followed: false };
        // left the box exactly as rendered: their text stands, whatever it says NOW
        if (untouched && wasSeeded) return { value: revNow, followed: false };
        /*
         * EMPTIED a box that had their diverged text in it. This is the re-link gesture the
         * README documents and the reason the override button was dropped — and it used to
         * fall through every branch to "leave it alone", so clearing the box did nothing at
         * all and the only way back was retyping the forward text by hand.
         */
        if (!typed.trim() && wasSeeded) return { value: mineNow, followed: true };
        if (linked(revNow, prevMine)) return { value: mineNow, followed: true };
        return { value: revNow, followed: false }; // diverged behind our back; leave it alone
      };

      if (!rev) {
        theirs.push({
          id: source.id,
          name: source.name,
          word: String(draft.reverseWord ?? "").trim() || word,
          notes: String(draft.reverseNotes ?? "").trim() ? String(draft.reverseNotes) : notes,
          // stance and strength are copied at creation and never again — theirs from here
          stance,
          strength
        });
        await write(target, theirs);
        mirrored = "seeded";
      } else {
        const w = resolve(draft.reverseWord, draft.seededWord, word, rev.word, prevForward.word);
        const n = resolve(draft.reverseNotes, draft.seededNotes, notes, rev.notes, prevForward.notes);
        const changed = rev.word !== w.value || rev.notes !== n.value;
        if (changed) {
          rev.word = w.value;
          rev.notes = n.value;
          await write(target, theirs);
        }
        mirrored = changed ? "updated" : "kept";
      }
    }

    /*
     * No notification. The GM can see both sides in the dialog they just used, and the
     * player was never shown the other side to begin with — a line of chat about it would
     * only describe a thing they cannot act on. The window closing is the receipt.
     */
    void mirrored;

    return true;
  }

  /** Open one dialog at a time; a second call re-points the one already up. */
  static open({ clicked = null, clickedToken = null, source = null, target = null, onSaved = null } = {}) {
    const pool = [...(foundry.applications?.instances?.values?.() ?? [])];
    const existing = pool.find(w => w instanceof TieDialog);
    if (existing) {
      if (clicked) existing.repoint(clicked, clickedToken);
      else {
        existing.clickedToken = null;
        // a fresh ask: clear both halves first, or the dialog silently keeps aiming at
        // whoever the last token click locked in and opens pre-filled for the wrong pair
        existing.source = source ?? null;
        existing.sourceLocked = !!source;
        existing.target = target ?? null;
        existing.targetLocked = !!target;
        existing.targetScope = "all";
      }
      existing.draft = null;
      existing.onSaved = onSaved ?? existing.onSaved;
      existing.render(true);
      existing.bringToFront?.();
      return existing;
    }
    return new TieDialog({ clicked, clickedToken, source, target, onSaved }).render(true);
  }

  /** Re-aim an open dialog at another token, by the same rule the constructor used. */
  repoint(clicked, clickedToken = null) {
    this.clickedToken = clickedToken ?? null;
    this.sourceLocked = false;
    this.targetLocked = false;
    this.targetScope = "scene"; // re-aimed from a token: back to what is here and in sight
    this.#resolveFromClick(clicked);
  }
}
