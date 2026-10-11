/**
 * Inspect preview — the GM's test bench for everything an inspection and its follow-up studies
 * could hand a player, with fresh dice every click and **nothing written anywhere**.
 *
 * Why it exists: every real roll in this module is one-shot and permanent, so "what would they
 * actually see?" could only be answered by spending a character's attempt and resetting it
 * afterwards. That is fine for a single fact and useless for tuning a whole NPC — a house, its
 * four lore rows and a kind study is seven rolls to stage and seven resets to undo.
 *
 * What it rolls, in the order a player would meet them:
 *
 *   1. **Membership** — driven by the module's own planner (`planStep`) against in-memory copies
 *      of the ledgers, so only secret rungs roll, root → leaf, `auto` help grants without a roll,
 *      help-scale advantage applies, and a failure ends the Inspect click (the next click carries
 *      on with the other branches). Visible attributes (no entry, or not secret) are shown as seen.
 *   2. **Attribute lore** — in play the GM hands these over with "Mark as learned" (no roll); they
 *      are rolled here only as a ruling aid, flagged when membership was not identified this run.
 *   3. **Individual lore** — the subject's own rows.
 *   4. **Kind study** — graded 15/20/25 through the module's own `tierOf` and
 *      `composeStudyPayload`, so the text is byte-for-byte what the player would be given.
 *
 * The roller is either a real PC (their actual skill totals) or a hypothetical character built
 * from a level, an ability modifier and a proficiency level — "a competent level-12 character"
 * is the default, which is the question Joe asked: at best reasonable odds, what do they find?
 * Every row also shows the *chance* of passing and, for a chain, the chance of getting that far.
 *
 * ⚠ **GM only, and local only.** It is opened from a HUD button that is only drawn for a GM,
 * refuses to construct for anyone else, posts no chat, emits no socket message and calls no
 * document update. Dice are `Math.random` rather than `Roll` so not even Dice So Nice can show
 * a die on another screen. Safe to use mid-session with players connected.
 *
 * ## Two modes
 *
 * The window opens on **Player view** (`renderPlayerView`): every fact this subject could hand a
 * player who passed everything, drawn with the Known tab's own grant cards — identification
 * reveals in ladder order, attribute lore, individual lore, the kind study at tier 25. Under each
 * card the GM gets ONE ROW OF SWITCHES, one per player character (first name), plus "Share with
 * all". A switch is `factStatus` drawn as on/off: ON = passed or told, amber = held (waiting on
 * Deliver), OFF = none, OFF with a red edge = failed or locked. These are the only controls in
 * this window that WRITE, one click each, no dialog:
 *
 *   OFF (none/failed/locked) → `shareFact` for that PC, from the GM (over a failure: the prior row
 *                              is kept so a Forget gives the failure back)
 *   ON, told                 → `forgetFact` (undo the share)
 *   ON, passed               → nothing; a real roll cannot be un-learned (a kind rolled below tier
 *                              25 is the exception: the click tells them the rest)
 *   held                     → nothing; use Deliver
 *
 * ## Live
 *
 * While open in Player view the switches follow the ledgers with no GM action: `updateActor`
 * (subject/kind `beliefs` flag, PC `granted`/`studied`/`known` flags), `create/update/deleteSetting`
 * (`attributeBeliefs`, `attributeKnowledge`, the registry) and `updateToken` (an unlinked subject's
 * delta), debounced 150 ms. A ledger-only change patches the switches IN PLACE (focus and scroll
 * untouched); a structural one (lore rows, carried attributes, the registry, the PC roster)
 * re-renders the player view with its scroll position kept. Nothing re-renders in Simulate mode —
 * that would reroll the dice.
 *
 * **Simulate rolls** (`renderSimulate`) is the test bench described above, byte-for-byte as it
 * was before the player view existed — still read-only, still random, still Reroll.
 */

import { MODULE } from "./ties-api.mjs";
import { attributeIdsOf, describeAttribute, attributeLore, registry, knowledge } from "./attributes.mjs";
import {
  kindActorOf, studySkillFor, studyStateFor, composeStudyPayload, factStatus, shareFact, forgetFact
} from "./study.mjs";
import { grantCard, grantedHead } from "./known.mjs";
import { subjectFacts } from "./facts.mjs";
import {
  rollableLore, loreOfferable, loreOutcome, tierOf, studyOffsetOf, STUDY_OFFSET_FLAG, LORE_FLAG,
  planStep, identificationLadder, identifiedKey, holdResolved, combineAdvantage,
  ATTR_BELIEFS_SETTING, KNOWLEDGE_SETTING, REGISTRY_SETTING, touchesFlagScope, tablePCs, switchLabels
} from "./known-core.mjs";
import { CONCEAL_FLAG, concealFor, firstName } from "./core/rules.mjs";
import { readFlag } from "./lib/flags.mjs";
import { makeLog } from "./lib/log.mjs";

const log = makeLog(MODULE);

const { ApplicationV2 } = foundry.applications.api;

const d20 = () => 1 + Math.floor(Math.random() * 20);
const pb = level => 2 + Math.floor((Math.max(1, Math.min(20, level)) - 1) / 4);
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const pct = p => `${Math.round(Math.max(0, Math.min(1, p)) * 100)}%`;
/** d20 + mod ≥ dc. Ability checks have no automatic success or failure on a 20 or a 1. */
const chance = (mod, dc) => Math.max(0, Math.min(1, (21 - (dc - mod)) / 20));
const skillLabel = s => CONFIG.DND5E?.skills?.[s]?.label ?? s;

const PROF = { none: 0, prof: 1, expert: 2 };

