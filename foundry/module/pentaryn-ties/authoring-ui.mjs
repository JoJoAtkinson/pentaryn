/**
 * The GM authoring section — phase 4's surface, on the studied actor's Ties tab.
 *
 * Three things a GM needs in one place, in the order they are reached for:
 *
 *   1. **Kind** — the pointer that says what this creature *is* (decision 4). One dropdown,
 *      absorbing phase 3's console-only `kindDialog`.
 *   2. **Lore rows** — what this *one* is (decision 8). The editor itself lives in
 *      `lore.mjs` and knows nothing about actors; this file is the half that does.
 *   3. **Beliefs** — what each character now holds as true (decision 12), with the Deliver
 *      control for anything the approval gate is holding. Deferred out of phase 3 by the
 *      build-and-validate cut list; this is where it lands.
 *
 * ## The gate
 *
 * `authoringHTML` returns `""` for a non-GM, and it checks that **itself** rather than
 * trusting a caller to. Same discipline as `inbound()` in `ties-api.mjs`: the gate lives with
 * the data, so no renderer can leak the section by forgetting to ask. There is a second,
 * independent refusal on every write below — a GM-only *view* is presentation, and phase 3's
 * conduit already established that presentation is never the boundary.
 *
 * ## What this section is honest about
 *
 * Everything authored here is world-flag content and therefore on every client (measured, not
 * assumed — decision 8). The warning the editor prints is not a disclaimer, it is the actual
 * operating rule: **nothing goes in a lore row that would ruin the game if read with
 * devtools.** Joe's ruling stands behind it — this is a friendly table, and the module's real
 * value is authored content that exists nowhere else, not a lock.
 */

import { MODULE } from "./ties-core.mjs";
import { LORE_FLAG, KIND_OF_FLAG, STUDY_TIERS_FLAG } from "./known-core.mjs";
import { loreEditorHTML, bindLoreEditor } from "./lore-ui.mjs";
import { beliefs, deliver, reset, kindActorOf, setKindOf, writeLoreRows } from "./study.mjs";
import { esc } from "./core/html.mjs";

const gmBadge = () =>
  `<span class="pt-gm-badge"><i class="fa-solid fa-eye-slash" aria-hidden="true"></i> ${esc(_loc("PENTARYN_TIES.gmOnly"))}</span>`;

/**
 * The kind dropdown.
 *
 * Only actors that could plausibly *be* a kind are offered — every world actor would be a
 * 136-row list on this campaign, most of them furniture. An actor already pointed at by
 * something, or carrying tier text, is a kind by evidence; everything else is offered under a
 * second group so a first pointer can still be made.
 */
function kindPicker(actor) {
  const current = actor.getFlag(MODULE, KIND_OF_FLAG) ?? "";
  // one pass over the world (ties-28): the candidates, and every actor something points at or
  // that has its own ladder — both in the world's order, as the two passes produced them
  const all = [];
  const evident = new Set();
  for (const a of game.actors?.contents ?? []) {
    if (a.id !== actor.id && a.type === "npc") all.push(a);
    const p = a.getFlag(MODULE, KIND_OF_FLAG);
    if (p) evident.add(p);
    if ((a.getFlag(MODULE, STUDY_TIERS_FLAG) ?? []).length) evident.add(a.id);
  }
  const opt = a => `<option value="${esc(a.id)}"${a.id === current ? " selected" : ""}>${esc(a.name)}</option>`;
  const known = all.filter(a => evident.has(a.id));
  const rest = all.filter(a => !evident.has(a.id));
  const resolved = kindActorOf(actor);

  return `<div class="pt-kind-picker">
    <label class="pt-field">
      <span class="pt-field-label">${esc(_loc("PENTARYN_TIES.authoring.kindLabel"))}</span>
      <select data-action="set-kind">
        <option value=""${current ? "" : " selected"}>${esc(_loc("PENTARYN_TIES.authoring.kindSelf", { name: actor.name }))}</option>
        ${known.length ? `<optgroup label="${esc(_loc("PENTARYN_TIES.authoring.kindKnown"))}">${known.map(opt).join("")}</optgroup>` : ""}
        ${rest.length ? `<optgroup label="${esc(_loc("PENTARYN_TIES.authoring.kindOther"))}">${rest.map(opt).join("")}</optgroup>` : ""}
      </select>
    </label>
    <p class="pt-hint">${esc(
      resolved.id === actor.id
        ? _loc("PENTARYN_TIES.authoring.kindHintSelf")
        : _loc("PENTARYN_TIES.authoring.kindHintPointed", { kind: resolved.name })
    )}</p>
  </div>`;
}

