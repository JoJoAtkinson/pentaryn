/**
 * The Attributes tab — phase 6's surface.
 *
 * Two audiences on one tab, and the split is decision 16's stated permission rule: **only the
 * GM can edit these; players can see them** and roll against them, but never edit the note
 * they were handed.
 *
 * ## The honesty rule this file exists to obey
 *
 * The edit affordance sits on an actor's attribute row, but what it edits is the **shared
 * registry entry**. A DC changed "on one orc's sheet" changes for every carrier — that is the
 * feature, and it is also exactly how a GM rewrites a world-wide DC while thinking about one
 * orc. Decision 16 requires the editor to say whose DC it is, so every editing surface here is
 * labelled *"Shared — every carrier of X"* and the row editor is mounted under that heading,
 * never inline in a way that reads as a per-actor field.
 *
 * The row editor itself is `lore.mjs`, mounted unchanged. That is decision 21 rule 3 paying
 * out: the same file that edits an NPC's lore rows edits an attribute's, because it never knew
 * what an actor was.
 */

import { MODULE } from "./ties-api.mjs";
import {
  registry,
  describeAttribute,
  attributesOf,
  attributeIdsOf,
  createAttribute,
  updateAttribute,
  deleteAttribute,
  linkAttribute,
  unlinkAttribute,
  searchAttributes,
  knownWorld,
  knowledgeTree,
  grantKnowledge,
  brokenAncestry,
  repairAncestry
} from "./attributes.mjs";
import { loreEditorHTML, bindLoreEditor } from "./lore.mjs";
import { kindActorOf, attrLoreStateFor, requestAttrLore } from "./study.mjs";
import { grantsForEntry, GRANTED_FLAG, HELP_SCALE, CARRIED_SCALE } from "./known-core.mjs";

const esc = s =>
  String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const t = k => game.i18n.localize(`PENTARYN_TIES.${k}`);
const f = (k, data) => game.i18n.format(`PENTARYN_TIES.${k}`, data);

export const ATTR_TAB_ID = "attributes";

/** Which rows are expanded, per actor — cosmetic, never persisted. */
const expanded = new Map();
const openFor = id => {
  if (!expanded.has(id)) expanded.set(id, new Set());
  return expanded.get(id);
};

const resolver = actor => kindActorOf(actor);

/**
 * What this viewer has been *told* about an attribute, joined at render.
 *
 * The same sibling-map join the Known entry uses (decision 15) — `attr:` grants land in the
 * viewer's own `granted` flag and are read-only wherever they appear.
 */
function grantsFor(viewer, attrId) {
  if (!viewer) return [];
  const raw = viewer.getFlag?.(MODULE, GRANTED_FLAG) ?? null;
  return grantsForEntry(raw, "", { attributeIds: [attrId] });
}

function grantedBlock(grants) {
  if (!grants.length) return "";
  return `<section class="pt-granted" aria-label="${esc(t("known.granted.label"))}">
    <div class="pt-granted-head">
      <i class="fa-solid fa-book-open-reader"></i>
      <span>${esc(t("known.granted.label"))}</span>
    </div>
    <ul class="pt-granted-list">
      ${grants
        .map(
          g => `<li class="pt-grant">
            ${g.icon ? `<img class="pt-grant-icon" src="${esc(g.icon)}" alt="">` : ""}
            <div class="pt-grant-body">
              ${g.source ? `<span class="pt-grant-source">${esc(g.source)}</span>` : ""}
              <div class="pt-grant-text">${esc(g.text)}</div>
            </div>
          </li>`
        )
        .join("")}
    </ul>
  </section>`;
}