const t = k => game.i18n.localize(`PENTARYN_TIES.${k}`);
const f = (k, data) => game.i18n.format(`PENTARYN_TIES.${k}`, data);

/** Debounce for live refreshes: a share or a cascade lands as several writes in a burst. */
const LIVE_MS = 150;

/** Subject/kind actor changes that touch ONLY the ledger — patch the switches, no re-render. */
const LEDGER_ONLY = new RegExp(`^(_id$|_stats\\.|flags\\.${MODULE.replace(/[-.]/g, "\\$&")}\\.(-=)?beliefs(\\.|$))`);

export class InspectPreview extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "pentaryn-inspect-preview-{id}",
    classes: ["pentaryn-inspect-preview"],
    window: { title: "Inspect preview (GM only)", icon: "fa-solid fa-flask", resizable: true },
    position: { width: 620, height: 720 }
  };

  /** @param {Actor} subject */
  static open(subject) {
    if (!game.user?.isGM) return null;
    if (!subject) return ui.notifications.warn("Hover or select a token to preview.");
    return new InspectPreview(subject).render(true);
  }

  constructor(subject, options = {}) {
    if (!game.user?.isGM) throw new Error(`${MODULE} | inspect preview is GM only`);
    super(options);
    this.subject = subject;
    // "player": what a player who passed everything sees, with the GM's per-PC switches.
    // "simulate": the dice bench, unchanged.
    this.mode = "player";
    this.specs = []; // per render: the fact descriptors the switches point at
    this.pcKey = ""; // the PC roster the last player view was drawn for
    this.busy = new Set(); // `${fact}:${pcId}` switches with a write in flight
    this.liveTimer = null;
    this.liveFull = false;
    this.liveHooks = null;
    this.keepScroll = false;
    this.roller = "hypo";
    this.level = 12;
    this.ability = 3;
    this.prof = "prof";
  }

  get title() {
    return `Inspect — ${this.subject?.name ?? "?"} (GM only)`;
  }

  /** The bonus this roller adds for a skill. */
  modFor(skill) {
    if (this.roller !== "hypo") {
      const pc = game.actors.get(this.roller);
      const total = pc?.system?.skills?.[skill]?.total;
      if (typeof total === "number") return total;
      // a real rollSkill on a skill this sheet lacks rolls nothing — say so rather than pass
      // the hypothetical bonus off as this PC's
      this.missingSkills?.add(skill);
    }
    return this.ability + pb(this.level) * PROF[this.prof];
  }

  rollerOptions() {
    return [{ id: "hypo", name: "Hypothetical character" }, ...this.playerCharacters().map(a => ({ id: a.id, name: a.name }))];
  }

  /**
   * The table's PCs — `rollerOptions` without the hypothetical row. The rule is known-core's
   * `tablePCs` (assigned characters; no transformed copies, piles or markers); this only reads
   * the documents into its plain shape.
   */
  playerCharacters() {
    const users = (game.users?.contents ?? []).map(u => ({ id: u.id, isGM: u.isGM, characterId: u.character?.id ?? null }));
    const players = (game.users?.contents ?? []).filter(u => !u.isGM);
    const actors = game.actors.filter(a => a.type === "character");
    const rows = actors.map(a => ({
      id: a.id,
      name: a.name,
      type: a.type,
      pile: !!game.itempiles?.API?.isValidItemPile?.(a),
      polymorphed: a.getFlag?.("dnd5e", "isPolymorphed") === true,
      playerOwnerIds: players.filter(u => a.testUserPermission(u, "OWNER")).map(u => u.id)
    }));
    const keep = new Set(tablePCs(rows, users).map(r => r.id));
    const pcs = actors.filter(a => keep.has(a.id));
    const labels = switchLabels(pcs.map(a => a.name));
    this.pcLabels = new Map(pcs.map((a, i) => [a.id, labels[i]]));
    return pcs;
  }

  /**
   * Everything rolled, structured. Pure apart from the dice.
   *
   * Membership drives the module's own planner (`planStep`) against an **in-memory** copy of the
   * ledgers, exactly as `runCascade` drives it against the real ones — so ladder order, secret-only
   * rungs, uncarried/dangling/cyclic parents, `auto` help, advantage and stop-on-fail all come from
   * the same code the player meets, not from a re-implementation of it. Nothing is written.
   */
  async simulate() {
    const subject = this.subject;
    this.missingSkills = new Set();
    const pc = this.roller !== "hypo" ? game.actors.get(this.roller) : null;
    const characterId = pc?.id ?? "#preview";
    const reg = registry();
    const regById = new Map(reg.map(e => [e.id, e]));
    const carried = attributeIdsOf(subject, kindActorOf);
    // visible = not a question to the planner: no registry entry, or an entry that is not secret
    const free = carried.filter(id => !regById.get(id)?.secret).map(id => describeAttribute(id));

    // the two ledgers, simulated. A PC brings their real world knowledge (including permanent
    // failures); the hypothetical knows nothing. Beliefs start empty: a fresh look at this subject.
    const know = pc ? foundry.utils.deepClone(knowledge()) : {};
    const beliefs = {};
    const rollerCarries = pc ? attributeIdsOf(pc, kindActorOf) : [];
    let holdDef = false;
    try { holdDef = game.settings.get(MODULE, "holdDefault") === true; } catch { /* unborn */ }
    let rule = "raw";
    try { rule = game.settings.get(MODULE, "advantageStacking") === "net" ? "net" : "raw"; } catch { /* unborn */ }

    const conceal = id => concealFor(readFlag(subject, MODULE, CONCEAL_FLAG), id);
    const reach = new Map(); // attr id → chance of having identified it
    const priorOf = id => {
      const ladder = identificationLadder(id, reg);
      const i = ladder.indexOf(id);
      return i > 0 ? reach.get(ladder[i - 1]) ?? 1 : 1;
    };

    const gestures = []; // each: the rungs one Inspect click resolves, ending at a failure
    const passed = new Set();
    for (let g = 0; g < 12; g++) {
      const rows = [];
      for (let guard = 0; guard < 24; guard++) {
        const step = planStep({ registry: reg, carried, knowledge: know, beliefs, characterId, rollerCarries });
        if (step.done) break;
        const id = step.roll ?? step.grant;
        const entry = step.entry;
        const shown = describeAttribute(id);
        const hold = holdResolved(entry.hold, holdDef);
        let r;
        if (step.roll) {
          const dc = entry.dc + conceal(id);
          const mod = this.modFor(entry.skill);
          const adv = combineAdvantage(step.advantage ? 1 : 0, 0, rule) === "advantage";
          const die = adv ? Math.max(d20(), d20()) : d20();
          const p1 = chance(mod, dc);
          const p = adv ? 1 - (1 - p1) ** 2 : p1;
          const pass = die + mod >= dc;
          r = { entry: shown, dc, mod, die, total: die + mod, pass, p, adv, skill: entry.skill };
        } else {
          r = { entry: shown, auto: true, pass: true, p: 1, skill: entry.skill, bypass: !!step.bypass };
        }
        r.cumulative = r.p * priorOf(id);
        reach.set(id, r.cumulative);
        // a failure hands over the written failure line, or nothing when it is empty (2026-10-08)
        r.text = r.pass ? entry.reveal : (step.roll && String(entry.miss ?? "").trim() ? entry.miss : "");
        r.hold = hold && r.pass;
        // a pass with no reveal text records "" — which the real ledger reads as NOT carrying
        r.emptyPass = r.pass && !String(entry.reveal ?? "").trim();
        rows.push(r);
        // the same two writes runCascade makes, into the copies; a held rung is treated as
        // delivered so the preview can show what the GM's Deliver would resume into
        if (step.backfill) {
          know[characterId] ??= {};
          know[characterId][id] = { failed: !r.pass, via: "roll", when: 1, pending: false };
        }
        beliefs[characterId] ??= {};
        beliefs[characterId][identifiedKey(id)] = {
          text: r.pass ? entry.reveal ?? "" : "", tier: null, total: r.total ?? null, when: 1, delivered: 1
        };
        if (r.pass && !r.emptyPass) passed.add(id);
        if (!r.pass) break; // a failed rung ends the whole gesture, not just its branch
      }
      if (!rows.length) break;
      gestures.push(rows);
    }
    const unreached = carried.filter(id => regById.get(id)?.secret
      && !gestures.some(rows => rows.some(r => r.entry.id === id))).map(id => describeAttribute(id));
    const membership = { gestures, unreached };

    // attribute facts: offered by the GM's "Mark as learned" on every carried attribute (no roll,
    // no identification gate in the code) — rolled here only as a ruling aid, and flagged when
    // membership was not identified this run
    const attrLore = [];
    const open = new Set([...free.map(e => e.id), ...passed]);
    for (const id of carried) {
      // `loreOfferable`: a miss-only legacy row is never drawn as a button in play, so it is not rolled here
      const rows = rollableLore(attributeLore(id)).filter(loreOfferable);
      if (!rows.length) continue;
      attrLore.push({ entry: describeAttribute(id), locked: !open.has(id), rows: rows.map(row => this.rollLore(row)) });
    }

    const ownLore = rollableLore(readFlag(subject, MODULE, LORE_FLAG)).filter(loreOfferable).map(row => this.rollLore(row));

    // kind study
    let kind = null;
    const state = studyStateFor(pc, subject);
    const k = state.content ? state.kind : null;
    if (!k && state.kind) kind = { none: true, actor: state.kind };
    if (k) {
      const { skill, label } = studySkillFor(k);
      const off = studyOffsetOf(readFlag(k, MODULE, STUDY_OFFSET_FLAG));
      if (off === "auto") {
        kind = { actor: k, skill, auto: true, spent: state.spent, text: await composeStudyPayload(k, 25, label) };
      } else {
        const shift = typeof off === "number" ? off : 0;
        const mod = this.modFor(skill);
        const die = d20();
        const total = die + mod;
        const tier = tierOf(total, shift);
        kind = {
          actor: k, skill, mod, die, total, tier, shift, spent: state.spent,
          odds: [15, 20, 25].map(t => ({ t, p: chance(mod, t + shift) })),
          text: await composeStudyPayload(k, tier, label)
        };
      }
    }
    return { free, membership, attrLore, ownLore, kind };
  }

  rollLore(row) {
    const mod = this.modFor(row.skill);
    const die = d20();
    const total = die + mod;
    const out = loreOutcome(row, total) ?? { pass: false, text: "" };
    return { row, mod, die, total, dc: row.dc, pass: out.pass, text: out.text, p: chance(mod, row.dc) };
  }

  /* ------------------------------------------ render */

  async _renderHTML() {
    const body = this.mode === "simulate" ? await this.renderSimulate() : await this.renderPlayerView();
    return this.modeBar() + body;
  }

  modeBar() {
    const b = (mode, icon, label) => `<button type="button" data-mode="${mode}" class="${this.mode === mode ? "active" : ""}"
      aria-pressed="${this.mode === mode}"><i class="fa-solid ${icon}"></i> ${esc(label)}</button>`;
    return `<nav class="pv-mode">${b("player", "fa-book-open-reader", t("known.share.modePlayer"))}${b("simulate", "fa-dice-d20", t("known.share.modeSimulate"))}</nav>`;
  }

  /** The simulate-rolls body — the original preview, unchanged. */
  async renderSimulate() {
    const sim = await this.simulate();
    const opt = this.rollerOptions().map(o => `<option value="${o.id}" ${o.id === this.roller ? "selected" : ""}>${esc(o.name)}</option>`).join("");
    const levels = Array.from({ length: 20 }, (_, i) => i + 1).map(l => `<option ${l === this.level ? "selected" : ""}>${l}</option>`).join("");
    const abil = [-1, 0, 1, 2, 3, 4, 5].map(m => `<option value="${m}" ${m === this.ability ? "selected" : ""}>${m >= 0 ? "+" : ""}${m}</option>`).join("");
    const profs = [["none", "Not proficient"], ["prof", "Proficient"], ["expert", "Expertise"]]
      .map(([v, l]) => `<option value="${v}" ${v === this.prof ? "selected" : ""}>${l}</option>`).join("");
    const hypo = this.roller === "hypo";
    const bonus = this.ability + pb(this.level) * PROF[this.prof];

    const badge = r => r.pass
      ? `<span class="pv-pass"><i class="fa-solid fa-check"></i> pass</span>`
      : `<span class="pv-fail"><i class="fa-solid fa-xmark"></i> fail</span>`;
    const dice = r => `<span class="pv-dice">${r.die} ${r.mod >= 0 ? "+" : "−"} ${Math.abs(r.mod)} = <b>${r.total}</b> vs DC ${r.dc}</span>`;
    const said = (text, pass) => text?.trim()
      ? `<blockquote class="${pass ? "pv-true" : "pv-false"}">${esc(text)}</blockquote>`
      : `<p class="pv-silent">${pass
        ? "(pass, but no reveal text — nothing handed over; the ledger records it as a miss)"
        : "(fail, no failure text written — nothing handed over; the failure is recorded)"}</p>`;

    let html = `<section class="pv-controls">
      <label>Roller <select data-k="roller">${opt}</select></label>
      ${hypo ? `<label>Level <select data-k="level">${levels}</select></label>
      <label>Ability <select data-k="ability">${abil}</select></label>
      <label><select data-k="prof">${profs}</select></label>
      <span class="pv-bonus">= +${bonus} to every check</span>` : `<span class="pv-bonus">uses this PC's real skill totals</span>`}
      <button type="button" data-action="reroll"><i class="fa-solid fa-dice-d20"></i> Reroll</button>
    </section>
    <p class="pv-note"><i class="fa-solid fa-eye-slash"></i> Only you see this. Nothing is rolled to chat and nothing is saved.</p>`;

    html += `<h3>1 · Inspect: who they belong to</h3>`;
    const { gestures, unreached } = sim.membership;
    if (!gestures.length && !unreached.length && !sim.free.length) html += `<p class="pv-silent">Carries nothing to identify.</p>`;
    gestures.forEach((rows, i) => {
      html += `<div class="pv-chain">${gestures.length > 1
        ? `<p class="pv-note">${i === 0 ? "First Inspect click" : `Inspect click ${i + 1} (a failure ends a click; the next click carries on with the other branches)`}</p>` : ""}`;
      for (const r of rows) {
        const how = r.auto
          ? `<span class="pv-dice">no roll — ${r.bypass ? "they carry it too" : "help scale is auto"}</span>`
          : `${dice(r)}${r.adv ? ` <span class="pv-dice">(advantage)</span>` : ""}`;
        html += `<div class="pv-row">
          <div class="pv-head"><img src="${esc(r.entry.icon)}"><b>${esc(r.entry.title)}</b> <span class="pv-skill">${esc(skillLabel(r.skill))}</span>
          ${how} ${badge(r)}
          <span class="pv-odds" data-tooltip="chance this rung passes · chance of getting this far">${pct(r.p)} · ${pct(r.cumulative)}</span></div>
          ${r.hold ? `<p class="pv-note">Held: waits for your Deliver before the player sees it or the climb continues.</p>` : ""}
          ${r.emptyPass ? `<p class="pv-silent">(pass, but no reveal text — the ledger records this as NOT carrying, and every rung beneath it is blocked)</p>` : said(r.text, r.pass)}</div>`;
      }
      html += `</div>`;
    });
    if (unreached.length) html += `<p class="pv-silent">Never reached: ${unreached.map(e => esc(e.title)).join(" · ")} (blocked by a failed or empty rung above, a permanent failure, or a rung the subject does not carry)</p>`;
    if (sim.free.length) html += `<p class="pv-free">Seen without a roll: ${sim.free.map(e => esc(e.title)).join(" · ")}</p>`;

    html += `<h3>2 · Facts about what they belong to</h3>
    <p class="pv-note">In play these are handed over by your "Mark as learned" on the Attributes tab — no player roll, pass text only. Dice here are a ruling aid if you choose to roll at the table.</p>`;
    if (!sim.attrLore.length) html += `<p class="pv-silent">No lore rows on their attributes.</p>`;
    for (const g of sim.attrLore) {
      html += `<h4><img src="${esc(g.entry.icon)}"> ${esc(g.entry.title)} ${g.locked ? `<span class="pv-locked"><i class="fa-solid fa-lock"></i> membership not identified this run</span>` : ""}</h4>`;
      html += g.rows.map(r => this.loreRow(r, g.locked, badge, dice, said)).join("");
    }

    html += `<h3>3 · Known tab: facts about ${esc(this.subject.name)}</h3>`;
    html += sim.ownLore.length ? sim.ownLore.map(r => this.loreRow(r, false, badge, dice, said)).join("")
      : `<p class="pv-silent">No individual lore rows.</p>`;

    html += `<h3>4 · Known tab: studying what they are</h3>`;
    const k = sim.kind;
    if (!k) html += `<p class="pv-silent">No kind to study.</p>`;
    else if (k.none) html += `<p class="pv-silent">No study offered: ${esc(k.actor.name)} has no biography, tier text or attacks, so the Known tab draws no study icon.</p>`;
    else if (k.auto) html += `${k.spent ? `<p class="pv-note">This PC has already studied it — the real button is spent.</p>` : ""}<p>${esc(k.actor.name)} is common knowledge: no roll, top tier.</p>${said(k.text, true)}`;
    else {
      if (k.spent) html += `<p class="pv-note">This PC has already studied it — the real button is spent.</p>`;
      html += `<div class="pv-row"><div class="pv-head"><img src="${esc(k.actor.img)}"><b>${esc(k.actor.name)}</b> <span class="pv-skill">${esc(skillLabel(k.skill))}</span>
        <span class="pv-dice">${k.die} ${k.mod >= 0 ? "+" : "−"} ${Math.abs(k.mod)} = <b>${k.total}</b></span>
        <span class="${k.tier >= 15 ? "pv-pass" : "pv-fail"}">tier ${k.tier}${
          // below 15 is a failure: nothing at all, unless the GM authored rung 0 (the one lie)
          k.tier < 15 && k.text?.trim() ? " · fail — rung-0 lie delivered" : ""}</span>
        <span class="pv-odds">${k.odds.map(o => `${o.t}${k.shift ? `(DC ${o.t + k.shift})` : ""}: ${pct(o.p)}`).join(" · ")}</span></div>
        <details ${k.tier >= 15 ? "" : "open"}><summary>What they would be told</summary>${said(k.text, k.tier >= 15)}</details></div>`;
    }
    if (this.missingSkills?.size)
      html = `<p class="pv-silent">This PC's sheet has no ${[...this.missingSkills].map(x => esc(skillLabel(x))).join(", ")}: a real roll would not happen. Those rows use the hypothetical bonus instead.</p>` + html;
    html += `<p class="pv-note">Player-declared advantage and situational bonuses (individual lore, kind study) are not modelled: those rows roll flat. Membership advantage comes from the attribute's help scale, as in play.</p>`;
    return html;
  }

  /* ------------------------------------------ player view */

  /**
   * What a player who passed every check would have on their Known tab for this subject, in the
   * order they would meet it — drawn with the Known tab's own grant cards (`grantCard`) — with the
   * GM's per-PC switch row under each. Reads only; a switch click writes.
   */
  async renderPlayerView() {
    const subject = this.subject;
    const pcs = this.playerCharacters();
    this.pcKey = pcs.map(pc => pc.id).join(",");
    this.specs = [];
    /*
     * Which facts, in what order, under what key: `subjectFacts` → known-core's `factOrder`, the
     * same list the player's Look window (`look.mjs`) filters by their `granted` map. Shared so the
     * two can never disagree about order or keys. Everything drawn below — the authored reveal,
     * the row text, the notes, the switches — stays here: it is GM-plane, and the shared list
     * deliberately carries none of it. `onBase: false` keeps this window reading the document it
     * was opened on, as it did before the list was shared.
     */
    const { registry: reg, carried, facts } = subjectFacts(subject, { onBase: false });
    const regById = new Map(reg.map(e => [e.id, e]));
    const free = carried.filter(id => !regById.get(id)?.secret).map(id => describeAttribute(id));
    const ownRows = new Map(rollableLore(readFlag(subject, MODULE, LORE_FLAG)).map(row => [row.id, row]));

    const groups = [];
    const idCards = facts.filter(x => x.group === "ident").map(x => {
      const e = describeAttribute(x.attrId);
      const reveal = String(e.reveal ?? "");
      const note = x.parentId ? f("known.share.afterParent", { parent: describeAttribute(x.parentId).title }) : null;
      return this.factCard({ icon: e.icon, source: e.title, text: reveal }, { ns: "ident", subjectId: subject.id, attrId: x.attrId }, pcs, {
        blank: !reveal.trim() ? t("known.share.blankReveal") : null, note
      });
    });
    if (idCards.length) groups.push([t("known.share.groupIdent"), idCards]);

    const attrCards = [];
    for (const x of facts.filter(x => x.group === "attr")) {
      const e = describeAttribute(x.attrId);
      const row = attributeLore(x.attrId).find(r => r.id === x.factId);
      if (!row) continue;
      attrCards.push(this.factCard(
        { icon: e.icon, source: `${e.title} — ${row.label}`, text: row.text },
        { ns: "attr", subjectId: subject.id, attrId: x.attrId, factId: x.factId }, pcs,
        { blank: !row.text.trim() ? t("known.share.blankText") : null,
          note: x.secret ? f("known.share.secretLore", { name: subject.name, attr: e.title }) : null }
      ));
    }
    if (attrCards.length) groups.push([t("known.share.groupAttr"), attrCards]);

    const ownCards = facts.filter(x => x.group === "lore").map(x => ownRows.get(x.factId)).filter(Boolean).map(row => this.factCard(
      { icon: subject.img, source: row.label, text: row.text },
      { ns: "lore", subjectId: subject.id, factId: row.id }, pcs,
      { blank: !row.text.trim() ? t("known.share.blankText") : null }
    ));
    if (ownCards.length) groups.push([f("known.share.groupLore", { name: subject.name }), ownCards]);

    const state = studyStateFor(null, subject);
    const kind = state.kind ?? null;
    if (kind && state.content) {
      const text = await composeStudyPayload(kind, 25, state.skillLabel);
      // a separate kind actor's study files under the KIND's page on the Known tab, not this one's
      const kindLabel = kind.id !== subject.id ? f("known.share.groupKindPage", { kind: kind.name }) : t("known.share.groupKind");
      groups.push([kindLabel, [this.factCard(
        { icon: kind.img, source: kind.name, text }, { ns: "kind", subjectId: subject.id }, pcs,
        { note: studyOffsetOf(readFlag(kind, MODULE, STUDY_OFFSET_FLAG)) === "auto" ? t("known.share.kindAuto") : null }
      )]]);
    }

    const head = `<div class="pt-summary pv-entry-head">
      <img class="pt-portrait" src="${esc(subject.img || "icons/svg/mystery-man.svg")}" alt="" />
      <span class="pt-who"><span class="pt-name">${esc(subject.name)}</span>
      ${kind && kind.id !== subject.id ? `<span class="pt-known-kind">${esc(f("known.study.kindLine", { name: kind.name }))}</span>` : ""}</span>
    </div>`;

    let html = `<p class="pv-note"><i class="fa-solid fa-eye-slash"></i> ${esc(t("known.share.playerNote"))}</p>`;
    if (!pcs.length) html += `<p class="pv-silent">${esc(t("known.share.noPCs"))}</p>`;
    html += `<div class="pentaryn-ties pentaryn-known pv-player">${head}`;
    if (free.length) html += `<p class="pv-free">Seen without a roll: ${free.map(e => esc(e.title)).join(" · ")}</p>`;
    if (!groups.length) html += `<p class="pv-silent">${esc(t("known.share.nothing"))}</p>`;
    else {
      html += `<section class="pt-granted" aria-label="${esc(t("known.granted.label"))}">${grantedHead()}`;
      for (const [label, cards] of groups)
        html += `<h4 class="pv-group">${esc(label)}</h4><ul class="pt-granted-list">${cards.join("")}</ul>`;
      html += `</section>`;
    }
    return html + `</div>`;
  }

  /** One grant card plus the GM switch row. `blank` replaces the row: nothing there to share. */
  factCard(g, spec, pcs, { blank = null, note = null, textHTML = null } = {}) {
    const i = this.specs.push({ spec, label: g.source }) - 1;
    const extra = blank
      ? `<p class="pv-silent pv-gm">${esc(blank)}</p>`
      : `<div class="pv-gm">${note ? `<span class="pv-gm-note">${esc(note)}</span>` : ""}
          ${pcs.length ? this.switchRow(i, pcs) : ""}</div>`;
    return grantCard(blank ? { ...g, text: g.text || "—" } : g, { extra, textHTML });
  }

  /**
   * One PC on one fact, as a switch: `state` ∈ on | pending | failed | off, the tooltip that says
   * how they came to stand there, and what a click would do (`act` ∈ share | forget | raise |
   * rolled | held). Read fresh from the ledgers every time — never from the DOM.
   */
  switchState(spec, pc) {
    const st = factStatus(spec, pc);
    const name = this.pcLabels?.get(pc.id) ?? firstName(pc.name);
    const rolled = st.total != null ? f("known.share.rolled", { total: st.total, dc: st.dc ?? "?" }) : "";
    const tier = spec.ns === "kind" && st.tier != null ? f("known.share.sw.tier", { tier: st.tier }) : "";
    const by = st.from && st.from !== "gm" ? game.actors.get(st.from)?.name ?? null : null;
    let state = "off";
    let act = "share";
    let tip;
    switch (st.status) {
      case "passed":
        state = "on";
        // a kind held below the top tier is not "knows it all": the click tells them the rest
        act = spec.ns === "kind" && Number(st.tier ?? 0) < 25 ? "raise" : "rolled";
        tip = st.total != null
          ? f("known.share.sw.passed", { name, how: `${rolled}${tier}` })
          : f("known.share.sw.auto", { name });
        tip += ` · ${act === "raise" ? t("known.share.sw.clickRaise") : t("known.share.sw.clickRolled")}`;
        break;
      case "told":
        state = "on";
        act = "forget";
        tip = `${by ? f("known.share.sw.toldBy", { name, by }) : f("known.share.sw.told", { name })} · ${t("known.share.sw.clickForget")}`;
        break;
      case "held":
        state = "pending";
        act = "held";
        tip = `${f("known.share.sw.held", { name })}${rolled ? ` (${rolled}${tier})` : ""} · ${t("known.share.sw.clickHeld")}`;
        break;
      case "failed":
        state = "failed";
        tip = `${f("known.share.sw.failed", { name })}${rolled ? ` (${rolled}${tier})` : ""} · ${t("known.share.sw.clickOverride")}`;
        break;
      case "locked":
        state = "failed";
        tip = `${f("known.share.sw.locked", { name })} · ${t("known.share.sw.clickOverride")}`;
        break;
      default:
        tip = `${f("known.share.sw.none", { name })} · ${t("known.share.sw.clickShare")}`;
    }
    return { st, state, act, tip, name };
  }

  /** The switch row for fact `i`: a switch per PC, then "Share with all". */
  switchRow(i, pcs) {
    const { spec } = this.specs[i];
    const states = pcs.map(pc => ({ pc, s: this.switchState(spec, pc) }));
    const anyOff = states.some(x => x.s.act === "share");
    return `<div class="pv-switches" data-fact="${i}">
      ${states.map(({ pc, s }) => `<button type="button" role="switch" data-pc="${esc(pc.id)}"
          class="pv-sw pv-sw-${s.state}" aria-checked="${s.state === "on" || s.state === "pending"}"
          aria-label="${esc(s.tip)}" data-tooltip="${esc(s.tip)}"><span class="pv-slider"></span><span class="pv-sw-name">${esc(s.name)}</span></button>`).join("")}
      <button type="button" class="pv-share-all" data-action="share-all" ${anyOff ? "" : "disabled"}
        data-tooltip="${esc(t("known.share.sw.allTip"))}">${esc(t("known.share.sw.all"))}</button>
    </div>`;
  }

  /** Patch one switch in place — keeps its listener, its focus and the window's scroll. */
  applySwitch(btn, s) {
    btn.className = `pv-sw pv-sw-${s.state}`;
    btn.setAttribute("aria-checked", String(s.state === "on" || s.state === "pending"));
    btn.setAttribute("aria-label", s.tip);
    btn.dataset.tooltip = s.tip;
    const label = btn.querySelector(".pv-sw-name");
    if (label && label.textContent !== s.name) label.textContent = s.name;
  }

  /**
   * Re-read every switch from the ledgers. Returns false when the switches can no longer be
   * patched (the PC roster changed, a fact vanished) — the caller re-renders instead.
   */
  refreshSwitches() {
    if (this.mode !== "player" || !this.element) return true;
    if (this.playerCharacters().map(pc => pc.id).join(",") !== this.pcKey) return false;
    for (const row of this.element.querySelectorAll(".pv-switches[data-fact]")) {
      const i = Number(row.dataset.fact);
      const spec = this.specs[i]?.spec;
      if (!spec) return false;
      let anyOff = false;
      for (const btn of row.querySelectorAll(".pv-sw[data-pc]")) {
        const pc = game.actors.get(btn.dataset.pc);
        if (!pc) return false;
        const s = this.switchState(spec, pc);
        if (s.act === "share") anyOff = true;
        // a switch with its own write in flight keeps its optimistic look; it reconciles after
        if (!this.busy.has(`${i}:${pc.id}`)) this.applySwitch(btn, s);
      }
      const all = row.querySelector('[data-action="share-all"]');
      if (all && !this.busy.has(`${i}:*`)) all.disabled = !anyOff;
    }
    return true;
  }

  /** The optimistic look while a write is in flight: the switch shows where it is going. */
  optimistic(btn, state) {
    btn.classList.remove("pv-sw-on", "pv-sw-off", "pv-sw-failed", "pv-sw-pending");
    btn.classList.add(`pv-sw-${state}`, "pv-sw-busy");
    btn.setAttribute("aria-checked", String(state === "on"));
  }

  /** What a share did, said once. */
  reportShare(res, label) {
    const names = ids => ids.map(id => game.actors.get(id)?.name ?? id).join(", ");
    if (!res.ok) ui.notifications.warn(t(`known.share.skip.${res.reason}`));
    if (res.shared?.length) ui.notifications.info(f("known.share.done", { who: names(res.shared), fact: label }));
    if (res.skipped?.length)
      ui.notifications.warn(res.skipped.map(x => `${names([x.pcId])}: ${t(`known.share.skip.${x.reason}`)}`).join(" · "));
    if (res.unseen?.length) ui.notifications.info(f("known.share.unseen", { who: names(res.unseen), name: this.subject.name }));
  }

  /** One click on one switch. Decides from the ledger, not from what the switch looked like. */
  async onSwitch(i, pcId, btn) {
    const { spec, label } = this.specs[i] ?? {};
    const pc = game.actors.get(pcId);
    const key = `${i}:${pcId}`;
    if (!spec || !pc || this.busy.has(key)) return;
    const s = this.switchState(spec, pc);
    if (s.act === "rolled") return ui.notifications.info(f("known.share.sw.cantUnlearn", { name: s.name }));
    if (s.act === "held") return ui.notifications.info(f("known.share.sw.useDeliver", { name: s.name }));
    this.busy.add(key);
    this.optimistic(btn, s.act === "forget" ? "off" : "on");
    try {
      if (s.act === "forget") {
        const res = await forgetFact(spec, pc);
        if (!res.ok) ui.notifications.warn(t(`known.share.skip.${res.reason}`));
      } else this.reportShare(await shareFact(spec, [pc], { from: null, notify: true }), label);
    } catch (err) {
      log.error(`switch`, err);
      ui.notifications.error(String(err?.message ?? err));
    } finally {
      this.busy.delete(key);
      if (!this.refreshSwitches()) this.liveRender();
    }
  }

  /** "Share with all": every PC whose switch is OFF (none, failed, locked) — never a held one. */
  async shareAll(i, row) {
    const { spec, label } = this.specs[i] ?? {};
    if (!spec || this.busy.has(`${i}:*`)) return;
    const targets = this.playerCharacters().filter(pc => this.switchState(spec, pc).act === "share");
    if (!targets.length) return ui.notifications.info(t("known.share.allKnow"));
    const keys = [`${i}:*`, ...targets.map(pc => `${i}:${pc.id}`)];
    keys.forEach(k => this.busy.add(k));
    for (const pc of targets) {
      const btn = row.querySelector(`.pv-sw[data-pc="${pc.id}"]`);
      if (btn) this.optimistic(btn, "on");
    }
    try {
      this.reportShare(await shareFact(spec, targets, { from: null, notify: true }), label);
    } catch (err) {
      log.error(`share all`, err);
      ui.notifications.error(String(err?.message ?? err));
    } finally {
      keys.forEach(k => this.busy.delete(k));
      if (!this.refreshSwitches()) this.liveRender();
    }
  }

  /* ------------------------------------------ live */

  /** Re-render the player view, keeping the scroll position. Never in Simulate (it would reroll). */
  liveRender() {
    if (this.mode !== "player" || !this.rendered) return;
    this.keepScroll = true;
    this.render(); // no `force`: AppV2 neither maximises nor brings the window to front
  }

  /** Queue a refresh; `full` = the facts themselves may have changed, not just who knows them. */
  queueLive(full) {
    if (this.mode !== "player" || !this.rendered) return;
    this.liveFull ||= full;
    clearTimeout(this.liveTimer);
    this.liveTimer = setTimeout(() => {
      this.liveTimer = null;
      const fullNow = this.liveFull;
      this.liveFull = false;
      if (this.mode !== "player" || !this.rendered) return;
      if (fullNow || !this.refreshSwitches()) this.liveRender();
    }, LIVE_MS);
  }

  /**
   * Every place `factStatus` reads from, hooked:
   *   subject actor   flags.beliefs (ident + lore rows); anything else on it is structural
   *   kind actor      flags.beliefs (the kind study row); anything else is structural
   *   PC actors       flags.granted / studied / known, and the name on the switch
   *   world settings  attributeBeliefs (attribute lore), attributeKnowledge (stage-1 locks),
   *                   holdDefault; the registry (`attributes`) is structural
   *   tokens          an unlinked subject's delta (its own lore rows / attributes)
   */
  watch() {
    if (this.liveHooks) return;
    const settingKey = k => `${MODULE}.${k}`;
    const LEDGER_SETTINGS = new Set([settingKey(ATTR_BELIEFS_SETTING), settingKey(KNOWLEDGE_SETTING), settingKey("holdDefault")]);
    const onSetting = setting => {
      const key = setting?.key ?? "";
      if (key === settingKey(REGISTRY_SETTING)) this.queueLive(true);
      else if (LEDGER_SETTINGS.has(key)) this.queueLive(false);
    };
    const onActor = (actor, changes = {}) => {
      const subjectId = this.subject?.id;
      if (!subjectId || !actor) return;
      let kindId = null;
      try { kindId = kindActorOf(game.actors.get(subjectId) ?? this.subject)?.id ?? null; } catch { /* unborn */ }
      if (actor.id === subjectId || (kindId && actor.id === kindId)) {
        const keys = Object.keys(foundry.utils.flattenObject(changes ?? {}));
        return this.queueLive(!keys.every(k => LEDGER_ONLY.test(k)));
      }
      if (actor.type !== "character") return;
      const flat = Object.keys(foundry.utils.flattenObject(changes ?? {}));
      if (flat.some(k => k === "name" || touchesFlagScope(k, MODULE)))
        this.queueLive(false);
    };
    const onRoster = actor => {
      if (actor?.id === this.subject?.id) return this.queueLive(true);
      if (actor?.type === "character") this.queueLive(true);
    };
    const onToken = (token, changes = {}) => {
      if (token?.actorId === this.subject?.id && ("delta" in changes || "actorData" in changes)) this.queueLive(true);
    };
    const hooks = [
      ["updateActor", onActor],
      ["createActor", onRoster],
      ["deleteActor", onRoster],
      ["updateSetting", onSetting],
      ["createSetting", onSetting],
      ["deleteSetting", onSetting],
      ["updateToken", onToken]
    ];
    this.liveHooks = hooks.map(([name, fn]) => [name, Hooks.on(name, fn)]);
  }

  unwatch() {
    for (const [name, id] of this.liveHooks ?? []) Hooks.off(name, id);
    this.liveHooks = null;
    clearTimeout(this.liveTimer);
    this.liveTimer = null;
  }

  _onFirstRender(context, options) {
    super._onFirstRender?.(context, options);
    this.watch();
  }

  _onClose(options) {
    this.unwatch();
    return super._onClose?.(options);
  }

  loreRow(r, locked, badge, dice, said) {
    return `<div class="pv-row ${locked ? "pv-dim" : ""}">
      <div class="pv-head"><b>${esc(r.row.label)}</b> <span class="pv-skill">${esc(skillLabel(r.row.skill))}</span>
      ${dice(r)} ${badge(r)} <span class="pv-odds">${pct(r.p)}</span></div>${said(r.text, r.pass)}</div>`;
  }

  _replaceHTML(result, content) {
    // a live refresh keeps the GM's place; every other render (mode switch, Reroll) is as before
    const top = this.keepScroll ? content.scrollTop : null;
    this.keepScroll = false;
    content.innerHTML = result;
    if (top !== null) content.scrollTop = top;
    for (const btn of content.querySelectorAll("[data-mode]")) {
      btn.addEventListener("click", () => {
        if (this.mode === btn.dataset.mode) return;
        this.mode = btn.dataset.mode;
        this.render();
      });
    }
    for (const row of content.querySelectorAll(".pv-switches[data-fact]")) {
      const i = Number(row.dataset.fact);
      for (const btn of row.querySelectorAll(".pv-sw[data-pc]")) {
        btn.addEventListener("click", ev => {
          ev.preventDefault();
          ev.stopPropagation(); // the grant card's own click must not toggle under a switch
          this.onSwitch(i, btn.dataset.pc, btn);
        });
      }
      row.querySelector('[data-action="share-all"]')?.addEventListener("click", ev => {
        ev.preventDefault();
        ev.stopPropagation();
        this.shareAll(i, row);
      });
    }
    content.querySelector('[data-action="reroll"]')?.addEventListener("click", () => this.render());
    for (const sel of content.querySelectorAll("select[data-k]")) {
      sel.addEventListener("change", () => {
        const k = sel.dataset.k;
        this[k] = (k === "roller" || k === "prof") ? sel.value : Number(sel.value);
        this.render();
      });
    }
  }
}

export const openPreview = subject => InspectPreview.open(subject);