/** One belief line: who, what they were told, what bought it, and whether it has landed. */
function beliefRow(row) {
  const meta =
    row.ns === "kind"
      ? _loc("PENTARYN_TIES.authoring.beliefMetaKind", { tier: row.tier ?? "—", total: row.total ?? "—" })
      : _loc("PENTARYN_TIES.authoring.beliefMetaLore", { total: row.total ?? "—" });
  return `<li class="pt-belief${row.pending ? " pt-belief-pending" : ""}"
      data-character="${esc(row.characterId)}" data-ns="${esc(row.ns)}" data-fact="${esc(row.factId)}">
    <div class="pt-belief-head">
      <span class="pt-belief-who">${esc(row.character)}</span>
      <span class="pt-belief-fact">${esc(row.fact)}</span>
      <span class="pt-belief-meta">${esc(meta)}</span>
      ${
        // a failure hands the player nothing (2026-10), so the empty text box below cannot tell
        // a miss from a pass into an unauthored side — the verdict says it here
        row.pass === false ? `<span class="pt-belief-tag pt-belief-missed">${esc(_loc("PENTARYN_TIES.authoring.beliefMissed"))}</span>` : ""
      }
      ${row.pending ? `<span class="pt-belief-tag">${esc(_loc("PENTARYN_TIES.authoring.pending"))}</span>` : ""}
    </div>
    <div class="pt-belief-text">${
      String(row.text ?? "").trim() ? esc(row.text) : `<em>${esc(_loc("PENTARYN_TIES.authoring.beliefSilent"))}</em>`
    }</div>
    <div class="pt-belief-actions">
      ${
        row.pending
          ? `<button type="button" class="pt-textbtn" data-action="belief-deliver">
              <i class="fa-solid fa-paper-plane"></i> ${esc(_loc("PENTARYN_TIES.known.study.deliver"))}
            </button>`
          : `<span class="pt-belief-when">${esc(_loc("PENTARYN_TIES.authoring.delivered", { when: row.delivered }))}</span>`
      }
      <button type="button" class="pt-textbtn" data-action="belief-reset">
        <i class="fa-solid fa-rotate-left"></i> ${esc(_loc("PENTARYN_TIES.authoring.reset"))}
      </button>
    </div>
  </li>`;
}

/** The GM-only block. Empty string for everyone else — the gate is here, with the data. */
export function authoringHTML(actor) {
  if (game.user?.isGM !== true || !actor) return "";
  const rows = beliefs(actor);
  return `<section class="pt-authoring">
    <div class="pt-inbound-head">
      <span class="pt-inbound-title">${esc(_loc("PENTARYN_TIES.authoring.heading"))}</span>
      ${gmBadge()}
    </div>
    ${kindPicker(actor)}
    ${loreEditorHTML(actor.getFlag(MODULE, LORE_FLAG), `lore:${actor.id}`)}
    <div class="pt-group-head" role="heading" aria-level="3">
      <span class="pt-group-title">${esc(_loc("PENTARYN_TIES.authoring.beliefsHeading"))}</span>
    </div>
    <p class="pt-hint">${esc(_loc("PENTARYN_TIES.authoring.beliefsHint"))}</p>
    ${
      rows.length
        ? `<ul class="pt-list pt-belief-list">${rows.map(beliefRow).join("")}</ul>`
        : `<p class="pt-empty">${esc(_loc("PENTARYN_TIES.authoring.beliefsEmpty"))}</p>`
    }
  </section>`;
}

/** Wire it. Every handler re-checks GM itself — a rendered control is never an authorisation. */
export function bindAuthoring(root, actor, rerender = () => {}) {
  const section = root?.querySelector?.(".pt-authoring");
  if (!section || !actor || game.user?.isGM !== true) return;

  section.querySelector("[data-action='set-kind']")?.addEventListener("change", async ev => {
    await setKindOf(actor, ev.currentTarget.value);
    rerender();
  });

  bindLoreEditor(section, {
    key: `lore:${actor.id}`,
    // re-read at call time: the sheet can outlive the array it was painted from
    rows: () => actor.getFlag(MODULE, LORE_FLAG),
    // an empty list deletes the flag (writeLoreRows says why)
    save: async list => {
      await writeLoreRows(actor, list);
    },
    rerender
  });

  for (const li of section.querySelectorAll(".pt-belief")) {
    const character = game.actors?.get(li.dataset.character);
    const loreId = li.dataset.ns === "lore" ? li.dataset.fact : null;

    li.querySelector("[data-action='belief-deliver']")?.addEventListener("click", async () => {
      await deliver(character, actor, loreId);
      rerender();
    });

    li.querySelector("[data-action='belief-reset']")?.addEventListener("click", async () => {
      const go = await foundry.applications.api.DialogV2.confirm({
        window: { title: _loc("PENTARYN_TIES.authoring.resetTitle") },
        content:
          `<p>${esc(_loc("PENTARYN_TIES.authoring.resetBody", { character: character?.name ?? "?", actor: actor.name }))}</p>` +
          // decision 22, said where the GM is about to act on it rather than only in the plan
          `<p class="pt-hint">${esc(_loc("PENTARYN_TIES.authoring.resetKeeps"))}</p>`
      });
      if (!go) return;
      await reset(character, actor, loreId);
      rerender();
    });
  }
}