/** The offers a player sees for one attribute — same idiom as the Known entry's lore rows. */
function offersBlock(actor, subject, attrId) {
  if (!actor?.isOwner) return "";
  const rows = attrLoreStateFor(actor, subject, attrId).filter(r => r.available);
  if (!rows.length) return "";
  return `<div class="pt-lore-offers">
    <div class="pt-lore-offers-head">
      <i class="fa-solid fa-magnifying-glass-plus" aria-hidden="true"></i>
      <span>${esc(t("known.lore.heading"))}</span>
    </div>
    <ul class="pt-lore-offer-list">
      ${rows
        .map(
          r => `<li>
            <button type="button" class="pt-textbtn pt-lore-btn" data-action="attr-roll"
                data-attr="${esc(attrId)}" data-lore="${esc(r.id)}"${r.gmOnline ? "" : " disabled"}
                data-tooltip="${esc(
                  r.gmOnline
                    ? f("known.lore.tip", { label: r.label, skill: r.skillLabel, dc: r.dc })
                    : t("known.study.noGMTip")
                )}">
              <span class="pt-lore-offer-label">${esc(r.label)}</span>
              <span class="pt-lore-offer-price">${esc(f("known.lore.price", { skill: r.skillLabel, dc: r.dc }))}</span>
            </button>
          </li>`
        )
        .join("")}
    </ul>
  </div>`;
}

function summary(row, isGM) {
  return `<div class="pt-summary pt-attr-summary" role="button" tabindex="0"
       aria-label="${esc(f("attributes.rowAria", { title: row.title }))}">
    <img class="pt-attr-icon" src="${esc(row.icon)}" alt="">
    <span class="pt-attr-title">${esc(row.title)}</span>
    ${row.category ? `<span class="pt-attr-category">${esc(row.category)}</span>` : ""}
    ${
      row.derived && !row.authored
        ? `<span class="pt-attr-tag pt-attr-derived" data-tooltip="${esc(t("attributes.derivedTip"))}">${esc(
            t("attributes.derived")
          )}</span>`
        : ""
    }
    ${
      isGM && row.advantage
        ? `<i class="fa-solid fa-dice-d20 pt-attr-adv" aria-label="${esc(t("attributes.grantsAdvantage"))}"
             data-tooltip="${esc(t("attributes.grantsAdvantage"))}"></i>`
        : ""
    }
    ${row.loreCount ? `<span class="pt-attr-count">${row.loreCount}</span>` : ""}
    <i class="fa-solid fa-chevron-down pt-caret" aria-hidden="true"></i>
  </div>`;
}

function detail(row, { actor, isGM, viewer }) {
  const grants = grantedBlock(grantsFor(viewer, row.id));
  const offers = offersBlock(viewer, actor, row.id);

  if (!isGM) {
    // a player sees what they were told and what is still on offer — and nothing else
    return `<div class="pt-detail pt-attr-detail">
      ${grants || offers ? "" : `<p class="pt-empty">${esc(t("attributes.playerEmpty"))}</p>`}
      ${grants}
      ${offers}
    </div>`;
  }

  return `<div class="pt-detail pt-attr-detail">
    ${grants}
    ${offers}
    ${
      row.authored
        ? `<div class="pt-fields pt-attr-fields">
            <label class="pt-field">
              <span class="pt-field-label">${esc(t("attributes.titleLabel"))}</span>
              <input type="text" data-attr-field="title" data-id="${esc(row.id)}" value="${esc(row.title)}">
            </label>
            <label class="pt-field">
              <span class="pt-field-label">${esc(t("attributes.categoryLabel"))}</span>
              <input type="text" data-attr-field="category" data-id="${esc(row.id)}" value="${esc(row.category)}">
            </label>
            <label class="pt-field">
              <span class="pt-field-label">${esc(t("attributes.whenKnownLabel"))}</span>
              <select data-attr-field="whenKnown" data-id="${esc(row.id)}">
                ${HELP_SCALE.map(
                  v => `<option value="${v}"${v === row.whenKnown ? " selected" : ""}>${esc(
                    t(`attributes.help.${v}`)
                  )}</option>`
                ).join("")}
              </select>
            </label>
            <label class="pt-field">
              <span class="pt-field-label">${esc(t("attributes.whenCarriedLabel"))}</span>
              <select data-attr-field="whenCarried" data-id="${esc(row.id)}">
                ${CARRIED_SCALE.map(
                  v => `<option value="${v}"${v === row.whenCarried ? " selected" : ""}>${esc(
                    t(`attributes.carried.${v}`)
                  )}</option>`
                ).join("")}
              </select>
            </label>
            <label class="pt-field pt-field-check">
              <input type="checkbox" data-attr-field="secret" data-id="${esc(row.id)}"${row.secret ? " checked" : ""}>
              <span>${esc(t("attributes.secretLabel"))}</span>
            </label>
          </div>
          <p class="pt-hint">${esc(t("attributes.helpHint"))}</p>
          <div class="pt-shared-head">
            <i class="fa-solid fa-globe" aria-hidden="true"></i>
            ${esc(f("attributes.sharedWarning", { title: row.title }))}
          </div>
          ${loreEditorHTML(row.lore, `attr:${row.id}`)}
          <div class="pt-detail-actions">
            <button type="button" class="pt-textbtn pt-del" data-action="attr-delete" data-id="${esc(row.id)}">
              <i class="fa-solid fa-trash"></i> ${esc(t("attributes.deleteEntry"))}
            </button>
            <button type="button" class="pt-textbtn" data-action="attr-unlink" data-id="${esc(row.id)}">
              <i class="fa-solid fa-link-slash"></i> ${esc(t("attributes.unlink"))}
            </button>
          </div>`
        : `<p class="pt-hint">${esc(f("attributes.unauthoredHint", { title: row.title }))}</p>
          <div class="pt-detail-actions">
            <button type="button" class="pt-textbtn" data-action="attr-author" data-id="${esc(row.id)}">
              <i class="fa-solid fa-feather"></i> ${esc(t("attributes.authorEntry"))}
            </button>
            <button type="button" class="pt-textbtn" data-action="attr-unlink" data-id="${esc(row.id)}">
              <i class="fa-solid fa-link-slash"></i> ${esc(
                row.derived ? t("attributes.suppress") : t("attributes.unlink")
              )}
            </button>
          </div>`
    }
  </div>`;
}

/**
 * `viewer` is whose knowledge is shown; `actor` is whose attributes are listed.
 *
 * On a character's own tab they are the same actor. On an NPC's tab a GM is looking at the
 * NPC's attributes, and there is no viewer whose grants make sense to show — so grants and
 * offers are simply absent there rather than borrowed from someone.
 */
/**
 * **What you know of the world** — the second half of the tab, and the payoff for a character who
 * invests in knowing things.
 *
 * A flat list grouped by category in v1; the tree *mechanic* ships (it is the gates), the tree
 * *rendering* is polish. Joe's own framing: *"this gives a place for the player to look at what
 * they learned of the world through the people they are interacting with."*
 *
 * ⚠ **Failed rows are GM-only, and this is not a nicety.** A marker on a player's view saying
 * *"you failed to learn about somewhere"* **names the somewhere** — which is precisely the
 * knowledge they failed to get. The GM needs to see shut branches before a scene; the player must
 * see nothing where they know nothing.
 */
function worldKnowledgeSection(character, isGM) {
  if (!character) return "";
  const forest = knowledgeTree(character, { forGM: isGM });
  const body = forest.length
    ? `<ul class="pt-list pt-world-tree">${forest.map(n => worldNode(n, isGM)).join("")}</ul>`
    : `<p class="pt-empty">${esc(t("attributes.worldEmpty"))}</p>`;

  return `<div class="pt-group-head" role="heading" aria-level="3">
      <span class="pt-group-title">${esc(t("attributes.worldHeading"))}</span>
    </div>
    <p class="pt-hint">${esc(t(isGM ? "attributes.worldHintGM" : "attributes.worldHint"))}</p>
    ${body}
    ${isGM ? grantControl(character) : ""}`;
}

/**
 * One node of the world tree, and its branch beneath it.
 *
 * The GM's version carries a **Tell them** button on anything not yet known, which is the whole
 * point of the view: open a city, see its districts and the guilds under them, and hand over the
 * one you meant without searching for its name.
 *
 * ⚠ A player's tree contains only `known` and `waypoint` nodes — `knowledgeTree` prunes the rest
 * away entirely rather than hiding them in markup, because a rendered list of what you do not
 * know describes the shape of what is missing.
 */
function worldNode(node, isGM) {
  const kids = node.children.length
    ? `<ul class="pt-world-branch">${node.children.map(c => worldNode(c, isGM)).join("")}</ul>`
    : "";
  const tag =
    node.state === "failed"
      ? `<span class="pt-attr-tag pt-state-failed">${esc(t("attributes.state.failed"))}</span>`
      : node.state === "pending"
        ? `<span class="pt-attr-tag pt-state-pending">${esc(t("attributes.state.pending"))}</span>`
        : node.state === "unknown"
          ? `<span class="pt-attr-tag pt-state-unknown">${esc(t("attributes.state.unknown"))}</span>`
          : "";
  const give =
    isGM && (node.state === "unknown" || node.state === "failed")
      ? `<button type="button" class="pt-textbtn pt-tell-btn" data-action="tell-one" data-id="${esc(node.id)}"
           data-tooltip="${esc(t("attributes.tellOneTip"))}">
          <i class="fa-solid fa-comment"></i> ${esc(t("attributes.tellOne"))}
        </button>`
      : "";

  return `<li class="pt-world-node pt-state-${esc(node.state ?? "known")}" data-id="${esc(node.id)}">
    <div class="pt-world-row">
      <img class="pt-attr-icon" src="${esc(node.icon)}" alt="">
      <span class="pt-attr-title">${esc(node.title)}</span>
      ${node.category ? `<span class="pt-attr-category">${esc(node.category)}</span>` : ""}
      ${tag}
      ${give}
    </div>
    ${kids}
  </li>`;
}

/**
 * The GM's disclosure control — and with research cut (R1d) this is the **only** route into a
 * character's knowledge that is not a blind roll. Travel, story, a library check the GM liked:
 * they all arrive here.
 *
 * Two modes, and they must not be one button:
 *
 *  · **"they know of this"** writes world knowledge and **does not** touch ancestors unless asked
 *  · **"they are this"** writes carriership, which materialises ancestors by definition (Q1)
 *
 * ⚠ The *share parents* box is not a convenience. A leaf granted alone is **inert for
 * identification** — stage 2 climbs the ladder, so a character who cannot place anyone's city can
 * never place anyone's guild. Granting the assassins' guild alone tells them it exists and nothing
 * more. The label says so, because a GM who does not know that will think the feature is broken.
 */
function grantControl(character) {
  return `<div class="pt-add-bar pt-attr-add pt-grant-control" data-character="${esc(character.id)}">
    <div class="pt-inbound-head">
      <span class="pt-inbound-title">${esc(t("attributes.grantHeading"))}</span>
      <span class="pt-gm-badge"><i class="fa-solid fa-eye-slash" aria-hidden="true"></i> ${esc(t("gmOnly"))}</span>
    </div>
    <input type="search" class="pt-attr-search pt-grant-search"
           placeholder="${esc(t("attributes.grantPlaceholder"))}"
           aria-label="${esc(t("attributes.grantPlaceholder"))}">
    <label class="pt-field pt-field-check">
      <input type="checkbox" class="pt-grant-parents" checked>
      <span>${esc(t("attributes.grantParents"))}</span>
    </label>
    <p class="pt-hint">${esc(t("attributes.grantParentsHint"))}</p>
    <div class="pt-attr-results pt-grant-results" hidden></div>
  </div>`;
}

/**
 * The invalid-ancestry banner — Joe's Q1 error made visible and fixable.
 *
 * Fails **open**: the planner stops at the gap rather than rolling a fact the data says is false,
 * so a broken sheet costs an unreachable membership and never a wrong answer. This exists so a GM
 * can see it, not to make the engine safe — the engine already is.
 */
function ancestryWarning(actor) {
  if (game.user?.isGM !== true) return "";
  const bad = brokenAncestry(actor, resolver);
  if (!bad.length) return "";
  const names = [...new Set(bad.map(b => describeAttribute(b.missing).title))].join(", ");
  return `<div class="pt-ancestry-warning">
    <div>${esc(f("attributes.ancestryBroken", { names }))}</div>
    <button type="button" class="pt-textbtn" data-action="attr-repair">
      <i class="fa-solid fa-wrench"></i> ${esc(t("attributes.ancestryFix"))}
    </button>
  </div>`;
}

export function buildAttributesHTML(actor, viewer = null) {
  const isGM = game.user?.isGM === true;
  const who = viewer ?? (actor?.type === "character" ? actor : null);
  const rows = attributesOf(actor, resolver, { viewer: who });
  const open = openFor(actor.id);

  const body = rows.length
    ? `<ul class="pt-list pt-attr-list">${rows
        .map(
          r => `<li class="pt-row pt-attr-row${open.has(r.id) ? " pt-open" : ""}" data-id="${esc(r.id)}">
            ${summary(r, isGM)}
            <div class="pt-detail-wrap"${open.has(r.id) ? "" : " hidden"}>${detail(r, {
              actor,
              isGM,
              viewer: who
            })}</div>
          </li>`
        )
        .join("")}</ul>`
    : `<p class="pt-empty">${esc(t("attributes.empty"))}</p>`;

  const add = isGM
    ? `<div class="pt-add-bar pt-attr-add">
        <input type="search" class="pt-attr-search" placeholder="${esc(t("attributes.searchPlaceholder"))}"
               aria-label="${esc(t("attributes.searchPlaceholder"))}">
        <div class="pt-attr-results" hidden></div>
      </div>`
    : "";

  return `<div class="pentaryn-ties pentaryn-attributes" data-actor-id="${esc(actor.id)}">
    ${ancestryWarning(actor)}
    <p class="pt-hint">${esc(isGM ? t("attributes.gmHint") : t("attributes.playerHint"))}</p>
    ${body}
    ${add}
    ${who ? worldKnowledgeSection(who, isGM) : ""}
  </div>`;
}

export function bindAttributes(root, actor, rerender = () => {}) {
  /*
   * ⚠ `root` **is** the `.pentaryn-attributes` element, not a wrapper around it.
   *
   * `injectOneTab` sets `section.innerHTML = spec.build(actor)` and then hands
   * `section.firstElementChild` to this function — which is the built div itself. A plain
   * `querySelector(".pentaryn-attributes")` searches *inside* that element, never matches the
   * element itself, and returned early **every single time**.
   *
   * The whole Attributes tab was therefore inert from the day it shipped: rows would not expand,
   * fields would not save, the rolls would not fire and the grant control did nothing. It went
   * unnoticed because every test drove the API directly rather than the UI — which is exactly
   * the class of bug only clicking finds.
   *
   * Accept either shape, so it cannot break again if a caller ever wraps it.
   */
  const box = root?.classList?.contains("pentaryn-attributes") ? root : root?.querySelector?.(".pentaryn-attributes");
  if (!box || !actor) return;
  const isGM = game.user?.isGM === true;
  const open = openFor(actor.id);
  const viewer = actor?.type === "character" ? actor : null;

  for (const head of box.querySelectorAll(".pt-attr-summary")) {
    const li = head.closest(".pt-row");
    const toggle = () => {
      const wrap = li.querySelector(".pt-detail-wrap");
      const nowOpen = !li.classList.contains("pt-open");
      li.classList.toggle("pt-open", nowOpen);
      wrap.hidden = !nowOpen;
      if (nowOpen) open.add(li.dataset.id);
      else open.delete(li.dataset.id);
    };
    head.addEventListener("click", toggle);
    head.addEventListener("keydown", ev => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        toggle();
      }
    });
  }

  /*
   * The roll. Same unconditional repaint contract as every other affordance in this module:
   * a pass, a failure and a held roll all leave this client looking identical — one fewer row
   * on offer, nothing else. A repaint conditional on the answer would BE the answer.
   */
  for (const btn of box.querySelectorAll("[data-action='attr-roll']")) {
    btn.addEventListener("click", async () => {
      btn.disabled = true; // one gesture, one roll
      await requestAttrLore(viewer, actor, btn.dataset.attr, btn.dataset.lore);
      rerender();
    });
  }

  if (!isGM) return; // everything below is authoring, and a player has none of it

  for (const el of box.querySelectorAll("[data-attr-field]")) {
    el.addEventListener("change", async () => {
      const field = el.dataset.attrField;
      const value = el.type === "checkbox" ? el.checked : el.value;
      await updateAttribute(el.dataset.id, { [field]: value });
      rerender();
    });
  }

  for (const id of new Set([...box.querySelectorAll(".pt-attr-row")].map(li => li.dataset.id))) {
    bindLoreEditor(box, {
      key: `attr:${id}`,
      rows: () => describeAttribute(id).lore,
      save: async list => updateAttribute(id, { lore: list }),
      rerender
    });
  }

  for (const btn of box.querySelectorAll("[data-action='attr-author']")) {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      const row = describeAttribute(id);
      // authoring a DERIVED id creates an entry with that exact id — nothing links, because
      // the link was never stored (decision 16). Every carrier is enriched at once.
      const list = registry();
      list.push({ id, title: row.title, category: row.category, icon: row.icon, advantage: !row.derived, lore: [] });
      await game.settings.set(MODULE, "attributes", list);
      open.add(id);
      rerender();
    });
  }

  for (const btn of box.querySelectorAll("[data-action='attr-unlink']")) {
    btn.addEventListener("click", async () => {
      await unlinkAttribute(actor, btn.dataset.id);
      rerender();
    });
  }

  for (const btn of box.querySelectorAll("[data-action='attr-delete']")) {
    btn.addEventListener("click", async ev => {
      ev.stopPropagation();
      const row = describeAttribute(btn.dataset.id);
      const go = await foundry.applications.api.DialogV2.confirm({
        window: { title: t("attributes.deleteTitle") },
        content:
          `<p>${esc(f("attributes.deleteBody", { title: row.title }))}</p>` +
          `<p class="pt-hint">${esc(t("attributes.deleteKeeps"))}</p>`
      });
      if (!go) return;
      await deleteAttribute(btn.dataset.id);
      rerender();
    });
  }

  bindSearch(box, actor, rerender);
  bindGrant(box, rerender);

  /*
   * "Tell them" straight off the tree — the fast path. Ancestors come with it, because a node
   * granted without them is inert for identification (see `grantKnowledge`).
   */
  for (const btn of box.querySelectorAll("[data-action='tell-one']")) {
    btn.addEventListener("click", async () => {
      const who = actor?.type === "character" ? actor : null;
      if (!who) return;
      btn.disabled = true;
      await grantKnowledge(who, btn.dataset.id, { withParents: true });
      rerender();
    });
  }

  box.querySelector("[data-action='attr-repair']")?.addEventListener("click", async () => {
    // repair = re-link each broken membership, which materialises what it already implied
    for (const { id } of brokenAncestry(actor, resolver)) await repairAncestry(actor, id);
    rerender();
  });
}

/** The GM's per-character disclosure control — the only non-roll route into world knowledge. */
function bindGrant(box, rerender) {
  const wrap = box.querySelector(".pt-grant-control");
  const input = wrap?.querySelector(".pt-grant-search");
  const results = wrap?.querySelector(".pt-grant-results");
  if (!wrap || !input || !results) return;
  const character = game.actors?.get(wrap.dataset.character);
  if (!character) return;

  const paint = () => {
    const { matches, canCreate } = searchAttributes(input.value, resolver);
    /*
     * ⚠ Only attributes they actually **know** are filtered out — never the ones they FAILED.
     *
     * `knownWorld(forGM)` returns failed rows too, so filtering on "has a row" hid exactly the
     * attributes a GM most needs this control for: a permanent failure is the whole reason to
     * hand something over. Worse, hiding the match left only **Create**, which silently made a
     * near-duplicate under a different id.
     *
     * A failed entry is offered and marked, because granting it is the release valve.
     */
    const rows = knownWorld(character, { forGM: true });
    const settled = new Map(rows.map(r => [r.attrId, r]));
    const hits = matches
      .filter(m => !(settled.has(m.id) && !settled.get(m.id).failed))
      .slice(0, 12)
      .map(m => {
        const failed = settled.get(m.id)?.failed === true;
        return `<button type="button" class="pt-attr-hit${failed ? " pt-attr-hit-failed" : ""}" data-id="${esc(m.id)}">
          <img src="${esc(m.icon)}" alt="">
          <span class="pt-attr-hit-title">${esc(m.title)}</span>
          ${failed ? `<span class="pt-attr-tag">${esc(t("attributes.theyFailedThis"))}</span>` : ""}
        </button>`;
      })
      .join("");
    const create =
      input.value.trim() && canCreate
        ? `<button type="button" class="pt-attr-hit pt-attr-create" data-create="1">
            <i class="fa-solid fa-plus"></i> ${esc(f("attributes.createOne", { title: input.value.trim() }))}
          </button>`
        : "";
    results.innerHTML = hits + create || `<p class="pt-hint">${esc(t("attributes.noMatches"))}</p>`;
    results.hidden = false;

    for (const b of results.querySelectorAll(".pt-attr-hit")) {
      b.addEventListener("click", async () => {
        const withParents = !!wrap.querySelector(".pt-grant-parents")?.checked;
        let id = b.dataset.id;
        if (b.dataset.create) {
          const made = await createAttribute(input.value.trim());
          id = made.ok ? made.entry.id : made.existing?.id;
        }
        if (id) await grantKnowledge(character, id, { withParents });
        input.value = "";
        rerender();
      });
    }
  };
  input.addEventListener("input", paint);
  input.addEventListener("focus", paint);
}

/** The autocomplete: one list of registry entries and every derived id present in the world. */
function bindSearch(box, actor, rerender) {
  const input = box.querySelector(".pt-attr-search");
  const results = box.querySelector(".pt-attr-results");
  if (!input || !results) return;

  const carried = new Set(attributeIdsOf(actor, resolver));

  const paint = () => {
    const { matches, canCreate, wouldBe, collidesWith } = searchAttributes(input.value, resolver);
    const rows = matches
      .filter(m => !carried.has(m.id))
      .slice(0, 12)
      .map(
        m => `<button type="button" class="pt-attr-hit" data-id="${esc(m.id)}">
          <img src="${esc(m.icon)}" alt="">
          <span class="pt-attr-hit-title">${esc(m.title)}</span>
          ${m.derived && !m.authored ? `<span class="pt-attr-tag">${esc(t("attributes.derived"))}</span>` : ""}
        </button>`
      )
      .join("");
    /*
     * Decision 18: creation past an existing id is refused and the existing entry offered
     * instead. The id is what decides, so "Yellow Stone" typed against an existing
     * `yellowstone` shows the collision rather than a Create button, whatever the titles look
     * like on screen.
     */
    const create =
      input.value.trim() && canCreate
        ? `<button type="button" class="pt-attr-hit pt-attr-create" data-create="1">
            <i class="fa-solid fa-plus"></i> ${esc(f("attributes.createOne", { title: input.value.trim() }))}
          </button>`
        : input.value.trim() && collidesWith && !carried.has(collidesWith.id)
          ? `<p class="pt-hint">${esc(f("attributes.collides", { title: collidesWith.title, id: wouldBe }))}</p>`
          : "";
    results.innerHTML = rows + create || `<p class="pt-hint">${esc(t("attributes.noMatches"))}</p>`;
    results.hidden = !input.value.trim() && !rows;

    for (const b of results.querySelectorAll(".pt-attr-hit")) {
      b.addEventListener("click", async () => {
        if (b.dataset.create) {
          const made = await createAttribute(input.value.trim());
          if (made.ok) await linkAttribute(actor, made.entry.id);
          else if (made.reason === "collision") await linkAttribute(actor, made.existing.id);
        } else {
          await linkAttribute(actor, b.dataset.id);
        }
        input.value = "";
        rerender();
      });
    }
  };

  input.addEventListener("input", paint);
  input.addEventListener("focus", paint);
}
